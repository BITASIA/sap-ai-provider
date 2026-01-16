#!/usr/bin/env npx tsx
/**
 * Documentation validation for SAP AI Provider.
 * Performs 14 checks: exports, links, models, ToC, versions, metrics, syntax, hierarchy.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { HeaderEntry, TocEntry } from "./markdown-utils.js";
import type { ValidationResult } from "./validation-utils.js";

import { parseArgsWithHelp } from "./cli-utils.js";
import { logError, logSection, logSuccess, logSummary, logWarning } from "./console-utils.js";
import {
  createFileExistsChecker,
  detectToc,
  detectTocIndentation,
  extractCodeBlocks,
  extractHeaders,
  extractTocEntries,
  fileExists,
  findMarkdownFiles,
  inferTocDepth,
  matchesFilePattern,
  readJsonFile,
  readMarkdownFile,
  readMarkdownFileWithCodeBlocks,
  readTextFile,
} from "./markdown-utils.js";
import {
  COVERAGE_TOLERANCE_PERCENT,
  CRITICAL_EXPORTS,
  DEFAULT_EXCLUDED_DIRS,
  DOTENV_CHECK_FILES,
  MODEL_CHECK_FILES,
  MODEL_VALIDATION_RULES,
  REGEX_PATTERNS,
  REQUIRED_FILES,
  SOURCE_FILES,
  VERSION_CHECK_FILES,
} from "./validation-config.js";
import {
  aggregateValidationResults,
  createValidationResult,
  finalizeValidationResult,
} from "./validation-utils.js";

/** package.json structure. */
interface PackageJson {
  [key: string]: unknown;
  /** Package version. */
  version: string;
}

/** ToC validation comparison result. */
interface TocValidationResult {
  /** Actual entries from ToC. */
  actualEntries: TocEntry[];
  /** Expected entries from headers. */
  expectedEntries: HeaderEntry[];
  /** Extra ToC entries. */
  extra: TocEntry[];
  /** Whether ToC exists. */
  hasToc: boolean;
  /** Mismatched entries. */
  mismatched: { actual: TocEntry; expected: HeaderEntry }[];
  /** Missing entries. */
  missing: HeaderEntry[];
  /** Inferred ToC depth. */
  tocDepth: number;
}

/** Excluded directories, initialized from defaults and extended via CLI args */
const EXCLUDED_DIRS: readonly string[] = (() => {
  const cliArgs = parseArgsWithHelp({
    defaultExcludeDirs: DEFAULT_EXCLUDED_DIRS,
    description: "SAP AI Provider - Documentation Validation",
    usageExamples: ["npm run validate-docs", "npm run validate-docs -- --exclude-dirs dir1,dir2"],
  });
  return [...DEFAULT_EXCLUDED_DIRS, ...cliArgs.excludeDirs];
})();

/** Test metrics from npm test. */
interface TestMetrics {
  /** Coverage percentage. */
  coverage?: number;
  /** Whether tests passed. */
  passed: boolean;
  /** Total test count. */
  totalTests: number;
}

/**
 * Extracts coverage % from test output.
 *
 * @param output - npm test output
 * @returns Coverage percentage or null
 */
function extractCoverage(output: string): null | number {
  const allFilesMatch =
    /All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/.exec(output);
  if (allFilesMatch) {
    return Number.parseFloat(allFilesMatch[1]);
  }
  return null;
}

/**
 * Extracts test count from Vitest/Jest output.
 *
 * @param output - Test runner output
 * @returns Total test count or null
 */
function extractTestCount(output: string): null | number {
  const clean = output.replace(REGEX_PATTERNS.ANSI_COLORS, "");

  const vitestMatch = /Tests\s+(\d+)\s+passed\s+\((\d+)\)/.exec(clean);
  if (vitestMatch) {
    return Number.parseInt(vitestMatch[2], 10);
  }

  const jestMatch = /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/.exec(clean);
  if (jestMatch) {
    return Number.parseInt(jestMatch[2], 10);
  }

  return null;
}

/**
 * Extracts comments (JSDoc, block, inline) from TypeScript.
 *
 * @param filePath - Path to .ts file
 * @returns Comments with 1-based line numbers
 */
