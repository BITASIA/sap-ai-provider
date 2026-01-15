#!/usr/bin/env npx tsx
/**
 * Documentation validation for SAP AI Provider.
 * Performs 14 checks: exports, links, models, ToC, versions, metrics, syntax, hierarchy.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { HeaderEntry, TocEntry } from "./markdown-utils.js";

import {
  detectToc,
  extractHeaders,
  extractTocEntries,
  inferTocDepth,
  trackCodeBlocks,
} from "./markdown-utils.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/** File path with validation threshold. */
interface FileThreshold {
  /** File path. */
  file: string;
  /** Threshold count. */
  threshold: number;
}

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

/** Validation check result. */
interface ValidationResult {
  /** Error messages. */
  errors: string[];
  /** Whether check passed. */
  passed: boolean;
  /** Warning messages. */
  warnings: string[];
}

// ============================================================================
// Constants
// ============================================================================

const CRITICAL_EXPORTS = [
  "createSAPAIProvider",
  "sapai",
  "buildDpiMaskingProvider",
  "buildAzureContentSafetyFilter",
  "buildLlamaGuard38BFilter",
] as const;

const MODEL_CHECK_FILES: FileThreshold[] = [
  { file: "README.md", threshold: 15 },
  { file: "API_REFERENCE.md", threshold: 20 },
];

const DOTENV_CHECK_FILES = [
  "README.md",
  "API_REFERENCE.md",
  "MIGRATION_GUIDE.md",
  "ENVIRONMENT_SETUP.md",
  "TROUBLESHOOTING.md",
] as const;

const REQUIRED_FILES = [
  "README.md",
  "LICENSE.md",
  "CONTRIBUTING.md",
  "API_REFERENCE.md",
  "ARCHITECTURE.md",
  "ENVIRONMENT_SETUP.md",
  "TROUBLESHOOTING.md",
  "MIGRATION_GUIDE.md",
  ".env.example",
] as const;

const VERSION_CHECK_FILES = ["README.md", "MIGRATION_GUIDE.md"] as const;

const DEFAULT_EXCLUDED_DIRS = ["node_modules", ".git"] as const;

/** Extended via CLI args if needed */
const EXCLUDED_DIRS: string[] = [...DEFAULT_EXCLUDED_DIRS];

const COVERAGE_TOLERANCE_PERCENT = 0.5;

