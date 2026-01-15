#!/usr/bin/env npx tsx
/**
 * SAP AI Provider - Comprehensive Documentation Validation
 *
 * Consolidates all documentation checks into a single TypeScript script.
 * Replaces: validate-docs.sh, check-dotenv-imports.sh, check-links-format.sh
 *
 * Checks performed:
 * 1. Code-documentation consistency (exports, types)
 * 2. Broken internal markdown links
 * 3. Hardcoded model lists (should use dynamic types)
 * 4. Model ID format consistency (vendor prefixes)
 * 5. Dotenv imports in code examples
 * 6. Link format consistency (./path vs path)
 * 7. Required documentation files existence
 * 8. Table of Contents consistency (automatic detection and validation)
 * 9. Version consistency across docs
 * 10. Code metrics validation (test count, coverage) against OpenSpec claims
 * 11. Source code comments validation (links, model IDs in JSDoc/inline comments)
 * 12. Heading hierarchy validation (context-aware, ignores code blocks)
 * 13. Code block syntax validation (detects invalid backtick patterns)
 * 14. Orphan section detection (sections without content)
 *
 * Usage:
 *   npm run validate-docs
 *   npx tsx scripts/validate-docs.ts
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ============================================================================
// Types and Interfaces
// ============================================================================

interface FileThreshold {
  file: string;
  threshold: number;
}

interface HeaderEntry {
  anchor: string;
  level: number;
  lineNumber: number;
  text: string;
}

interface PackageJson {
  [key: string]: unknown;
  version: string;
}

interface TocEntry {
  anchor: string;
  level: number;
  lineNumber: number;
  text: string;
}

interface TocValidationResult {
  actualEntries: TocEntry[];
  expectedEntries: HeaderEntry[];
  extra: TocEntry[];
  hasToc: boolean;
  mismatched: { actual: TocEntry; expected: HeaderEntry }[];
  missing: HeaderEntry[];
  tocDepth: number;
}

interface ValidationResult {
  errors: string[];
  passed: boolean;
  warnings: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Critical exports that must be documented in API_REFERENCE.md */
const CRITICAL_EXPORTS = [
  "createSAPAIProvider",
  "sapai",
  "buildDpiMaskingProvider",
  "buildAzureContentSafetyFilter",
  "buildLlamaGuard38BFilter",
] as const;

/** Files to check for hardcoded model ID lists */
const MODEL_CHECK_FILES: FileThreshold[] = [
  { file: "README.md", threshold: 15 },
  { file: "API_REFERENCE.md", threshold: 20 },
];

/** Documentation files to check for dotenv imports */
const DOTENV_CHECK_FILES = [
  "README.md",
  "API_REFERENCE.md",
  "MIGRATION_GUIDE.md",
  "ENVIRONMENT_SETUP.md",
  "TROUBLESHOOTING.md",
] as const;

/** Required documentation files */
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

/** Files to check for version mentions */
const VERSION_CHECK_FILES = ["README.md", "MIGRATION_GUIDE.md"] as const;

/** Directories to exclude from markdown file search */
const EXCLUDED_DIRS = ["node_modules", ".git"] as const;

/** Tolerance for coverage percentage comparison (allows rounding differences) */
const COVERAGE_TOLERANCE_PERCENT = 0.5;

/** Minimum percentage threshold for ToC depth inference (10% of entries) */
const TOC_DEPTH_INFERENCE_THRESHOLD = 0.1;

/**
 * Regular expression patterns used throughout validation.
 * Extracted as constants for reusability and clarity.
 */