function extractTypeScriptComments(filePath: string): {
  content: string;
  lineNumber: number;
}[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const comments: { content: string; lineNumber: number }[] = [];

  let inBlockComment = false;
  let currentBlock: string[] = [];
  let blockStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const oneLineJSDoc = REGEX_PATTERNS.JSDOC_ONE_LINER.exec(line);
    if (oneLineJSDoc && !inBlockComment) {
      comments.push({
        content: oneLineJSDoc[0],
        lineNumber: i + 1,
      });

      const lineWithoutOneLiner = line.replace(oneLineJSDoc[0], "");
      const trimmedRest = lineWithoutOneLiner.trim();

      if (REGEX_PATTERNS.BLOCK_COMMENT_START.test(trimmedRest)) {
        inBlockComment = true;
        blockStartLine = i + 1;
        currentBlock = [lineWithoutOneLiner];
        continue;
      }
    }

    if (!inBlockComment && REGEX_PATTERNS.BLOCK_COMMENT_START.test(trimmed)) {
      inBlockComment = true;
      blockStartLine = i + 1;
      currentBlock = [line];
      continue;
    }

    if (inBlockComment) {
      currentBlock.push(line);
      if (trimmed.endsWith("*/")) {
        inBlockComment = false;
        comments.push({
          content: currentBlock.join("\n"),
          lineNumber: blockStartLine,
        });
        currentBlock = [];
      }
      continue;
    }

    const inlineCommentMatch = REGEX_PATTERNS.INLINE_COMMENT.exec(line);
    if (inlineCommentMatch) {
      comments.push({
        content: inlineCommentMatch[0],
        lineNumber: i + 1,
      });
    }
  }

  return comments;
}

/**
 * Checks if line contains inline code with markdown links.
 *
 * @param line - Line to check
 * @returns True if has `[...](...)`
 */
function hasInlineCodeExample(line: string): boolean {
  return line.includes("`[") && line.includes("](");
}

/**
 * CLI entry point.
 * Runs all 14 validation checks and reports results with exit codes.
 */
function main(): void {
  logSection("📚 SAP AI Provider - Documentation Validation");
  console.log("");

  const allResults: ValidationResult[] = [];

  try {
    allResults.push(validatePublicExportsDocumented());
    allResults.push(validateInternalLinks());
    allResults.push(validateModelLists());
    allResults.push(validateModelIdFormats());
    allResults.push(validateDotenvImports());
    allResults.push(validateLinkFormat());
    allResults.push(validateRequiredFiles());
    allResults.push(validateTableOfContents());
    allResults.push(validateVersionConsistency());
    allResults.push(validateCodeMetrics());
    allResults.push(validateSourceCodeComments());
    allResults.push(validateHeadingHierarchySmart());
    allResults.push(validateCodeBlockSyntax());
    allResults.push(validateOrphanSections());
  } catch (error) {
    allResults.push({
      errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
      passed: false,
      warnings: [],
    });
  }

  const results = aggregateValidationResults(allResults);

  console.log("");
  console.log("=".repeat(60));
  logSummary({ Errors: results.errors.length, Warnings: results.warnings.length });

  if (results.errors.length > 0) {
    logError("ERRORS:");
    results.errors.forEach((err) => {
      console.log(`  • ${err}`);
    });
  }

  if (results.warnings.length > 0) {
    logWarning("WARNINGS:");
    results.warnings.forEach((warn) => {
      console.log(`  • ${warn}`);
    });
  }

  console.log("");
  if (results.errors.length === 0 && results.warnings.length === 0) {
    logSuccess("Documentation validation PASSED - No issues found!\n");
    process.exit(0);
  } else if (results.errors.length === 0) {
    logSuccess("Documentation validation PASSED with warnings");
    console.log("   Consider addressing warnings before release.\n");
    process.exit(0);
  } else {
    logError("Documentation validation FAILED");
    console.log("   Fix errors before proceeding with release.\n");
    process.exit(1);
  }
}

/**
 * Runs npm test:coverage and extracts metrics.
 *
 * @returns Test count and coverage or null
 */
function runCoverageCheck(): null | TestMetrics {
  try {
    const output = execSync("npm run test:coverage -- --passWithNoTests", {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: "pipe",
    });

    const totalTests = extractTestCount(output);
    const coverage = extractCoverage(output);

    if (totalTests === null) {
      return null;
    }

    return {
      coverage: coverage ?? undefined,
      passed: true,
      totalTests,
    };
  } catch {
    return null;
  }
}

/**
 * Check 13: Validates code block syntax.
 * Ensures markdown code blocks use correct fence syntax and language identifiers.
 *
 * @returns Validation result with errors for unclosed blocks and warnings for syntax issues
 */
function validateCodeBlockSyntax(): ValidationResult {
  const result = createValidationResult();
  console.log("\n1️⃣3️⃣  Checking code block syntax...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let issuesFound = 0;

  const metaDocFiles = ["openspec/", "AGENTS.md", ".github/copilot-instructions.md"];
  const metaLanguages = new Set(["javascript", "js", "markdown", "md", "ts", "typescript"]);

  for (const file of mdFiles) {
    const { lines } = readMarkdownFile(file);

    const isMetaDoc = matchesFilePattern(file, metaDocFiles);
    let inCodeBlock = false;
    let openingBackticks = 0;
    let openingLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = /^(`{3,})(\w*)/.exec(line);

      if (!match) {
        continue;
      }

      const backticks = match[1].length;
      const language = match[2].toLowerCase();

      if (!inCodeBlock) {
        inCodeBlock = true;
        openingBackticks = backticks;
        openingLine = i + 1;

        if (backticks >= 4) {
          const isMetaLanguage = metaLanguages.has(language);
          const isValidContext = isMetaDoc || isMetaLanguage;

          if (!isValidContext) {
            result.warnings.push(
              `${file}:${String(i + 1)} - Unusual code fence: ${String(backticks)} backticks (expected 3). May be syntax error.`,
            );
            issuesFound++;
          }
        }
      } else if (backticks === openingBackticks) {
        if (language) {
          result.warnings.push(
            `${file}:${String(i + 1)} - Language identifier on closing fence: \`\`\`${language} (should be just \`\`\`)`,
          );
          issuesFound++;
        }

        inCodeBlock = false;
        openingBackticks = 0;
        openingLine = 0;
      }
    }

    if (inCodeBlock) {
      result.errors.push(
        `${file}:${String(openingLine)} - Unclosed code block (opened with ${String(openingBackticks)} backticks)`,
      );
      issuesFound++;
    }
  }

  if (issuesFound > 0) {
    logWarning(`${String(issuesFound)} code block syntax issues`);
  } else {
    logSuccess("All code blocks have valid syntax");
  }

  return finalizeValidationResult(result);
}