const REGEX_PATTERNS = {
  // eslint-disable-next-line no-control-regex
  ANSI_COLORS: /\x1b\[[0-9;]*m/g,
  BLOCK_COMMENT_START: /\/\*\*?/,
  INLINE_COMMENT: /\/\/(.*)$/,
  JSDOC_ONE_LINER: /\/\*\*(?!\*)(?:[^*]|\*(?!\/))*\*\//,
  URL_PATTERN: /https?:\/\//,
} as const;

/** Model ID validation rules: count patterns and format checks */
const MODEL_VALIDATION_RULES = [
  {
    countPatterns: [/"gpt-[\d.]+[a-z0-9-]*"/gi, /"o[\d]+-?[a-z]*"/gi],
    incorrectPattern: null,
    vendor: "OpenAI",
  },
  {
    countPatterns: [/"gemini-[\d.]+-[a-z]+"/gi],
    incorrectPattern: null,
    vendor: "Google",
  },
  {
    countPatterns: [/"anthropic--claude-[^"]+"/gi],
    incorrectPattern: {
      correctFormat: "anthropic--claude-*",
      pattern: /(?<!anthropic--)(\bclaude-[\d.]+-(sonnet|opus|haiku)\b)/g,
    },
    vendor: "Anthropic",
  },
  {
    countPatterns: [/"amazon--[a-z0-9-]+"/gi],
    incorrectPattern: {
      correctFormat: "amazon--nova-*",
      pattern: /(?<!amazon--)(\bnova-(pro|lite|micro|premier)\b)/g,
    },
    vendor: "Amazon",
  },
  {
    countPatterns: [/"meta--llama[^"]+"/gi],
    incorrectPattern: {
      correctFormat: "meta--llama*-instruct",
      pattern: /(?<!meta--)(\bllama[\d.]+(?!-instruct\b)[a-z\d.]*)\b/g,
    },
    vendor: "Meta",
  },
  {
    countPatterns: [/"mistralai--[a-z0-9-]+"/gi],
    incorrectPattern: {
      correctFormat: "mistralai--mistral-*-instruct",
      pattern: /(?<!mistralai--)(\bmistralai-mistral-\w+)(?!-instruct\b)/g,
    },
    vendor: "Mistral",
  },
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

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
 * Combines multiple validation results.
 *
 * @param results - Validation results
 * @returns Aggregated result
 */
function aggregateResults(results: ValidationResult[]): ValidationResult {
  return results.reduce<ValidationResult>(
    (acc, result) => ({
      errors: [...acc.errors, ...result.errors],
      passed: acc.passed && result.passed,
      warnings: [...acc.warnings, ...result.warnings],
    }),
    { errors: [], passed: true, warnings: [] },
  );
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
 * Extracts TypeScript code blocks from markdown.
 *
 * @param content - Markdown content
 * @returns Code block contents
 */
function extractTypeScriptCodeBlocks(content: string): string[] {
  const codeBlockPattern = /```typescript\n([\s\S]*?)\n```/g;
  const matches = Array.from(content.matchAll(codeBlockPattern));
  return matches.map((match) => match[1]);
}

// ============================================================================
// Helper Functions - Code Analysis
// ============================================================================

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
 * Finds all .md files recursively, excluding specified directories.
 *
 * @param dir - Root directory
 * @param exclude - Directories to skip
 * @returns Relative paths to .md files
 */
function findMarkdownFiles(dir: string, exclude: readonly string[] = []): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const relativePath = relative(process.cwd(), fullPath);

      if (exclude.some((ex) => relativePath.includes(ex))) {
        continue;
      }

      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith(".md")) {
        files.push(relativePath);
      }
    }
  }

  walk(dir);
  return files;
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
 * Checks if line is inside code block.
 *
 * @param lines - All file lines
 * @param lineIndex - 0-based line index
 * @returns True if in code block
 */
function isLineInCodeBlock(lines: string[], lineIndex: number): boolean {
  let inCodeBlock = false;

  for (let i = 0; i <= lineIndex; i++) {
    if (lines[i].trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }
  }

  return inCodeBlock;
}

/**
 * CLI entry point.
 * Runs all 14 validation checks and reports results with exit codes.
 */