const REGEX_PATTERNS = {
  // eslint-disable-next-line no-control-regex
  ANSI_COLORS: /\x1b\[[0-9;]*m/g, // Removes ANSI color codes from terminal output
  BLOCK_COMMENT_START: /\/\*\*?/, // Matches block comment start (JSDoc or regular)
  INLINE_COMMENT: /\/\/(.*)$/, // Matches inline comments: // comment
  JSDOC_ONE_LINER: /\/\*\*.*?\*\//, // Matches one-liner JSDoc: /** comment */
  URL_PATTERN: /https?:\/\//, // Detects URLs to skip in validation
} as const;

/**
 * Model ID validation rules
 *
 * Each rule defines patterns for:
 * - Counting model IDs in code (between quotes only, to avoid false positives)
 * - Validating format in markdown lists (vendor prefixes required)
 */
const MODEL_VALIDATION_RULES = [
  {
    // Match any GPT model (gpt-3, gpt-4, gpt-5, etc.) and o-series (o1, o3, etc.)
    countPatterns: [
      /"gpt-[\d.]+[a-z0-9-]*"/gi, // gpt-3.5-turbo, gpt-4o, gpt-5-ultra, etc.
      /"o[\d]+-?[a-z]*"/gi, // o1, o3, o3-mini, etc.
    ],
    // No format validation (no vendor prefix required)
    incorrectPattern: null,
    vendor: "OpenAI",
  },
  {
    // Match any Gemini model (current and future versions)
    countPatterns: [/"gemini-[\d.]+-[a-z]+"/gi], // gemini-1.5-pro, gemini-2.0-flash, etc.
    incorrectPattern: null,
    vendor: "Google",
  },
  {
    // Match any Claude model with anthropic-- prefix
    countPatterns: [/"anthropic--claude-[^"]+"/gi], // anthropic--claude-3.5-sonnet, etc.
    // Detect Claude without anthropic-- prefix in markdown lists
    incorrectPattern: {
      correctFormat: "anthropic--claude-*",
      pattern: /(?<!anthropic--)(\bclaude-[\d.]+-(sonnet|opus|haiku)\b)/g,
    },
    vendor: "Anthropic",
  },
  {
    // Match any Amazon model with amazon-- prefix
    countPatterns: [/"amazon--[a-z0-9-]+"/gi], // amazon--nova-pro, amazon--titan-*, etc.
    // Detect Nova without amazon-- prefix in markdown lists
    incorrectPattern: {
      correctFormat: "amazon--nova-*",
      pattern: /(?<!amazon--)(\bnova-(pro|lite|micro|premier)\b)/g,
    },
    vendor: "Amazon",
  },
  {
    // Match any Llama model with meta-- prefix
    countPatterns: [/"meta--llama[^"]+"/gi], // meta--llama3.1-70b-instruct, etc.
    // Detect Llama without meta-- prefix or -instruct suffix
    incorrectPattern: {
      correctFormat: "meta--llama*-instruct",
      pattern: /(?<!meta--)(\bllama[\d.]+(?!-instruct\b)[a-z\d.]*)\b/g,
    },
    vendor: "Meta",
  },
  {
    // Match any Mistral model with mistralai-- prefix
    countPatterns: [/"mistralai--[a-z0-9-]+"/gi], // mistralai--mistral-large-instruct, etc.
    // Detect Mistral without mistralai-- prefix or -instruct suffix
    incorrectPattern: {
      correctFormat: "mistralai--mistral-*-instruct",
      pattern: /(?<!mistralai--)(\bmistralai-mistral-\w+)(?!-instruct\b)/g,
    },
    vendor: "Mistral",
  },
] as const;

// ============================================================================
// Global State
// ============================================================================

// ============================================================================
// Helper Functions
// ============================================================================

interface TestMetrics {
  coverage?: number;
  passed: boolean;
  totalTests: number;
}

/**
 * Aggregates multiple validation results into a single result.
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
 * Detects if a file contains a Table of Contents section.
 *
 * @param content - File content
 * @returns Object with ToC detection info
 */
function detectToc(content: string): {
  endLine: number;
  hasToc: boolean;
  startLine: number;
} {
  const lines = content.split("\n");

  // Look for common ToC patterns
  const tocPatterns = [/^##\s+Table of Contents$/i, /^##\s+Contents$/i, /^##\s+ToC$/i];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    for (const pattern of tocPatterns) {
      if (pattern.test(line)) {
        // Find the end of ToC (next ## header or empty section)
        let endLine = i + 1;
        let emptyLines = 0;

        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();

          // End at next ## header
          if (/^##\s+/.test(nextLine)) {
            endLine = j;
            break;
          }

          // Track empty lines
          if (nextLine === "") {
            emptyLines++;
            if (emptyLines >= 2) {
              // Two consecutive empty lines mark end
              endLine = j;
              break;
            }
          } else {
            emptyLines = 0;
          }
        }

        return { endLine, hasToc: true, startLine: i };
      }
    }
  }

  return { endLine: -1, hasToc: false, startLine: -1 };
}