/**
 * Check 10: Validates test metrics match OpenSpec claims.
 * Runs test suite and compares actual metrics with documented claims.
 *
 * @returns Validation result with errors for mismatched metrics
 */
function validateCodeMetrics(): ValidationResult {
  console.log("\n🔟 Checking code metrics against OpenSpec documents...");

  const result = createValidationResult();

  const auditFile = "openspec/changes/migrate-languagemodelv3/IMPLEMENTATION_AUDIT.md";
  const releaseNotesFile = "openspec/changes/migrate-languagemodelv3/RELEASE_NOTES.md";

  if (!fileExists(auditFile) || !fileExists(releaseNotesFile)) {
    result.warnings.push("OpenSpec files not found, skipping code metrics validation");
    logWarning("OpenSpec files not found, skipping");
    return finalizeValidationResult(result);
  }

  const { content: auditContent } = readMarkdownFile(auditFile);
  const { content: releaseNotesContent } = readMarkdownFile(releaseNotesFile);

  const auditTestMatch = /(\d+)\/(\d+) tests passing/.exec(auditContent);
  const releaseTestMatch = /(\d+) tests/.exec(releaseNotesContent);

  const claimedTestsAudit = auditTestMatch ? Number.parseInt(auditTestMatch[2], 10) : null;
  const claimedTestsRelease = releaseTestMatch ? Number.parseInt(releaseTestMatch[1], 10) : null;

  const coverageMatch = /Coverage[:\s]+(\d+\.?\d*)%\s+overall/.exec(auditContent);
  const claimedCoverage = coverageMatch ? Number.parseFloat(coverageMatch[1]) : null;

  console.log("\n  📝 OpenSpec Claims:");
  if (claimedTestsAudit !== null) {
    console.log(`    • IMPLEMENTATION_AUDIT.md: ${String(claimedTestsAudit)} tests`);
  }
  if (claimedTestsRelease !== null) {
    console.log(`    • RELEASE_NOTES.md: ${String(claimedTestsRelease)} tests`);
  }
  if (claimedCoverage !== null) {
    console.log(`    • Coverage: ${String(claimedCoverage)}%`);
  }

  console.log("\n  🧪 Running test suite...");
  const testMetrics = runCoverageCheck();

  if (!testMetrics) {
    result.warnings.push("Could not extract test metrics from npm test output");
    logWarning("Could not extract test metrics");
    return finalizeValidationResult(result);
  }

  logSuccess("Actual Metrics:");
  console.log(`    • Test count: ${String(testMetrics.totalTests)}`);
  if (testMetrics.coverage !== undefined) {
    console.log(`    • Coverage: ${testMetrics.coverage.toFixed(2)}%`);
  }
  console.log(`    • All tests passed: ${testMetrics.passed ? "YES" : "NO"}`);

  if (claimedTestsAudit !== null && claimedTestsAudit !== testMetrics.totalTests) {
    result.errors.push(
      `IMPLEMENTATION_AUDIT.md claims ${String(claimedTestsAudit)} tests, but actual count is ${String(testMetrics.totalTests)}`,
    );
  }

  if (claimedTestsRelease !== null && claimedTestsRelease !== testMetrics.totalTests) {
    result.errors.push(
      `RELEASE_NOTES.md claims ${String(claimedTestsRelease)} tests, but actual count is ${String(testMetrics.totalTests)}`,
    );
  }

  if (claimedCoverage !== null && testMetrics.coverage !== undefined) {
    const diff = Math.abs(claimedCoverage - testMetrics.coverage);
    if (diff > COVERAGE_TOLERANCE_PERCENT) {
      result.errors.push(
        `OpenSpec claims ${String(claimedCoverage)}% coverage, but actual is ${testMetrics.coverage.toFixed(2)}%`,
      );
    }
  }

  if (!testMetrics.passed) {
    result.errors.push("Some tests are failing - all tests must pass");
  }

  const pkg = readJsonFile("package.json") as null | PackageJson;
  if (pkg?.version) {
    const version = pkg.version;
    if (!auditContent.includes(version)) {
      result.warnings.push(
        `package.json version (${version}) not found in IMPLEMENTATION_AUDIT.md`,
      );
    }
  }

  console.log("");
  if (result.errors.length === 0) {
    logSuccess("Code metrics match OpenSpec claims");
  } else {
    logError("Code metrics validation failed:");
    result.errors.forEach((err) => {
      console.log(`    • ${err}`);
    });
  }

  if (result.warnings.length > 0) {
    logWarning("Warnings:");
    result.warnings.forEach((warn) => {
      console.log(`    • ${warn}`);
    });
  }

  return finalizeValidationResult(result);
}

