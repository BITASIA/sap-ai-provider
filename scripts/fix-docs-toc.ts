#!/usr/bin/env npx tsx
/**
 * SAP AI Provider - Table of Contents Auto-Fix Tool
 *
 * Automatically generates or updates Table of Contents in markdown files.
 * Uses the same detection and inference algorithms as validate-docs.ts
 *
 * Usage:
 *   npm run fix-docs-toc [file]          # Fix specific file
 *   npm run fix-docs-toc                 # Fix all files with existing ToC
 */

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseArgsWithHelp } from "./cli-utils.js";
import {
  logError,
  logInfo,
  logProcessing,
  logSection,
  logSuccess,
  logSummary,
  logWarning,
} from "./console-utils.js";
import {
  detectToc,
  detectTocIndentation,
  extractHeaders,
  generateTocMarkdown,
  inferTocDepth,
  readMarkdownFile,
} from "./markdown-utils.js";
import { DOC_FILES } from "./validation-config.js";

/**
 * Fixes ToC in a file by regenerating entries from headers.
 *
 * @param filePath - Path to markdown file
 * @returns True if ToC was updated, false if skipped
 */
function fixTocInFile(filePath: string): boolean {
  if (!isPathSafe(filePath)) {
    logError(`Unsafe path rejected: ${filePath}`);
    return false;
  }

  logProcessing(`Processing: ${filePath}`);

  const { content, lines } = readMarkdownFile(filePath);

  const { endLine, hasToc, startLine } = detectToc(content);

  if (!hasToc) {
    logInfo("No existing ToC found - skipping");
    console.log(`     (Use --force to add ToC to files without one)`);
    return false;
  }

  console.log(`  📍 Found ToC at lines ${String(startLine + 1)}-${String(endLine + 1)}`);

  const indentSize = detectTocIndentation(lines, startLine, endLine);
  console.log(`  🔍 Detected indentation: ${String(indentSize)} spaces per level`);

  const headers = extractHeaders(lines, startLine);
  console.log(`  📋 Found ${String(headers.length)} headers in document`);

  if (headers.length === 0) {
    logWarning("No headers found - nothing to generate");
    return false;
  }

  const tocDepth = inferTocDepth(headers);
  const filteredHeaders = headers.filter((h) => h.level <= tocDepth);
  console.log(`  📊 ToC depth: ${String(tocDepth)} (${String(filteredHeaders.length)} entries)`);

  const newTocContent = generateTocMarkdown(headers, tocDepth, indentSize);

  if (!newTocContent || newTocContent.trim().length === 0) {
    logWarning("Generated ToC is empty - skipping update");
    return false;
  }

  const generatedLines = newTocContent.split("\n");
  if (generatedLines.length !== filteredHeaders.length) {
    logWarning(
      `Generated ToC mismatch: expected ${String(filteredHeaders.length)} lines, got ${String(generatedLines.length)}`,
    );
  }

  const beforeToc = lines.slice(0, startLine + 1);
  const afterToc = lines.slice(endLine);

  const newLines = [...beforeToc, "", ...generatedLines, "", ...afterToc];

  const newContent = newLines.join("\n");

  writeFileSync(filePath, newContent, "utf-8");

  logSuccess(`ToC updated successfully (${String(filteredHeaders.length)} entries)`);
  return true;
}

/**
 * Validates that a file path is safe (within current working directory).
 * Prevents path traversal attacks.
 *
 * @param filePath - Path to validate
 * @returns True if path is safe, false otherwise
 */
function isPathSafe(filePath: string): boolean {
  const cwd = process.cwd();
  const resolved = resolve(cwd, filePath);
  return resolved.startsWith(cwd + "/") || resolved === cwd;
}

/** CLI entry point. Fixes ToC in specified file or all documentation files. */
function main(): void {
  const args = parseArgsWithHelp({
    description: "SAP AI Provider - Documentation ToC Auto-Fix",
    usageExamples: [
      "npm run fix-docs-toc",
      "npm run fix-docs-toc [file]",
      "npm run fix-docs-toc -- --help",
    ],
  });

  logSection("🔧 SAP AI Provider - Documentation ToC Auto-Fix");

  const filesToProcess = args.files.length > 0 ? args.files : [...DOC_FILES];

  let fixed = 0;
  let skipped = 0;

  for (const file of filesToProcess) {
    if (existsSync(file)) {
      if (fixTocInFile(file)) {
        fixed++;
      } else {
        skipped++;
      }
    }
  }

  console.log("");
  console.log("=".repeat(60));
  logSummary({ Fixed: fixed, Skipped: skipped });

  if (fixed > 0) {
    logSuccess("ToC fixes applied successfully!");
    console.log("   Run 'npm run validate-docs' to verify.\n");
  }
}

main();