function main(): void {
  console.log("📚 SAP AI Provider - Documentation Validation");
  console.log("=".repeat(60));
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

  const results = aggregateResults(allResults);

  console.log("");
  console.log("=".repeat(60));
  console.log("\n📊 Summary:");
  console.log(`  Errors:   ${String(results.errors.length)}`);
  console.log(`  Warnings: ${String(results.warnings.length)}`);

  if (results.errors.length > 0) {
    console.log("\n❌ ERRORS:");
    results.errors.forEach((err) => {
      console.log(`  • ${err}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    results.warnings.forEach((warn) => {
      console.log(`  • ${warn}`);
    });
  }

  console.log("");
  if (results.errors.length === 0 && results.warnings.length === 0) {
    console.log("✅ Documentation validation PASSED - No issues found!\n");
    process.exit(0);
  } else if (results.errors.length === 0) {
    console.log("✅ Documentation validation PASSED with warnings");
    console.log("   Consider addressing warnings before release.\n");
    process.exit(0);
  } else {
    console.log("❌ Documentation validation FAILED");
    console.log("   Fix errors before proceeding with release.\n");
    process.exit(1);
  }
}

/**
 * Runs all validation checks and reports results.
 */

/**
 * Parses CLI arguments.
 * Supports: --exclude-dirs dir1,dir2 --help
 */
function parseCliArgs(): void {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--exclude-dirs" || arg === "--exclude-dir") {
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith("--")) {
        console.error(`Error: ${arg} requires a comma-separated list of directories`);
        console.error("Usage: npm run validate-docs -- --exclude-dirs dir1,dir2,dir3");
        process.exit(1);
      }

      const additionalDirs = nextArg
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      EXCLUDED_DIRS.push(...additionalDirs);
      i++; // Skip next arg since we consumed it
    } else if (arg === "--help" || arg === "-h") {
      console.log("SAP AI Provider - Documentation Validation");
      console.log("");
      console.log("Usage:");
      console.log("  npm run validate-docs");
      console.log("  npm run validate-docs -- --exclude-dirs dir1,dir2");
      console.log("");
      console.log("Options:");
      console.log(
        "  --exclude-dirs <dirs>  Comma-separated list of additional directories to exclude",
      );
      console.log("  --help, -h             Show this help message");
      console.log("");
      console.log("Default excluded directories:", DEFAULT_EXCLUDED_DIRS.join(", "));
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      console.error("Use --help for usage information");
      process.exit(1);
    }
  }
}

/**
 * Reads and parses JSON file safely.
 *
 * @param filePath - Path to .json file
 * @returns Parsed object or null on error
 */
function readJsonFile(filePath: string): null | PackageJson {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
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
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n1️⃣3️⃣  Checking code block syntax...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let issuesFound = 0;

  const metaDocFiles = ["openspec/", "AGENTS.md", ".github/copilot-instructions.md"];
  const metaLanguages = new Set(["javascript", "js", "markdown", "md", "ts", "typescript"]);

  const isMetaDocFile = (file: string, patterns: string[]): boolean => {
    return patterns.some((pattern) => {
      if (pattern.endsWith("/")) {
        return file.startsWith(pattern) || file.includes(`/${pattern}`);
      } else {
        return file === pattern || file.endsWith(`/${pattern}`);
      }
    });
  };

  for (const file of mdFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    const isMetaDoc = isMetaDocFile(file, metaDocFiles);
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
            warnings.push(
              `${file}:${String(i + 1)} - Unusual code fence: ${String(backticks)} backticks (expected 3). May be syntax error.`,
            );
            issuesFound++;
          }
        }
      } else if (backticks === openingBackticks) {
        if (language) {
          warnings.push(
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
      errors.push(
        `${file}:${String(openingLine)} - Unclosed code block (opened with ${String(openingBackticks)} backticks)`,
      );
      issuesFound++;
    }
  }

  if (issuesFound > 0) {
    console.log(`  ⚠️  ${String(issuesFound)} code block syntax issues`);
  } else {
    console.log("  ✅ All code blocks have valid syntax");
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 10: Validates test metrics match OpenSpec claims.
 * Runs test suite and compares actual metrics with documented claims.
 *
 * @returns Validation result with errors for mismatched metrics
 */
function validateCodeMetrics(): ValidationResult {
  console.log("\n🔟 Checking code metrics against OpenSpec documents...");

  const errors: string[] = [];
  const warnings: string[] = [];

  const auditFile = "openspec/changes/migrate-languagemodelv3/IMPLEMENTATION_AUDIT.md";
  const releaseNotesFile = "openspec/changes/migrate-languagemodelv3/RELEASE_NOTES.md";

  if (!existsSync(auditFile) || !existsSync(releaseNotesFile)) {
    warnings.push("OpenSpec files not found, skipping code metrics validation");
    console.log("  ⚠️  OpenSpec files not found, skipping");
    return { errors, passed: errors.length === 0, warnings };
  }

  const auditContent = readFileSync(auditFile, "utf-8");
  const releaseNotesContent = readFileSync(releaseNotesFile, "utf-8");

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
    warnings.push("Could not extract test metrics from npm test output");
    console.log("  ⚠️  Could not extract test metrics");
    return { errors, passed: errors.length === 0, warnings };
  }

  console.log("\n  ✅ Actual Metrics:");
  console.log(`    • Test count: ${String(testMetrics.totalTests)}`);
  if (testMetrics.coverage !== undefined) {
    console.log(`    • Coverage: ${testMetrics.coverage.toFixed(2)}%`);
  }
  console.log(`    • All tests passed: ${testMetrics.passed ? "YES" : "NO"}`);

  if (claimedTestsAudit !== null && claimedTestsAudit !== testMetrics.totalTests) {
    errors.push(
      `IMPLEMENTATION_AUDIT.md claims ${String(claimedTestsAudit)} tests, but actual count is ${String(testMetrics.totalTests)}`,
    );
  }

  if (claimedTestsRelease !== null && claimedTestsRelease !== testMetrics.totalTests) {
    errors.push(
      `RELEASE_NOTES.md claims ${String(claimedTestsRelease)} tests, but actual count is ${String(testMetrics.totalTests)}`,
    );
  }

  if (claimedCoverage !== null && testMetrics.coverage !== undefined) {
    const diff = Math.abs(claimedCoverage - testMetrics.coverage);
    if (diff > COVERAGE_TOLERANCE_PERCENT) {
      errors.push(
        `OpenSpec claims ${String(claimedCoverage)}% coverage, but actual is ${testMetrics.coverage.toFixed(2)}%`,
      );
    }
  }

  if (!testMetrics.passed) {
    errors.push("Some tests are failing - all tests must pass");
  }

  const pkg = readJsonFile("package.json");
  if (pkg?.version) {
    const version = pkg.version;
    if (!auditContent.includes(version)) {
      warnings.push(`package.json version (${version}) not found in IMPLEMENTATION_AUDIT.md`);
    }
  }

  console.log("");
  if (errors.length === 0) {
    console.log("  ✅ Code metrics match OpenSpec claims");
  } else {
    console.log("  ❌ Code metrics validation failed:");
    errors.forEach((err) => {
      console.log(`    • ${err}`);
    });
  }

  if (warnings.length > 0) {
    console.log("  ⚠️  Warnings:");
    warnings.forEach((warn) => {
      console.log(`    • ${warn}`);
    });
  }

  return { errors, passed: errors.length === 0, warnings };
}

// ============================================================================
// Validation Checks
// ============================================================================

/**
 * Check 5: Validates dotenv imports in code examples.
 * Ensures code examples with createSAPAIProvider include proper environment setup.
 *
 * @returns Validation result with warnings for missing dotenv imports
 */
function validateDotenvImports(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n5️⃣  Checking dotenv imports in documentation...");

  let issuesFound = 0;

  for (const file of DOTENV_CHECK_FILES) {
    if (!existsSync(file)) {
      console.log(`  ⚠️  File not found: ${file}`);
      continue;
    }

    const content = readFileSync(file, "utf-8");
    const codeBlocks = extractTypeScriptCodeBlocks(content);

    for (const code of codeBlocks) {
      if (!code.includes("createSAPAIProvider") && !code.includes("sapai(")) {
        continue;
      }

      const hasDotenvImport =
        code.includes("dotenv/config") ||
        code.includes("// Load environment") ||
        code.includes('import "dotenv/config"') ||
        /import.*dotenv/.test(code);

      const hasEnvComment =
        code.includes("AICORE_SERVICE_KEY") ||
        code.includes("environment variable") ||
        code.includes("via AICORE_SERVICE_KEY");

      if (!hasDotenvImport && !hasEnvComment) {
        warnings.push(
          `${file}: Code example with createSAPAIProvider missing dotenv import or env setup comment`,
        );
        issuesFound++;
        break; // Only report once per file
      }
    }
  }

  if (issuesFound > 0) {
    console.log(`  ⚠️  ${String(issuesFound)} files with potential dotenv import issues`);
  } else {
    console.log("  ✅ All code examples have proper environment setup");
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 12: Validates heading hierarchy (no level skipping).
 * Ensures headers don't skip levels (e.g., H2 -> H4 without H3).
 *
 * @returns Validation result with errors for invalid hierarchy jumps
 */
function validateHeadingHierarchySmart(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n1️⃣2️⃣  Checking heading hierarchy (context-aware)...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let issuesFound = 0;

  for (const file of mdFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const inCodeBlock = trackCodeBlocks(lines);

    let previousLevel = 1; // H1 is implicit (document title)
    let previousLine = 0;

    for (let i = 0; i < lines.length; i++) {
      if (inCodeBlock[i]) {
        continue;
      }

      const line = lines[i];
      const headerMatch = /^(#{1,6})\s+(.+)$/.exec(line);

      if (headerMatch) {
        const level = headerMatch[1].length;

        if (level > previousLevel + 1) {
          errors.push(
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
    console.log(`  ❌ ${String(issuesFound)} heading hierarchy issues`);
  } else {
    console.log("  ✅ Heading hierarchy is valid");
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 2: Detects broken internal markdown links.
 * Validates all internal .md file references exist.
 *
 * @returns Validation result with errors for broken links
 */
function validateInternalLinks(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n2️⃣  Checking for broken internal links...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let brokenCount = 0;

  const fileExistsCache = new Map<string, boolean>();

  const checkFileExists = (path: string): boolean => {
    if (!fileExistsCache.has(path)) {
      fileExistsCache.set(path, existsSync(path));
    }
    const result = fileExistsCache.get(path);
    return result ?? false;
  };

  for (const file of mdFiles) {
    if (!checkFileExists(file)) {
      continue;
    }

    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isLineInCodeBlock(lines, i) || hasInlineCodeExample(line)) {
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
          errors.push(`${file}:${String(i + 1)} - Broken link to ${targetFile}`);
          brokenCount++;
        }
      }
    }
  }

  if (brokenCount > 0) {
    console.log(`  ❌ ${String(brokenCount)} broken internal links found`);
  } else {
    console.log("  ✅ No broken internal links");
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 6: Validates link format (requires ./ prefix).
 * Ensures internal links use ./ prefix for consistency.
 *
 * @returns Validation result with warnings for incorrect format
 */
function validateLinkFormat(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n6️⃣  Checking link format consistency...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let badLinksCount = 0;

  for (const file of mdFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isLineInCodeBlock(lines, i)) {
        continue;
      }

      const badLinkPattern = /\[([^\]]+)\]\((?!\.\/|https?:\/\/|#)([^)]+\.md[^)]*)\)/g;
      const matches = Array.from(line.matchAll(badLinkPattern));

      for (const match of matches) {
        warnings.push(`${file}:${String(i + 1)} - Relative link without ./ prefix: ${match[2]}`);
        badLinksCount++;
      }
    }
  }

  if (badLinksCount > 0) {
    console.log(`  ⚠️  ${String(badLinksCount)} links without ./ prefix (should be: ./FILE.md)`);
  } else {
    console.log("  ✅ All links use correct format");
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 4: Validates model ID vendor prefixes.
 * Ensures model IDs use correct format with vendor prefixes.
 *
 * @returns Validation result with errors for incorrect formats
 */
function validateModelIdFormats(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n4️⃣  Checking model ID format consistency...");

  const filesToCheck = ["README.md", "API_REFERENCE.md"];
  let issuesFound = 0;

  for (const file of filesToCheck) {
    if (!existsSync(file)) {
      continue;
    }

    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

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
          errors.push(
            `${file}:${String(i + 1)} - Model ID format error (${rule.vendor}): "${incorrect}" should be "${correctFormat}"`,
          );
          issuesFound++;
        }
      }
    }
  }

  if (issuesFound > 0) {
    console.log(`  ❌ ${String(issuesFound)} model ID format issues found`);
  } else {
    console.log("  ✅ All model IDs use correct format with vendor prefixes");
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 3: Detects excessive hardcoded model lists.
 * Warns when documentation contains too many hardcoded model IDs instead of using representative examples.
 *
 * @returns Validation result with warnings for files exceeding model mention thresholds
 */
function validateModelLists(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n3️⃣  Checking for excessive hardcoded model lists...");

  for (const { file, threshold } of MODEL_CHECK_FILES) {
    if (!existsSync(file)) {
      continue;
    }

    const content = readFileSync(file, "utf-8");

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
      warnings.push(
        `${file}: ${String(modelMentions)} model IDs (threshold: ${String(threshold)}). ` +
          `Consider using representative examples instead of exhaustive lists.`,
      );
      console.log(`  ⚠️  ${file}: ${String(modelMentions)} model mentions (may be excessive)`);
    } else {
      console.log(`  ✅ ${file}: ${String(modelMentions)} model mentions (within threshold)`);
    }
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 14: Detects empty sections without content.
 * Identifies heading sections that have no text or code blocks before the next heading.
 *
 * @returns Validation result with warnings for orphan sections
 */
function validateOrphanSections(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n1️⃣4️⃣  Checking for orphan sections...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let issuesFound = 0;

  for (const file of mdFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const inCodeBlock = trackCodeBlocks(lines);

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
        warnings.push(
          `${file}:${String(current.line)} - Orphan section: "${"#".repeat(current.level)} ${current.text}" has no content before next header`,
        );
        issuesFound++;
      }
    }
  }

  if (issuesFound > 0) {
    console.log(`  ⚠️  ${String(issuesFound)} orphan sections found`);
  } else {
    console.log("  ✅ No orphan sections detected");
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 1: Verifies critical exports are documented.
 * Ensures all critical public exports from src/index.ts appear in API_REFERENCE.md.
 *
 * @returns Validation result with warnings for undocumented exports
 */
function validatePublicExportsDocumented(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("1️⃣  Checking public exports are documented...");

  const indexPath = "src/index.ts";
  const apiRefPath = "API_REFERENCE.md";

  if (!existsSync(indexPath) || !existsSync(apiRefPath)) {
    errors.push("Missing src/index.ts or API_REFERENCE.md");
    console.log("  ❌ Critical files missing");
    return { errors, passed: false, warnings };
  }

  const indexContent = readFileSync(indexPath, "utf-8");
  const apiRefContent = readFileSync(apiRefPath, "utf-8");

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
      warnings.push(`Critical export '${exportName}' not found in src/index.ts`);
      continue;
    }

    const patterns = [
      new RegExp(`\`${exportName}\``),
      new RegExp(`###.*${exportName}`),
      new RegExp(`\\*\\*${exportName}\\*\\*`),
    ];

    const isDocumented = patterns.some((p) => p.test(apiRefContent));

    if (!isDocumented) {
      warnings.push(`Export '${exportName}' not documented in API_REFERENCE.md`);
      undocumented++;
    }
  }

  if (undocumented > 0) {
    console.log(
      `  ⚠️  ${String(undocumented)}/${String(CRITICAL_EXPORTS.length)} critical exports not documented`,
    );
  } else {
    console.log(`  ✅ All ${String(CRITICAL_EXPORTS.length)} critical exports documented`);
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 7: Verifies required files exist.
 * Ensures all required documentation and configuration files are present in the repository.
 *
 * @returns Validation result with errors for missing required files
 */
function validateRequiredFiles(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n7️⃣  Checking required documentation files...");

  let missingCount = 0;

  for (const file of REQUIRED_FILES) {
    if (!existsSync(file)) {
      errors.push(`Missing required file: ${file}`);
      missingCount++;
    }
  }

  if (missingCount > 0) {
    console.log(`  ❌ ${String(missingCount)} required files missing`);
  } else {
    console.log(`  ✅ All ${String(REQUIRED_FILES.length)} required files present`);
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 11: Validates links in TypeScript comments.
 * Checks JSDoc comments and inline comments for broken links and incorrect model ID formats.
 *
 * @returns Validation result with warnings for broken links and model format issues
 */
function validateSourceCodeComments(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n1️⃣1️⃣  Checking source code comments (JSDoc, inline)...");

  const sourceFiles = [
    "src/sap-ai-error.ts",
    "src/sap-ai-language-model.ts",
    "src/sap-ai-provider.ts",
    "src/index.ts",
    "src/sap-ai-settings.ts",
    "src/convert-to-sap-messages.ts",
  ];

  let linksChecked = 0;
  let brokenLinksCount = 0;
  let modelIdIssues = 0;

  for (const file of sourceFiles) {
    if (!existsSync(file)) {
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

          if (!existsSync(resolvedPath)) {
            warnings.push(
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

            if (!existsSync(resolvedPath)) {
              warnings.push(
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
            warnings.push(
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
    console.log(`  ⚠️  ${String(brokenLinksCount)} broken links in source comments`);
  } else {
    console.log("  ✅ No broken links in source comments");
  }

  if (modelIdIssues > 0) {
    console.log(`  ⚠️  ${String(modelIdIssues)} model ID format issues in comments`);
  } else {
    console.log("  ✅ Model IDs in comments use correct format");
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

/**
 * Check 8: Validates ToC accuracy.
 * Compares Table of Contents entries against actual document headers for consistency.
 *
 * @returns Validation result with errors for missing/mismatched entries and warnings for extras
 */
function validateTableOfContents(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n8️⃣  Checking Table of Contents consistency...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let filesWithToc = 0;
  let issuesFound = 0;

  for (const file of mdFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    const { endLine, hasToc, startLine } = detectToc(content);

    if (!hasToc) {
      continue;
    }

    filesWithToc++;

    const tocEntries = extractTocEntries(lines, startLine, endLine);

    if (tocEntries.length === 0) {
      warnings.push(`${file}: ToC section found but no entries detected`);
      issuesFound++;
      continue;
    }

    const tocDepth = inferTocDepth(tocEntries);

    const headers = extractHeaders(lines, startLine);

    const validation = validateTocEntries(tocEntries, headers, tocDepth);

    if (validation.missing.length > 0) {
      for (const header of validation.missing) {
        errors.push(
          `${file}:${String(header.lineNumber)} - Missing in ToC: "${"#".repeat(header.level)} ${header.text}" (anchor: #${header.anchor})`,
        );
        issuesFound++;
      }
    }

    if (validation.extra.length > 0) {
      for (const entry of validation.extra) {
        warnings.push(
          `${file}:${String(entry.lineNumber)} - Extra in ToC (no matching header): "${entry.text}" -> #${entry.anchor}`,
        );
        issuesFound++;
      }
    }

    if (validation.mismatched.length > 0) {
      for (const { actual, expected } of validation.mismatched) {
        if (actual.text !== expected.text) {
          errors.push(
            `${file}:${String(actual.lineNumber)} - ToC text mismatch: "${actual.text}" should be "${expected.text}"`,
          );
          issuesFound++;
        }
        if (actual.level !== expected.level) {
          warnings.push(
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
    console.log(`  ✅ All ${String(filesWithToc)} Table of Contents are consistent`);
  } else {
    console.log(`  ❌ ${String(issuesFound)} ToC issues found in ${String(filesWithToc)} files`);
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
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
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n9️⃣  Checking version consistency...");

  if (!existsSync("package.json")) {
    warnings.push("package.json not found");
    console.log("  ⚠️  package.json not found");
    return { errors, passed: true, warnings };
  }

  const pkg = readJsonFile("package.json");
  if (!pkg?.version) {
    warnings.push("Unable to read version from package.json");
    console.log("  ⚠️  Unable to read version");
    return { errors, passed: true, warnings };
  }

  const version = pkg.version;
  console.log(`  📦 Current version: ${version}`);

  let mentionedCount = 0;

  for (const file of VERSION_CHECK_FILES) {
    if (!existsSync(file)) {
      continue;
    }

    const content = readFileSync(file, "utf-8");
    const hasVersion =
      content.includes(version) ||
      content.includes(`v${version}`) ||
      content.includes(`@${version}`);

    if (hasVersion) {
      mentionedCount++;
    }
  }

  if (mentionedCount === 0) {
    warnings.push(`Version ${version} not mentioned in key documentation files`);
    console.log(`  ⚠️  Version not mentioned in docs (may need update)`);
  } else {
    console.log(
      `  ✅ Version mentioned in ${String(mentionedCount)}/${String(VERSION_CHECK_FILES.length)} key files`,
    );
  }

  return {
    errors,
    passed: errors.length === 0,
    warnings,
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

// Parse CLI arguments and run main function
parseCliArgs();
main();