/**
 * Check 5: Validates dotenv imports in code examples.
 * A file passes if it has at least one complete example with env setup, or all snippets are partial.
 */
function validateDotenvImports(): ValidationResult {
  const result = createValidationResult();
  console.log("\n5️⃣  Checking dotenv imports in documentation...");

  let issuesFound = 0;

  for (const file of DOTENV_CHECK_FILES) {
    if (!fileExists(file)) {
      logWarning(`File not found: ${file}`);
      continue;
    }

    const { content } = readMarkdownFile(file);
    const codeBlocks = extractCodeBlocks(content, "typescript");

    const relevantBlocks = codeBlocks.filter(
      (code) => code.includes("createSAPAIProvider") || code.includes("sapai("),
    );

    if (relevantBlocks.length === 0) {
      continue;
    }

    const hasCompleteExampleWithEnvSetup = relevantBlocks.some((code) => {
      const hasDotenvImport =
        code.includes("dotenv/config") ||
        code.includes("// Load environment") ||
        code.includes('import "dotenv/config"') ||
        /import.*dotenv/.test(code);

      const hasEnvComment =
        code.includes("AICORE_SERVICE_KEY") ||
        code.includes("environment variable") ||
        code.includes("via AICORE_SERVICE_KEY") ||
        code.includes("VCAP_SERVICES") ||
        code.includes("service binding") ||
        code.includes("// No environment variables needed") ||
        code.includes("// Authentication is automatic");

      return hasDotenvImport || hasEnvComment;
    });

    const allBlocksArePartialSnippets = relevantBlocks.every((code) => {
      const hasNoImports = !code.includes("import ");

      const isComparisonSnippet =
        code.includes("// Before") ||
        code.includes("// After") ||
        code.includes("// v1.x") ||
        code.includes("// v2.x") ||
        code.includes("// v3.x") ||
        code.includes("// v4.x");

      const isFeatureSnippet =
        code.includes("import {") &&
        code.includes("@mymediset/sap-ai-provider") &&
        !code.includes("generateText") &&
        !code.includes("streamText");

      const isConfigOnlySnippet =
        !code.includes("await ") && !code.includes("generateText") && !code.includes("streamText");

      return hasNoImports || isComparisonSnippet || isFeatureSnippet || isConfigOnlySnippet;
    });

    if (!hasCompleteExampleWithEnvSetup && !allBlocksArePartialSnippets) {
      result.warnings.push(
        `${file}: Code example with createSAPAIProvider missing dotenv import or env setup comment`,
      );
      issuesFound++;
    }
  }

  if (issuesFound > 0) {
    logWarning(`${String(issuesFound)} files with potential dotenv import issues`);
  } else {
    logSuccess("All code examples have proper environment setup");
  }

  return finalizeValidationResult(result);
}

/**
 * Check 12: Validates heading hierarchy (no level skipping).
 * Ensures headers don't skip levels (e.g., H2 -> H4 without H3).
 *
 * @returns Validation result with errors for invalid hierarchy jumps
 */