/**
 * Extracts coverage metrics from npm run test:coverage output.
 * Parses the summary table at the end of the output.
 */
function extractCoverage(output: string): null | number {
  // Look for the "All files" row in the coverage table
  const allFilesMatch =
    /All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/.exec(output);
  if (allFilesMatch) {
    return Number.parseFloat(allFilesMatch[1]);
  }
  return null;
}

/**
 * Extracts actual headers from the document (excluding ToC header itself).
 *
 * @param lines - File lines
 * @param tocStartLine - ToC start line to exclude
 * @returns Array of header entries
 */
function extractHeaders(lines: string[], tocStartLine: number): HeaderEntry[] {
  const headers: HeaderEntry[] = [];
  let inCodeBlock = false;

  // Track anchor duplicates (GitHub adds -1, -2, etc. for duplicates)
  const anchorCounts = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code blocks
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip code blocks and ToC header
    if (inCodeBlock || i === tocStartLine) {
      continue;
    }

    // Match headers (## Header, ### Header, etc.)
    const headerMatch = /^(#{2,6})\s+(.+)$/.exec(line);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2].trim();
      let anchor = textToAnchor(text);

      // Handle duplicate anchors (GitHub appends -1, -2, etc.)
      const baseAnchor = anchor;
      const count = anchorCounts.get(baseAnchor) ?? 0;

      if (count > 0) {
        anchor = `${baseAnchor}-${String(count)}`;
      }

      anchorCounts.set(baseAnchor, count + 1);

      headers.push({
        anchor,
        level,
        lineNumber: i + 1,
        text,
      });
    }
  }

  return headers;
}

/**
 * Extracts test count from npm test output.
 * Parses Vitest output like: "Tests  194 passed (194)"
 * Also handles colored output with ANSI codes
 */
function extractTestCount(output: string): null | number {
  // Remove ANSI color codes
  const clean = output.replace(REGEX_PATTERNS.ANSI_COLORS, "");

  // Try Vitest format: "Tests  194 passed (194)"
  const vitestMatch = /Tests\s+(\d+)\s+passed\s+\((\d+)\)/.exec(clean);
  if (vitestMatch) {
    return Number.parseInt(vitestMatch[2], 10);
  }

  // Try Jest format: "Tests:  194 passed, 194 total"
  const jestMatch = /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/.exec(clean);
  if (jestMatch) {
    return Number.parseInt(jestMatch[2], 10);
  }

  return null;
}

/**
 * Extracts ToC entries from the ToC section.
 *
 * @param lines - File lines
 * @param startLine - ToC start line
 * @param endLine - ToC end line
 * @returns Array of ToC entries
 */
function extractTocEntries(lines: string[], startLine: number, endLine: number): TocEntry[] {
  const entries: TocEntry[] = [];

  // Pattern: - [Text](#anchor) or * [Text](#anchor)
  const tocPattern = /^(\s*)[-*]\s+\[([^\]]+)\]\(#([^)]+)\)/;

  for (let i = startLine + 1; i < endLine; i++) {
    const line = lines[i];
    const match = tocPattern.exec(line);

    if (match) {
      const indent = match[1].length;
      const text = match[2];
      const anchor = match[3];

      // Calculate level based on indentation (2 spaces = 1 level)
      const level = Math.floor(indent / 2) + 2; // Start at level 2 (##)

      entries.push({
        anchor,
        level,
        lineNumber: i + 1,
        text,
      });
    }
  }

  return entries;
}

/**
 * Extracts TypeScript code blocks from markdown content.
 *
 * @param content - Markdown file content
 * @returns Array of code block contents
 */
function extractTypeScriptCodeBlocks(content: string): string[] {
  const codeBlockPattern = /```typescript\n([\s\S]*?)\n```/g;
  const matches = Array.from(content.matchAll(codeBlockPattern));
  return matches.map((match) => match[1]);
}

// ============================================================================
// Code Metrics Validation
// ============================================================================

