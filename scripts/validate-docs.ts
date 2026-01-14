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
 * 4. Dotenv imports in code examples
 * 5. Link format consistency (./path vs path)
 * 6. Required documentation files existence
 * 7. Version consistency across docs
 *
 * Usage:
 *   npm run validate-docs
 *   npx tsx scripts/validate-docs.ts
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// ============================================================================
// Types and Interfaces
// ============================================================================

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

interface FileThreshold {
  file: string;
  threshold: number;
}

interface PackageJson {
  version: string;
  [key: string]: unknown;
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
const EXCLUDED_DIRS = ["node_modules", ".git", "DOC_", "PHASE"] as const;

/** Regex patterns for detecting model IDs */
const MODEL_ID_PATTERNS = [
  /"gpt-4[o\d.-]*"/gi,
  /"gemini-[\d.]+-\w+"/gi,
  /"anthropic--claude-[\d.-]+\w*"/gi,
  /"amazon--\w+"/gi,
  /"meta--llama\d+/gi,
  /"mistralai--\w+"/gi,
] as const;

// ============================================================================
// Global State
// ============================================================================

const results: ValidationResult = {
  passed: true,
  errors: [],
  warnings: [],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Recursively finds all markdown files in a directory.
 *
 * @param dir - Directory to search
 * @param exclude - Patterns to exclude from search
 * @returns Array of relative file paths
 */
function findMarkdownFiles(
  dir: string,
  exclude: readonly string[] = [],
): string[] {
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
 * Safely reads and parses a JSON file.
 *
 * @param filePath - Path to JSON file
 * @returns Parsed JSON object or null if error
 */
function readJsonFile(filePath: string): PackageJson | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch (error) {
    results.warnings.push(
      `Failed to parse JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
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
 * Checks if a line contains an inline code example with markdown links.
 *
 * @param line - Line to check
 * @returns True if line has inline code with markdown syntax
 */
function hasInlineCodeExample(line: string): boolean {
  return line.includes("`[") && line.includes("](");
}

// ============================================================================
// Validation Checks
// ============================================================================

/**
 * Check 1: Verifies that all public exports are documented in API_REFERENCE.md
 */
function validatePublicExportsDocumented(): void {
  console.log("1️⃣  Checking public exports are documented...");

  const indexPath = "src/index.ts";
  const apiRefPath = "API_REFERENCE.md";

  if (!existsSync(indexPath) || !existsSync(apiRefPath)) {
    results.errors.push("Missing src/index.ts or API_REFERENCE.md");
    results.passed = false;
    console.log("  ❌ Critical files missing");
    return;
  }

  const indexContent = readFileSync(indexPath, "utf-8");
  const apiRefContent = readFileSync(apiRefPath, "utf-8");

  // Extract all exports from index.ts
  const exports = new Set<string>();

  // Direct exports: export const/function/class/type/interface NAME
  const directExports = Array.from(
    indexContent.matchAll(
      /export\s+(?:const|function|class|type|interface)\s+(\w+)/g,
    ),
  );
  for (const match of directExports) {
    exports.add(match[1]);
  }

  // Re-exports: export { NAME1, NAME2, ... }
  const reExportMatches = Array.from(
    indexContent.matchAll(/export\s*\{\s*([^}]+)\s*\}/g),
  );
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
      results.warnings.push(
        `Critical export '${exportName}' not found in src/index.ts`,
      );
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
      results.warnings.push(
        `Export '${exportName}' not documented in API_REFERENCE.md`,
      );
      undocumented++;
    }
  }

  if (undocumented > 0) {
    console.log(
      `  ⚠️  ${String(undocumented)}/${String(CRITICAL_EXPORTS.length)} critical exports not documented`,
    );
  } else {
    console.log(
      `  ✅ All ${String(CRITICAL_EXPORTS.length)} critical exports documented`,
    );
  }
}

/**
 * Check 2: Detects broken internal markdown links
 */
function validateInternalLinks(): void {
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
      const linkPattern =
        /\[([^\]]+)\]\(((?!https?:\/\/)(?:\.\/)?([^)#]+\.md))(#[^)]+)?\)/g;
      const matches = Array.from(line.matchAll(linkPattern));

      for (const match of matches) {
        const fullPath = match[2]; // The full path without # anchor
        const targetFile = match[3]; // Just the filename

        // Skip if it looks like a URL (safety check)
        if (fullPath.includes("://")) {
          continue;
        }

        // Resolve target path relative to the source file's directory
        const sourceDir = file.includes("/")
          ? file.substring(0, file.lastIndexOf("/"))
          : ".";
        const resolvedPath = join(sourceDir, fullPath);

        if (!existsSync(resolvedPath)) {
          results.errors.push(
            `${file}:${String(i + 1)} - Broken link to ${targetFile}`,
          );
          results.passed = false;
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
}

/**
 * Check 3: Detects excessive hardcoded model ID lists
 */
function validateModelLists(): void {
  console.log("\n3️⃣  Checking for excessive hardcoded model lists...");

  for (const { file, threshold } of MODEL_CHECK_FILES) {
    if (!existsSync(file)) {
      continue;
    }

    const content = readFileSync(file, "utf-8");

    // Count model ID mentions
    let modelMentions = 0;
    for (const pattern of MODEL_ID_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        modelMentions += matches.length;
      }
    }

    if (modelMentions > threshold) {
      results.warnings.push(
        `${file}: ${String(modelMentions)} model IDs (threshold: ${String(threshold)}). ` +
          `Consider using representative examples instead of exhaustive lists.`,
      );
      console.log(
        `  ⚠️  ${file}: ${String(modelMentions)} model mentions (may be excessive)`,
      );
    } else {
      console.log(
        `  ✅ ${file}: ${String(modelMentions)} model mentions (within threshold)`,
      );
    }
  }
}

/**
 * Check 4: Validates dotenv imports in code examples
 */
function validateDotenvImports(): void {
  console.log("\n4️⃣  Checking dotenv imports in documentation...");

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
        results.warnings.push(
          `${file}: Code example with createSAPAIProvider missing dotenv import or env setup comment`,
        );
        issuesFound++;
        break; // Only report once per file
      }
    }
  }

  if (issuesFound > 0) {
    console.log(
      `  ⚠️  ${String(issuesFound)} files with potential dotenv import issues`,
    );
  } else {
    console.log("  ✅ All code examples have proper environment setup");
  }
}

/**
 * Check 5: Validates link format consistency (./file.md vs file.md)
 */
function validateLinkFormat(): void {
  console.log("\n5️⃣  Checking link format consistency...");

  const mdFiles = findMarkdownFiles(".", ["node_modules", ".git"]);
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
      const badLinkPattern =
        /\[([^\]]+)\]\((?!\.\/|https?:\/\/|#)([^)]+\.md[^)]*)\)/g;
      const matches = Array.from(line.matchAll(badLinkPattern));

      for (const match of matches) {
        results.warnings.push(
          `${file}:${String(i + 1)} - Relative link without ./ prefix: ${match[2]}`,
        );
        badLinksCount++;
      }
    }
  }

  if (badLinksCount > 0) {
    console.log(
      `  ⚠️  ${String(badLinksCount)} links without ./ prefix (should be: ./FILE.md)`,
    );
  } else {
    console.log("  ✅ All links use correct format");
  }
}

/**
 * Check 6: Verifies required documentation files exist
 */
function validateRequiredFiles(): void {
  console.log("\n6️⃣  Checking required documentation files...");

  let missingCount = 0;

  for (const file of REQUIRED_FILES) {
    if (!existsSync(file)) {
      results.errors.push(`Missing required file: ${file}`);
      results.passed = false;
      missingCount++;
    }
  }

  if (missingCount > 0) {
    console.log(`  ❌ ${String(missingCount)} required files missing`);
  } else {
    console.log(
      `  ✅ All ${String(REQUIRED_FILES.length)} required files present`,
    );
  }
}

/**
 * Check 7: Validates version consistency across documentation
 */
function validateVersionConsistency(): void {
  console.log("\n7️⃣  Checking version consistency...");

  if (!existsSync("package.json")) {
    results.warnings.push("package.json not found");
    console.log("  ⚠️  package.json not found");
    return;
  }

  const pkg = readJsonFile("package.json");
  if (!pkg?.version) {
    results.warnings.push("Unable to read version from package.json");
    console.log("  ⚠️  Unable to read version");
    return;
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
    results.warnings.push(
      `Version ${version} not mentioned in key documentation files`,
    );
    console.log(`  ⚠️  Version not mentioned in docs (may need update)`);
  } else {
    console.log(
      `  ✅ Version mentioned in ${String(mentionedCount)}/${String(VERSION_CHECK_FILES.length)} key files`,
    );
  }
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Runs all validation checks and reports results.
 */
function main(): void {
  console.log("📚 SAP AI Provider - Documentation Validation");
  console.log("=".repeat(60));
  console.log("");

  try {
    validatePublicExportsDocumented();
    validateInternalLinks();
    validateModelLists();
    validateDotenvImports();
    validateLinkFormat();
    validateRequiredFiles();
    validateVersionConsistency();
  } catch (error) {
    results.errors.push(
      `Validation error: ${error instanceof Error ? error.message : String(error)}`,
    );
    results.passed = false;
  }

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

// Run main function
main();