function validateHeadingHierarchySmart(): ValidationResult {
  const result = createValidationResult();
  console.log("\n1️⃣2️⃣  Checking heading hierarchy (context-aware)...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let issuesFound = 0;

  for (const file of mdFiles) {
    const { inCodeBlock, lines } = readMarkdownFileWithCodeBlocks(file);

    let previousLevel = 1; // H1 is implicit (document title)
    let previousLine = 0;

    for (let i = 0; i < lines.length; i++) {
      if (inCodeBlock[i]) {
        continue;
      }

      const line = lines[i];
      const headerMatch = REGEX_PATTERNS.HEADER.exec(line);

      if (headerMatch) {
        const level = headerMatch[1].length;

        if (level > previousLevel + 1) {
          result.errors.push(
            `${file}:${String(i + 1)} - Invalid heading jump: H${String(previousLevel)} → H${String(level)} (line ${String(previousLine)} → ${String(i + 1)}). Insert H${String(previousLevel + 1)} level first.`,
          );
          issuesFound++;
        }

        previousLevel = level;
        previousLine = i + 1;
      }
    }
  }

  if (issuesFound > 0) {
    logError(`${String(issuesFound)} heading hierarchy issues`);
  } else {
    logSuccess("Heading hierarchy is valid");
  }

  return finalizeValidationResult(result);
}

/**
 * Check 2: Detects broken internal markdown links.
 * Validates all internal .md file references exist.
 *
 * @returns Validation result with errors for broken links
 */
function validateInternalLinks(): ValidationResult {
  const result = createValidationResult();
  console.log("\n2️⃣  Checking for broken internal links...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let brokenCount = 0;

  const checkFileExists = createFileExistsChecker();

  for (const file of mdFiles) {
    if (!checkFileExists(file)) {
      continue;
    }

    const { inCodeBlock, lines } = readMarkdownFileWithCodeBlocks(file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (inCodeBlock[i] || hasInlineCodeExample(line)) {
        continue;
      }

      const linkPattern = /\[([^\]]+)\]\(((?!https?:\/\/)(?:\.\/)?([^)#]+\.md))(#[^)]+)?\)/g;
      const matches = Array.from(line.matchAll(linkPattern));

      for (const match of matches) {
        const fullPath = match[2];
        const targetFile = match[3];

        if (fullPath.includes("://")) {
          continue;
        }

        const sourceDir = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : ".";
        const resolvedPath = join(sourceDir, fullPath);

        if (!checkFileExists(resolvedPath)) {
          result.errors.push(`${file}:${String(i + 1)} - Broken link to ${targetFile}`);
          brokenCount++;
        }
      }
    }
  }

  if (brokenCount > 0) {
    logError(`${String(brokenCount)} broken internal links found`);
  } else {
    logSuccess("No broken internal links");
  }

  return finalizeValidationResult(result);
}

/**
 * Check 6: Validates link format (requires ./ prefix).
 * Ensures internal links use ./ prefix for consistency.
 *
 * @returns Validation result with warnings for incorrect format
 */
function validateLinkFormat(): ValidationResult {
  const result = createValidationResult();
  console.log("\n6️⃣  Checking link format consistency...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let badLinksCount = 0;

  for (const file of mdFiles) {
    const { inCodeBlock, lines } = readMarkdownFileWithCodeBlocks(file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (inCodeBlock[i]) {
        continue;
      }

      const badLinkPattern = /\[([^\]]+)\]\((?!\.\/|https?:\/\/|#)([^)]+\.md[^)]*)\)/g;
      const matches = Array.from(line.matchAll(badLinkPattern));

      for (const match of matches) {
        result.warnings.push(
          `${file}:${String(i + 1)} - Relative link without ./ prefix: ${match[2]}`,
        );
        badLinksCount++;
      }
    }
  }

  if (badLinksCount > 0) {
    logWarning(`${String(badLinksCount)} links without ./ prefix (should be: ./FILE.md)`);
  } else {
    logSuccess("All links use correct format");
  }

  return finalizeValidationResult(result);
}

/**
 * Check 4: Validates model ID vendor prefixes.
 * Ensures model IDs use correct format with vendor prefixes.
 *
 * @returns Validation result with errors for incorrect formats
 */
function validateModelIdFormats(): ValidationResult {
  const result = createValidationResult();
  console.log("\n4️⃣  Checking model ID format consistency...");

  const filesToCheck = ["README.md", "API_REFERENCE.md"];
  let issuesFound = 0;

  for (const file of filesToCheck) {
    if (!fileExists(file)) {
      continue;
    }

    const { lines } = readMarkdownFile(file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (
        line.trim().startsWith("```") ||
        line.includes('model: provider("') ||
        line.includes("model: sapai(") ||
        line.trim().startsWith("|")
      ) {
        continue;
      }

      for (const rule of MODEL_VALIDATION_RULES) {
        if (!rule.incorrectPattern) continue;

        const { correctFormat, pattern } = rule.incorrectPattern;
        const matches = line.matchAll(new RegExp(pattern.source, pattern.flags));

        for (const match of matches) {
          const incorrect = match[1];
          result.errors.push(
            `${file}:${String(i + 1)} - Model ID format error (${rule.vendor}): "${incorrect}" should be "${correctFormat}"`,
          );
          issuesFound++;
        }
      }
    }
  }

  if (issuesFound > 0) {
    logError(`${String(issuesFound)} model ID format issues found`);
  } else {
    logSuccess("All model IDs use correct format with vendor prefixes");
  }

  return finalizeValidationResult(result);
}

/**
 * Check 3: Detects excessive hardcoded model lists.
 * Warns when documentation contains too many hardcoded model IDs instead of using representative examples.
 *
 * @returns Validation result with warnings for files exceeding model mention thresholds
 */
function validateModelLists(): ValidationResult {
  const result = createValidationResult();
  console.log("\n3️⃣  Checking for excessive hardcoded model lists...");

  for (const { file, threshold } of MODEL_CHECK_FILES) {
    if (!fileExists(file)) {
      continue;
    }

    const { content } = readMarkdownFile(file);

    let modelMentions = 0;
    for (const rule of MODEL_VALIDATION_RULES) {
      for (const pattern of rule.countPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          modelMentions += matches.length;
        }
      }
    }

    if (modelMentions > threshold) {
      result.warnings.push(
        `${file}: ${String(modelMentions)} model IDs (threshold: ${String(threshold)}). ` +
          `Consider using representative examples instead of exhaustive lists.`,
      );
      logWarning(`${file}: ${String(modelMentions)} model mentions (may be excessive)`);
    } else {
      logSuccess(`${file}: ${String(modelMentions)} model mentions (within threshold)`);
    }
  }

  return finalizeValidationResult(result);
}

/**
 * Check 14: Detects empty sections without content.
 * Identifies heading sections that have no text or code blocks before the next heading.
 *
 * @returns Validation result with warnings for orphan sections
 */
function validateOrphanSections(): ValidationResult {
  const result = createValidationResult();
  console.log("\n1️⃣4️⃣  Checking for orphan sections...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let issuesFound = 0;

  for (const file of mdFiles) {
    const { inCodeBlock, lines } = readMarkdownFileWithCodeBlocks(file);

    const headers: { level: number; line: number; text: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (inCodeBlock[i]) {
        continue;
      }

      const headerMatch = /^(#{1,6})\s+(.+)$/.exec(lines[i]);
      if (headerMatch) {
        headers.push({
          level: headerMatch[1].length,
          line: i + 1,
          text: headerMatch[2].trim(),
        });
      }
    }

    for (let i = 0; i < headers.length - 1; i++) {
      const current = headers[i];
      const next = headers[i + 1];

      const startIdx = current.line;
      const endIdx = next.line - 2;
      let hasTextContent = false;
      let hasCodeBlock = false;

      for (let lineIdx = startIdx; lineIdx <= endIdx; lineIdx++) {
        const line = lines[lineIdx].trim();
        if (line) {
          if (inCodeBlock[lineIdx]) {
            hasCodeBlock = true;
          } else {
            hasTextContent = true;
          }
        }
      }

      const isSubHeader = next.level > current.level;
      const hasContent = hasTextContent || hasCodeBlock;

      if (!isSubHeader && !hasContent) {
        result.warnings.push(
          `${file}:${String(current.line)} - Orphan section: "${"#".repeat(current.level)} ${current.text}" has no content before next header`,
        );
        issuesFound++;
      }
    }
  }

  if (issuesFound > 0) {
    logWarning(`${String(issuesFound)} orphan sections found`);
  } else {
    logSuccess("No orphan sections detected");
  }

  return finalizeValidationResult(result);
}

/**
 * Check 1: Verifies critical exports are documented.
 * Ensures all critical public exports from src/index.ts appear in API_REFERENCE.md.
 *
 * @returns Validation result with warnings for undocumented exports
 */
function validatePublicExportsDocumented(): ValidationResult {
  const result = createValidationResult();
  console.log("1️⃣  Checking public exports are documented...");

  const indexPath = "src/index.ts";
  const apiRefPath = "API_REFERENCE.md";

  if (!fileExists(indexPath) || !fileExists(apiRefPath)) {
    result.errors.push("Missing src/index.ts or API_REFERENCE.md");
    logError("Critical files missing");
    return finalizeValidationResult(result);
  }

  const { content: indexContent } = readTextFile(indexPath);
  const { content: apiRefContent } = readMarkdownFile(apiRefPath);

  const exports = new Set<string>();

  const directExports = Array.from(
    indexContent.matchAll(/export\s+(?:const|function|class|type|interface)\s+(\w+)/g),
  );
  for (const match of directExports) {
    exports.add(match[1]);
  }

  const reExportMatches = Array.from(indexContent.matchAll(/export\s*\{\s*([^}]+)\s*\}/g));
  for (const match of reExportMatches) {
    const names = match[1]
      .split(",")
      .map(
        (n) =>
          n
            .trim()
            .split(/\s+as\s+/)
            .pop() ?? "",
      )
      .filter((n) => n.length > 0);
    names.forEach((n) => exports.add(n));
  }

  let undocumented = 0;
  for (const exportName of CRITICAL_EXPORTS) {
    if (!exports.has(exportName)) {
      result.warnings.push(`Critical export '${exportName}' not found in src/index.ts`);
      continue;
    }

    const patterns = [
      new RegExp(`\`${exportName}\``),
      new RegExp(`###.*${exportName}`),
      new RegExp(`\\*\\*${exportName}\\*\\*`),
    ];

    const isDocumented = patterns.some((p) => p.test(apiRefContent));

    if (!isDocumented) {
      result.warnings.push(`Export '${exportName}' not documented in API_REFERENCE.md`);
      undocumented++;
    }
  }

  if (undocumented > 0) {
    logWarning(
      `${String(undocumented)}/${String(CRITICAL_EXPORTS.length)} critical exports not documented`,
    );
  } else {
    logSuccess(`All ${String(CRITICAL_EXPORTS.length)} critical exports documented`);
  }

  return finalizeValidationResult(result);
}

/**
 * Check 7: Verifies required files exist.
 * Ensures all required documentation and configuration files are present in the repository.
 *
 * @returns Validation result with errors for missing required files
 */
function validateRequiredFiles(): ValidationResult {
  const result = createValidationResult();
  console.log("\n7️⃣  Checking required documentation files...");

  let missingCount = 0;

  for (const file of REQUIRED_FILES) {
    if (!fileExists(file)) {
      result.errors.push(`Missing required file: ${file}`);
      missingCount++;
    }
  }

  if (missingCount > 0) {
    logError(`${String(missingCount)} required files missing`);
  } else {
    logSuccess(`All ${String(REQUIRED_FILES.length)} required files present`);
  }

  return finalizeValidationResult(result);
}

/**
 * Check 11: Validates links in TypeScript comments.
 * Checks JSDoc comments and inline comments for broken links and incorrect model ID formats.
 *
 * @returns Validation result with warnings for broken links and model format issues
 */
function validateSourceCodeComments(): ValidationResult {
  const result = createValidationResult();
  console.log("\n1️⃣1️⃣  Checking source code comments (JSDoc, inline)...");

  let linksChecked = 0;
  let brokenLinksCount = 0;
  let modelIdIssues = 0;

  for (const file of SOURCE_FILES) {
    if (!fileExists(file)) {
      continue;
    }

    const comments = extractTypeScriptComments(file);

    for (const comment of comments) {
      const commentLines = comment.content.split("\n");

      for (let lineOffset = 0; lineOffset < commentLines.length; lineOffset++) {
        const line = commentLines[lineOffset];
        const absoluteLine = comment.lineNumber + lineOffset;

        const mdLinkPattern = /\[([^\]]+)\]\(((?!https?:\/\/)([^)#]+))(#[^)]+)?\)/g;
        const jsdocLinkPattern = /\{@(?:link|see)\s+([^}]+)\}/g;

        const mdMatches = Array.from(line.matchAll(mdLinkPattern));
        const jsdocMatches = Array.from(line.matchAll(jsdocLinkPattern));

        for (const match of mdMatches) {
          linksChecked++;
          const targetPath = match[3];

          if (!targetPath.includes(".")) {
            continue;
          }

          const resolvedPath = join(".", targetPath);

          if (!fileExists(resolvedPath)) {
            result.warnings.push(
              `${file}:${String(absoluteLine)} - Comment contains broken link: ${targetPath}`,
            );
            brokenLinksCount++;
          }
        }

        for (const match of jsdocMatches) {
          const target = match[1].trim();

          if (target.includes(".md") || target.includes(".ts")) {
            linksChecked++;
            const resolvedPath = join(".", target);

            if (!fileExists(resolvedPath)) {
              result.warnings.push(
                `${file}:${String(absoluteLine)} - JSDoc @link to non-existent file: ${target}`,
              );
              brokenLinksCount++;
            }
          }
        }

        for (const rule of MODEL_VALIDATION_RULES) {
          if (!rule.incorrectPattern) continue;

          const { correctFormat, pattern } = rule.incorrectPattern;
          const matches = line.matchAll(new RegExp(pattern.source, pattern.flags));

          for (const match of matches) {
            if (
              line.includes("```") ||
              line.includes("@example") ||
              line.includes("model: sapai(") ||
              line.includes('model: provider("') ||
              REGEX_PATTERNS.URL_PATTERN.test(line)
            ) {
              continue;
            }

            const incorrect = match[1];
            result.warnings.push(
              `${file}:${String(absoluteLine)} - Comment mentions model without vendor prefix: "${incorrect}" should be "${correctFormat}"`,
            );
            modelIdIssues++;
          }
        }
      }
    }
  }

  console.log(`  📝 Checked ${String(linksChecked)} links in source comments`);

  if (brokenLinksCount > 0) {
    logWarning(`${String(brokenLinksCount)} broken links in source comments`);
  } else {
    logSuccess("No broken links in source comments");
  }

  if (modelIdIssues > 0) {
    logWarning(`${String(modelIdIssues)} model ID format issues in comments`);
  } else {
    logSuccess("Model IDs in comments use correct format");
  }

  return finalizeValidationResult(result);
}

/**
 * Check 8: Validates ToC accuracy.
 * Compares Table of Contents entries against actual document headers for consistency.
 *
 * @returns Validation result with errors for missing/mismatched entries and warnings for extras
 */
function validateTableOfContents(): ValidationResult {
  const result = createValidationResult();
  console.log("\n8️⃣  Checking Table of Contents consistency...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let filesWithToc = 0;
  let issuesFound = 0;

  for (const file of mdFiles) {
    const { content, lines } = readMarkdownFile(file);

    const { endLine, hasToc, startLine } = detectToc(content);

    if (!hasToc) {
      continue;
    }

    filesWithToc++;

    const indentSize = detectTocIndentation(lines, startLine, endLine);
    const tocEntries = extractTocEntries(lines, startLine, endLine, indentSize);

    if (tocEntries.length === 0) {
      result.warnings.push(`${file}: ToC section found but no entries detected`);
      issuesFound++;
      continue;
    }

    const tocDepth = inferTocDepth(tocEntries);

    const headers = extractHeaders(lines, startLine);

    const validation = validateTocEntries(tocEntries, headers, tocDepth);

    if (validation.missing.length > 0) {
      for (const header of validation.missing) {
        result.errors.push(
          `${file}:${String(header.lineNumber)} - Missing in ToC: "${"#".repeat(header.level)} ${header.text}" (anchor: #${header.anchor})`,
        );
        issuesFound++;
      }
    }

    if (validation.extra.length > 0) {
      for (const entry of validation.extra) {
        result.warnings.push(
          `${file}:${String(entry.lineNumber)} - Extra in ToC (no matching header): "${entry.text}" -> #${entry.anchor}`,
        );
        issuesFound++;
      }
    }

    if (validation.mismatched.length > 0) {
      for (const { actual, expected } of validation.mismatched) {
        if (actual.text !== expected.text) {
          result.errors.push(
            `${file}:${String(actual.lineNumber)} - ToC text mismatch: "${actual.text}" should be "${expected.text}"`,
          );
          issuesFound++;
        }
        if (actual.level !== expected.level) {
          result.warnings.push(
            `${file}:${String(actual.lineNumber)} - ToC level mismatch: "${actual.text}" is level ${String(actual.level)} but should be ${String(expected.level)}`,
          );
          issuesFound++;
        }
      }
    }
  }

  if (filesWithToc === 0) {
    console.log("  ℹ️  No files with Table of Contents found");
  } else if (issuesFound === 0) {
    logSuccess(`All ${String(filesWithToc)} Table of Contents are consistent`);
  } else {
    logError(`${String(issuesFound)} ToC issues found in ${String(filesWithToc)} files`);
  }

  return finalizeValidationResult(result);
}

/**
 * Validates ToC against actual document headers using diff algorithm.
 *
 * @param tocEntries - Entries in ToC
 * @param headers - Actual headers in document
 * @param tocDepth - Maximum depth to validate
 * @returns Validation result with missing/extra/mismatched entries
 */
function validateTocEntries(
  tocEntries: TocEntry[],
  headers: HeaderEntry[],
  tocDepth: number,
): TocValidationResult {
  const expectedHeaders = headers.filter((h) => h.level <= tocDepth);

  const missing: HeaderEntry[] = [];
  const extra: TocEntry[] = [];
  const mismatched: { actual: TocEntry; expected: HeaderEntry }[] = [];

  const tocMap = new Map<string, TocEntry>();
  for (const entry of tocEntries) {
    tocMap.set(entry.anchor, entry);
  }

  const headerMap = new Map<string, HeaderEntry>();
  for (const header of expectedHeaders) {
    headerMap.set(header.anchor, header);
  }

  for (const header of expectedHeaders) {
    const tocEntry = tocMap.get(header.anchor);

    if (!tocEntry) {
      missing.push(header);
    } else {
      if (tocEntry.text !== header.text || tocEntry.level !== header.level) {
        mismatched.push({ actual: tocEntry, expected: header });
      }
    }
  }

  for (const tocEntry of tocEntries) {
    if (!headerMap.has(tocEntry.anchor)) {
      extra.push(tocEntry);
    }
  }

  return {
    actualEntries: tocEntries,
    expectedEntries: expectedHeaders,
    extra,
    hasToc: true,
    mismatched,
    missing,
    tocDepth,
  };
}

/**
 * Check 9: Validates package.json version appears in docs.
 * Ensures the current version from package.json is mentioned in key documentation files.
 *
 * @returns Validation result with warnings if version is not mentioned in docs
 */
function validateVersionConsistency(): ValidationResult {
  const result = createValidationResult();
  console.log("\n9️⃣  Checking version consistency...");

  if (!fileExists("package.json")) {
    result.warnings.push("package.json not found");
    logWarning("package.json not found");
    return finalizeValidationResult(result);
  }

  const pkg = readJsonFile("package.json") as null | PackageJson;
  if (!pkg?.version) {
    result.warnings.push("Unable to read version from package.json");
    logWarning("Unable to read version");
    return finalizeValidationResult(result);
  }

  const version = pkg.version;
  console.log(`  📦 Current version: ${version}`);

  let mentionedCount = 0;

  for (const file of VERSION_CHECK_FILES) {
    if (!fileExists(file)) {
      continue;
    }

    const { content } = readMarkdownFile(file);
    const hasVersion =
      content.includes(version) ||
      content.includes(`v${version}`) ||
      content.includes(`@${version}`);

    if (hasVersion) {
      mentionedCount++;
    }
  }

  if (mentionedCount === 0) {
    result.warnings.push(`Version ${version} not mentioned in key documentation files`);
    logWarning(`Version not mentioned in docs (may need update)`);
  } else {
    logSuccess(
      `Version mentioned in ${String(mentionedCount)}/${String(VERSION_CHECK_FILES.length)} key files`,
    );
  }

  return finalizeValidationResult(result);
}

main();