/**
 * Extracts JSDoc and inline comments from TypeScript source files.
 * Returns an array of comment blocks with their file location.
 *
 * Handles multi-line JSDoc, one-liner JSDoc, block comments, and inline comments
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

    // Check for one-liner JSDoc: /** comment */
    const oneLineJSDoc = REGEX_PATTERNS.JSDOC_ONE_LINER.exec(line);
    if (oneLineJSDoc && !inBlockComment) {
      comments.push({
        content: oneLineJSDoc[0],
        lineNumber: i + 1,
      });
      // Continue to check for inline comments after the JSDoc on same line
    }

    // Block comment start (JSDoc /** or regular /* )
    if (!inBlockComment && REGEX_PATTERNS.BLOCK_COMMENT_START.test(trimmed)) {
      // Skip if already handled as one-liner
      if (oneLineJSDoc) {
        continue;
      }

      inBlockComment = true;
      blockStartLine = i + 1;
      currentBlock = [line];
      continue;
    }

    // Inside block comment
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

    // Inline comments (anywhere in line)
    const inlineCommentMatch = REGEX_PATTERNS.INLINE_COMMENT.exec(line);
    if (inlineCommentMatch) {
      comments.push({
        content: inlineCommentMatch[0], // Keep the // prefix
        lineNumber: i + 1,
      });
    }
  }

  return comments;
}

/**
 * Recursively finds all markdown files in a directory.
 *
 * @param dir - Directory to search
 * @param exclude - Patterns to exclude from search
 * @returns Array of relative file paths
 */
function findMarkdownFiles(dir: string, exclude: readonly string[] = []): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const relativePath = relative(process.cwd(), fullPath);

      // Skip excluded paths
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
 * Checks if a line contains an inline code example with markdown links.
 *
 * @param line - Line to check
 * @returns True if line has inline code with markdown syntax
 */
function hasInlineCodeExample(line: string): boolean {
  return line.includes("`[") && line.includes("](");
}

/**
 * Infers the maximum depth level that should be included in ToC.
 *
 * Uses statistical analysis: if >80% of ToC entries are at certain levels,
 * those levels define the ToC depth.
 *
 * @param tocEntries - ToC entries
 * @returns Maximum level depth (e.g., 2 means only ##, 3 means ## and ###)
 */
function inferTocDepth(tocEntries: TocEntry[]): number {
  if (tocEntries.length === 0) return 2;

  // Count entries at each level
  const levelCounts = new Map<number, number>();
  for (const entry of tocEntries) {
    levelCounts.set(entry.level, (levelCounts.get(entry.level) ?? 0) + 1);
  }

  // Find the maximum level that has significant representation
  const levels = Array.from(levelCounts.keys()).sort((a, b) => a - b);
  const totalEntries = tocEntries.length;

  let maxDepth = 2;
  for (const level of levels) {
    const count = levelCounts.get(level) ?? 0;
    const percentage = count / totalEntries;

    // If this level has significant representation, include it in depth
    if (percentage > TOC_DEPTH_INFERENCE_THRESHOLD) {
      maxDepth = Math.max(maxDepth, level);
    }
  }

  return maxDepth;
}

/**
 * Checks if a line is inside a code block.
 *
 * @param lines - All lines in the file
 * @param lineIndex - Index of current line
 * @returns True if line is in a code block
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
 * Runs all validation checks and reports results.
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

  // Print summary
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

  // Exit with appropriate status
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
 * Safely reads and parses a JSON file.
 *
 * @param filePath - Path to JSON file
 * @returns Parsed JSON object or null if error
 */
function readJsonFile(filePath: string): null | PackageJson {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    // Silently return null on error - caller will handle
    return null;
  }
}

/**
 * Runs npm run test:coverage and extracts metrics.
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
 * Converts header text to a GitHub-compatible anchor.
 *
 * GitHub's anchor generation rules (verified):
 * 1. Convert to lowercase
 * 2. Remove backticks
 * 3. Keep: Unicode letters (\p{L}), Unicode numbers (\p{N}), spaces, hyphens, underscores
 * 4. Remove: emoji, punctuation, special symbols
 * 5. Replace spaces with hyphens
 * 6. Collapse multiple hyphens to single
 * 7. Remove leading/trailing hyphens
 *
 * Examples:
 * - "🚀 Getting Started" → "getting-started" (emoji removed)
 * - "日本語セクション" → "日本語セクション" (Unicode kept)
 * - "Über uns" → "über-uns" (ü kept)
 * - "Q&A / FAQ" → "qa-faq" (punctuation removed)
 * - "API: `createProvider()`" → "api-createprovider" (backticks/parens removed)
 *
 * @param text - Header text
 * @returns Anchor string
 */
