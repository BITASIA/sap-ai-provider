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

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type { HeaderEntry } from "./markdown-utils.js";

import {
  detectToc,
  detectTocIndentation,
  extractHeaders,
  inferTocDepth,
} from "./markdown-utils.js";

/**
 * Fixes ToC in a file by regenerating entries from headers.
 *
 * @param filePath - Path to markdown file
 * @returns True if ToC was updated, false if skipped
 */
function fixTocInFile(filePath: string): boolean {
  console.log(`\n📄 Processing: ${filePath}`);

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const { endLine, hasToc, startLine } = detectToc(content);

  if (!hasToc) {
    console.log(`  ℹ️  No existing ToC found - skipping`);
    console.log(`     (Use --force to add ToC to files without one)`);
    return false;
  }

  console.log(`  📍 Found ToC at lines ${String(startLine + 1)}-${String(endLine + 1)}`);

  const indentSize = detectTocIndentation(lines, startLine, endLine);
  console.log(`  🔍 Detected indentation: ${String(indentSize)} spaces per level`);

  const headers = extractHeaders(lines, startLine);
  console.log(`  📋 Found ${String(headers.length)} headers in document`);

  if (headers.length === 0) {
    console.log(`  ⚠️  No headers found - nothing to generate`);
    return false;
  }

  const tocDepth = inferTocDepth(headers);
  const filteredHeaders = headers.filter((h) => h.level <= tocDepth);
  console.log(`  📊 ToC depth: ${String(tocDepth)} (${String(filteredHeaders.length)} entries)`);

  const newTocContent = generateTocMarkdown(headers, tocDepth, indentSize);

  if (!newTocContent || newTocContent.trim().length === 0) {
    console.log(`  ⚠️  Generated ToC is empty - skipping update`);
    return false;
  }

  const generatedLines = newTocContent.split("\n");
  if (generatedLines.length !== filteredHeaders.length) {
    console.log(
      `  ⚠️  Generated ToC mismatch: expected ${String(filteredHeaders.length)} lines, got ${String(generatedLines.length)}`,
    );
  }

  const beforeToc = lines.slice(0, startLine + 1);
  const afterToc = lines.slice(endLine);

  const newLines = [...beforeToc, "", ...generatedLines, "", ...afterToc];

  const newContent = newLines.join("\n");

  writeFileSync(filePath, newContent, "utf-8");

  console.log(`  ✅ ToC updated successfully (${String(filteredHeaders.length)} entries)`);
  return true;
}

/**
 * Generates ToC markdown from headers.
 *
 * @param headers - Headers to include
 * @param maxDepth - Maximum header level
 * @param indentSize - Spaces per level (default: 2)
 * @returns Markdown list with anchors
 */
function generateTocMarkdown(headers: HeaderEntry[], maxDepth: number, indentSize = 2): string {
  const filteredHeaders = headers.filter((h) => h.level <= maxDepth);
  const lines: string[] = [];

  for (const header of filteredHeaders) {
    const indent = " ".repeat((header.level - 2) * indentSize);
    const line = `${indent}- [${header.text}](#${header.anchor})`;
    lines.push(line);
  }

  return lines.join("\n");
}

/** CLI entry point. Fixes ToC in specified file or all documentation files. */
function main(): void {
  const args = process.argv.slice(2);

  console.log("🔧 SAP AI Provider - Documentation ToC Auto-Fix");
  console.log("=".repeat(60));

  if (args.length === 0) {
    const files = [
      "README.md",
      "API_REFERENCE.md",
      "ARCHITECTURE.md",
      "ENVIRONMENT_SETUP.md",
      "MIGRATION_GUIDE.md",
      "TROUBLESHOOTING.md",
      "CONTRIBUTING.md",
    ];

    let fixed = 0;
    let skipped = 0;

    for (const file of files) {
      if (existsSync(file)) {
        if (fixTocInFile(file)) {
          fixed++;
        } else {
          skipped++;
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`  Fixed:   ${String(fixed)}`);
    console.log(`  Skipped: ${String(skipped)}`);
    console.log("");

    if (fixed > 0) {
      console.log("✅ ToC fixes applied successfully!");
      console.log("   Run 'npm run validate-docs' to verify.\n");
    }
  } else {
    const file = args[0];
    fixTocInFile(file);
  }
}

main();