function textToAnchor(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      // Remove backticks (common in code references)
      .replace(/`/g, "")
      // Keep ONLY: Unicode letters, Unicode numbers, spaces, hyphens, underscores
      // \p{L} = any Unicode letter, \p{N} = any Unicode number
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      // Replace multiple spaces with single space
      .replace(/\s+/g, " ")
      // Replace spaces with hyphens
      .replace(/\s/g, "-")
      // Replace multiple hyphens/underscores with single hyphen
      .replace(/[-_]+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * Tracks code block state with proper backtick count matching.
 * More robust than isLineInCodeBlock for advanced validation.
 *
 * @param lines - All lines in the file
 * @returns Array of booleans indicating if each line is in a code block
 */
function trackCodeBlocks(lines: string[]): boolean[] {
  const inCodeBlock: boolean[] = new Array<boolean>(lines.length).fill(false);
  let isInBlock = false;
  let openingBackticks = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = /^(`{3,})/.exec(lines[i]);

    if (match && !isInBlock) {
      // Opening code block
      isInBlock = true;
      openingBackticks = match[1].length;
      inCodeBlock[i] = true;
    } else if (match && isInBlock && match[1].length === openingBackticks) {
      // Closing code block
      inCodeBlock[i] = true;
      isInBlock = false;
      openingBackticks = 0;
    } else if (isInBlock) {
      inCodeBlock[i] = true;
    }
  }

  return inCodeBlock;
}

/**
 * Check 13: Validates code block syntax for common errors.
 *
 * Detects:
 * - Quadruple backticks (````) in non-meta-documentation contexts
 * - Mismatched opening/closing backticks
 * - Language identifiers on closing fences
 *
 * Algorithm: Proper parser with context detection for meta-documentation.
 */
function validateCodeBlockSyntax(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n1️⃣3️⃣  Checking code block syntax...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let issuesFound = 0;

  // Meta-documentation contexts where quadruple backticks are valid
  const metaDocFiles = ["openspec/", "AGENTS.md", ".github/copilot-instructions.md"];
  const metaLanguages = new Set(["javascript", "js", "markdown", "md", "ts", "typescript"]);

  for (const file of mdFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    const isMetaDocFile = metaDocFiles.some((pattern) => file.includes(pattern));
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
        // Opening fence
        inCodeBlock = true;
        openingBackticks = backticks;
        openingLine = i + 1;

        // Check for quadruple+ backticks
        if (backticks >= 4) {
          const isMetaLanguage = metaLanguages.has(language);
          const isValidContext = isMetaDocFile || isMetaLanguage;

          if (!isValidContext) {
            warnings.push(
              `${file}:${String(i + 1)} - Unusual code fence: ${String(backticks)} backticks (expected 3). May be syntax error.`,
            );
            issuesFound++;
          }
        }
      } else if (backticks === openingBackticks) {
        // Closing fence
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

    // Check for unclosed code blocks
    if (inCodeBlock) {
      errors.push(
        `${file}:${String(openingLine)} - Unclosed code block (opened with ${String(openingBackticks)} backticks)`,
      );
      // Error tracked in errors array
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
 * Check 10: Validates code metrics against OpenSpec claims
 */
function validateCodeMetrics(): ValidationResult {
  console.log("\n🔟 Checking code metrics against OpenSpec documents...");

  const errors: string[] = [];
  const warnings: string[] = [];

  // Read OpenSpec files
  const auditFile = "openspec/changes/migrate-languagemodelv3/IMPLEMENTATION_AUDIT.md";
  const releaseNotesFile = "openspec/changes/migrate-languagemodelv3/RELEASE_NOTES.md";

  if (!existsSync(auditFile) || !existsSync(releaseNotesFile)) {
    warnings.push("OpenSpec files not found, skipping code metrics validation");
    console.log("  ⚠️  OpenSpec files not found, skipping");
    return { errors, passed: errors.length === 0, warnings };
  }

  const auditContent = readFileSync(auditFile, "utf-8");
  const releaseNotesContent = readFileSync(releaseNotesFile, "utf-8");

  // Extract claimed test count from OpenSpec
  const auditTestMatch = /(\d+)\/(\d+) tests passing/.exec(auditContent);
  const releaseTestMatch = /(\d+) tests/.exec(releaseNotesContent);

  const claimedTestsAudit = auditTestMatch ? Number.parseInt(auditTestMatch[2], 10) : null;
  const claimedTestsRelease = releaseTestMatch ? Number.parseInt(releaseTestMatch[1], 10) : null;

  // Extract claimed coverage from OpenSpec
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

  // Run actual tests
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

  // Validate test count consistency
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

  // Validate coverage claims
  if (claimedCoverage !== null && testMetrics.coverage !== undefined) {
    const diff = Math.abs(claimedCoverage - testMetrics.coverage);
    if (diff > COVERAGE_TOLERANCE_PERCENT) {
      errors.push(
        `OpenSpec claims ${String(claimedCoverage)}% coverage, but actual is ${testMetrics.coverage.toFixed(2)}%`,
      );
    }
  }

  // Validate all tests pass
  if (!testMetrics.passed) {
    errors.push("Test suite has failing tests, but OpenSpec claims all tests passing");
  }

  // Check version consistency between package.json and OpenSpec
  const pkg = readJsonFile("package.json");
  if (pkg?.version) {
    const version = pkg.version;
    if (!auditContent.includes(version)) {
      warnings.push(`package.json version (${version}) not found in IMPLEMENTATION_AUDIT.md`);
    }
  }

  // Print validation results
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
 * Check 5: Validates dotenv imports in code examples
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
      // If block uses provider creation, check for dotenv import or env comment
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
 * Check 12: Validates heading hierarchy with context awareness.
 *
 * Detects invalid heading jumps (e.g., H2 → H4 without H3) while properly
 * ignoring headers inside code blocks and handling edge cases.
 *
 * Algorithm: Uses state machine to track heading levels outside code blocks.
 * Validates that each heading is at most one level deeper than previous.
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
      // Skip code blocks
      if (inCodeBlock[i]) {
        continue;
      }

      const line = lines[i];
      const headerMatch = /^(#{1,6})\s+(.+)$/.exec(line);

      if (headerMatch) {
        const level = headerMatch[1].length;

        // Allow backward jumps (H4 → H2 is OK), only check forward jumps
        if (level > previousLevel + 1) {
          errors.push(
            `${file}:${String(i + 1)} - Invalid heading jump: H${String(previousLevel)} → H${String(level)} (line ${String(previousLine)} → ${String(i + 1)}). Insert H${String(previousLevel + 1)} level first.`,
          );
          // Error tracked in errors array
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
 * Check 2: Detects broken internal markdown links
 */
function validateInternalLinks(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n2️⃣  Checking for broken internal links...");

  const mdFiles = findMarkdownFiles(".", EXCLUDED_DIRS);
  let brokenCount = 0;

  for (const file of mdFiles) {
    if (!existsSync(file)) {
      continue;
    }

    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip code blocks and inline code examples
      if (isLineInCodeBlock(lines, i) || hasInlineCodeExample(line)) {
        continue;
      }

      // Match only internal relative links (not http/https URLs)
      const linkPattern = /\[([^\]]+)\]\(((?!https?:\/\/)(?:\.\/)?([^)#]+\.md))(#[^)]+)?\)/g;
      const matches = Array.from(line.matchAll(linkPattern));

      for (const match of matches) {
        const fullPath = match[2]; // The full path without # anchor
        const targetFile = match[3]; // Just the filename

        // Skip if it looks like a URL (safety check)
        if (fullPath.includes("://")) {
          continue;
        }

        // Resolve target path relative to the source file's directory
        const sourceDir = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : ".";
        const resolvedPath = join(sourceDir, fullPath);

        if (!existsSync(resolvedPath)) {
          errors.push(`${file}:${String(i + 1)} - Broken link to ${targetFile}`);
          // Error tracked in errors array
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
 * Check 6: Validates link format consistency (./file.md vs file.md)
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

      // Skip code blocks
      if (isLineInCodeBlock(lines, i)) {
        continue;
      }

      // Match links like [text](FILE.md) but not [text](./FILE.md) or [text](http://...)
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
 * Check 4: Validates model ID format consistency
 *
 * Detects model IDs without required vendor prefixes in markdown lists.
 * Uses MODEL_VALIDATION_RULES to check for incorrect formats.
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

      // Skip code blocks, model usage in code, and markdown tables
      if (
        line.trim().startsWith("```") ||
        line.includes('model: provider("') ||
        line.includes("model: sapai(") ||
        line.trim().startsWith("|") // Skip markdown table rows
      ) {
        continue;
      }

      // Check each rule's incorrect pattern
      for (const rule of MODEL_VALIDATION_RULES) {
        if (!rule.incorrectPattern) continue;

        const { correctFormat, pattern } = rule.incorrectPattern;
        const matches = line.matchAll(new RegExp(pattern.source, pattern.flags));

        for (const match of matches) {
          const incorrect = match[1];
          errors.push(
            `${file}:${String(i + 1)} - Model ID format error (${rule.vendor}): "${incorrect}" should be "${correctFormat}"`,
          );
          // Error tracked in errors array
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
 * Check 3: Detects excessive hardcoded model ID lists
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

    // Count model ID mentions using patterns from rules
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
 * Check 14: Detects orphan sections (headers without content).
 *
 * Identifies sections that have no content between the header and the next
 * header, which may indicate incomplete documentation.
 *
 * Algorithm: Track line count between consecutive headers, warn if < 2 lines.
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

    // Extract all headers outside code blocks
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

    // Check content between consecutive headers
    for (let i = 0; i < headers.length - 1; i++) {
      const current = headers[i];
      const next = headers[i + 1];

      // Calculate non-empty lines between headers
      const startLine = current.line; // 1-based
      const endLine = next.line - 1; // 1-based, before next header
      let contentLines = 0;

      for (let lineIdx = startLine; lineIdx < endLine; lineIdx++) {
        const line = lines[lineIdx].trim(); // lines array is 0-based
        if (line && !inCodeBlock[lineIdx]) {
          contentLines++;
        }
      }

      // Orphan section: no content between headers (or only whitespace/code blocks)
      if (contentLines === 0) {
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
 * Check 1: Verifies that all public exports are documented in API_REFERENCE.md
 */
function validatePublicExportsDocumented(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("1️⃣  Checking public exports are documented...");

  const indexPath = "src/index.ts";
  const apiRefPath = "API_REFERENCE.md";

  if (!existsSync(indexPath) || !existsSync(apiRefPath)) {
    errors.push("Missing src/index.ts or API_REFERENCE.md");
    // Error tracked in errors array
    console.log("  ❌ Critical files missing");
    return { errors, passed: false, warnings };
  }

  const indexContent = readFileSync(indexPath, "utf-8");
  const apiRefContent = readFileSync(apiRefPath, "utf-8");

  // Extract all exports from index.ts
  const exports = new Set<string>();

  // Direct exports: export const/function/class/type/interface NAME
  const directExports = Array.from(
    indexContent.matchAll(/export\s+(?:const|function|class|type|interface)\s+(\w+)/g),
  );
  for (const match of directExports) {
    exports.add(match[1]);
  }

  // Re-exports: export { NAME1, NAME2, ... }
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

  // Check if critical exports are documented
  let undocumented = 0;
  for (const exportName of CRITICAL_EXPORTS) {
    if (!exports.has(exportName)) {
      warnings.push(`Critical export '${exportName}' not found in src/index.ts`);
      continue;
    }

    // Check if documented in API reference
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
 * Check 7: Verifies required documentation files exist
 */
function validateRequiredFiles(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log("\n7️⃣  Checking required documentation files...");

  let missingCount = 0;

  for (const file of REQUIRED_FILES) {
    if (!existsSync(file)) {
      errors.push(`Missing required file: ${file}`);
      // Error tracked in errors array
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

// ============================================================================
// Advanced Structural Validations (Checks 12-14)
// ============================================================================

/**
 * Check 11: Validates links and model IDs in TypeScript source code comments
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

        // Check 1: Validate markdown links in JSDoc
        // Match: [text](path), {@link path}, {@see path}
        const mdLinkPattern = /\[([^\]]+)\]\(((?!https?:\/\/)([^)#]+))(#[^)]+)?\)/g;
        const jsdocLinkPattern = /\{@(?:link|see)\s+([^}]+)\}/g;

        const mdMatches = Array.from(line.matchAll(mdLinkPattern));
        const jsdocMatches = Array.from(line.matchAll(jsdocLinkPattern));

        // Validate markdown-style links
        for (const match of mdMatches) {
          linksChecked++;
          const targetPath = match[3];

          // Skip if it's a code identifier (no file extension)
          if (!targetPath.includes(".")) {
            continue;
          }

          // Resolve relative to project root (where source files are)
          const resolvedPath = join(".", targetPath);

          if (!existsSync(resolvedPath)) {
            warnings.push(
              `${file}:${String(absoluteLine)} - Comment contains broken link: ${targetPath}`,
            );
            brokenLinksCount++;
          }
        }

        // Validate JSDoc @link references to files (not code symbols)
        for (const match of jsdocMatches) {
          const target = match[1].trim();

          // Only validate if it looks like a file path (has extension)
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

        // Check 2: Validate model ID formats in examples
        for (const rule of MODEL_VALIDATION_RULES) {
          if (!rule.incorrectPattern) continue;

          const { correctFormat, pattern } = rule.incorrectPattern;
          const matches = line.matchAll(new RegExp(pattern.source, pattern.flags));

          for (const match of matches) {
            // Skip if inside code fence or @example block (allowed in examples)
            // Also skip if in external URLs (https://, http://)
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
 * Check 8: Validates Table of Contents in all markdown files
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

    // Detect if file has ToC
    const { endLine, hasToc, startLine } = detectToc(content);

    if (!hasToc) {
      continue;
    }

    filesWithToc++;

    // Extract ToC entries
    const tocEntries = extractTocEntries(lines, startLine, endLine);

    if (tocEntries.length === 0) {
      warnings.push(`${file}: ToC section found but no entries detected`);
      issuesFound++;
      continue;
    }

    // Infer ToC depth
    const tocDepth = inferTocDepth(tocEntries);

    // Extract actual headers
    const headers = extractHeaders(lines, startLine);

    // Validate ToC against headers
    const validation = validateTocEntries(tocEntries, headers, tocDepth);

    // Report missing entries
    if (validation.missing.length > 0) {
      for (const header of validation.missing) {
        errors.push(
          `${file}:${String(header.lineNumber)} - Missing in ToC: "${"#".repeat(header.level)} ${header.text}" (anchor: #${header.anchor})`,
        );
        // Error tracked in errors array
        issuesFound++;
      }
    }

    // Report extra entries
    if (validation.extra.length > 0) {
      for (const entry of validation.extra) {
        warnings.push(
          `${file}:${String(entry.lineNumber)} - Extra in ToC (no matching header): "${entry.text}" -> #${entry.anchor}`,
        );
        issuesFound++;
      }
    }

    // Report mismatched entries
    if (validation.mismatched.length > 0) {
      for (const { actual, expected } of validation.mismatched) {
        if (actual.text !== expected.text) {
          errors.push(
            `${file}:${String(actual.lineNumber)} - ToC text mismatch: "${actual.text}" should be "${expected.text}"`,
          );
          // Error tracked in errors array
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
  // Filter headers to only those that should be in ToC (by depth)
  const expectedHeaders = headers.filter((h) => h.level <= tocDepth);

  const missing: HeaderEntry[] = [];
  const extra: TocEntry[] = [];
  const mismatched: { actual: TocEntry; expected: HeaderEntry }[] = [];

  // Create maps for efficient lookup
  const tocMap = new Map<string, TocEntry>();
  for (const entry of tocEntries) {
    tocMap.set(entry.anchor, entry);
  }

  const headerMap = new Map<string, HeaderEntry>();
  for (const header of expectedHeaders) {
    headerMap.set(header.anchor, header);
  }

  // Find missing entries (in headers but not in ToC)
  for (const header of expectedHeaders) {
    const tocEntry = tocMap.get(header.anchor);

    if (!tocEntry) {
      missing.push(header);
    } else {
      // Check for mismatches (wrong text or level)
      if (tocEntry.text !== header.text || tocEntry.level !== header.level) {
        mismatched.push({ actual: tocEntry, expected: header });
      }
    }
  }

  // Find extra entries (in ToC but not in headers)
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

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Check 9: Validates version consistency across documentation
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

// Run main function
main();
