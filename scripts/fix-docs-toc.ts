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

import { readFileSync, writeFileSync, existsSync } from "fs";

// ============================================================================
// Helper Functions (duplicated from validate-docs.ts for independence)
// ============================================================================

interface HeaderEntry {
  text: string;
  anchor: string;
  level: number;
  lineNumber: number;
}

/**
 * Converts header text to a GitHub-compatible anchor.
 *
 * GitHub's anchor generation rules (verified):
 * - Keep: Unicode letters (\p{L}), numbers (\p{N}), spaces, hyphens, underscores
 * - Remove: emoji, punctuation, special symbols, backticks
 * - Spaces → hyphens, collapse multiple hyphens, trim hyphens
 */
function textToAnchor(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s/g, "-")
    .replace(/[-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Detects if a file contains a Table of Contents section.
 */
function detectToc(content: string): {
  hasToc: boolean;
  startLine: number;
  endLine: number;
} {
  const lines = content.split("\n");
  const tocPatterns = [
    /^##\s+Table of Contents$/i,
    /^##\s+Contents$/i,
    /^##\s+ToC$/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    for (const pattern of tocPatterns) {
      if (pattern.test(line)) {
        let endLine = i + 1;
        let emptyLines = 0;

        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();

          if (/^##\s+/.test(nextLine)) {
            endLine = j;
            break;
          }

          if (nextLine === "") {
            emptyLines++;
            if (emptyLines >= 2) {
              endLine = j;
              break;
            }
          } else {
            emptyLines = 0;
          }
        }

        return { hasToc: true, startLine: i, endLine };
      }
    }
  }

  return { hasToc: false, startLine: -1, endLine: -1 };
}

/**
 * Infers ToC depth from document structure.
 * Uses heuristic: include levels that have >3 entries OR are level 2.
 */
function inferTocDepthFromHeaders(headers: HeaderEntry[]): number {
  if (headers.length === 0) return 2;

  const levelCounts = new Map<number, number>();
  for (const header of headers) {
    levelCounts.set(header.level, (levelCounts.get(header.level) ?? 0) + 1);
  }

  const levels = Array.from(levelCounts.keys()).sort((a, b) => a - b);
  let maxDepth = 2;

  for (const level of levels) {
    const count = levelCounts.get(level) ?? 0;

    // Include this level if:
    // - It's level 2 (always include ##)
    // - It has more than 3 entries
    // - Previous level had entries (maintain hierarchy)
    if (level === 2 || count > 3 || (level === maxDepth + 1 && count > 1)) {
      maxDepth = level;
    }
  }

  return maxDepth;
}

/**
 * Generates ToC markdown from headers.
 */
function generateTocMarkdown(headers: HeaderEntry[], maxDepth: number): string {
  const filteredHeaders = headers.filter((h) => h.level <= maxDepth);
  const lines: string[] = [];

  for (const header of filteredHeaders) {
    const indent = "  ".repeat(header.level - 2);
    const line = `${indent}- [${header.text}](#${header.anchor})`;
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Extracts actual headers from the document.
 */
function extractHeaders(lines: string[], tocStartLine: number): HeaderEntry[] {
  const headers: HeaderEntry[] = [];
  let inCodeBlock = false;

  // Track anchor duplicates (GitHub adds -1, -2, etc.)
  const anchorCounts = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock || i === tocStartLine) {
      continue;
    }

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
        text,
        anchor,
        level,
        lineNumber: i + 1,
      });
    }
  }

  return headers;
}

/**
 * Fixes the ToC in a specific file.
 */
function fixTocInFile(filePath: string): boolean {
  console.log(`\n📄 Processing: ${filePath}`);

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const { hasToc, startLine, endLine } = detectToc(content);

  if (!hasToc) {
    console.log(`  ℹ️  No existing ToC found - skipping`);
    console.log(`     (Use --force to add ToC to files without one)`);
    return false;
  }

  console.log(
    `  📍 Found ToC at lines ${String(startLine + 1)}-${String(endLine + 1)}`,
  );

  // Extract headers
  const headers = extractHeaders(lines, startLine);
  console.log(`  📋 Found ${String(headers.length)} headers in document`);

  if (headers.length === 0) {
    console.log(`  ⚠️  No headers found - nothing to generate`);
    return false;
  }

  // Infer depth
  const tocDepth = inferTocDepthFromHeaders(headers);
  const filteredHeaders = headers.filter((h) => h.level <= tocDepth);
  console.log(
    `  📊 ToC depth: ${String(tocDepth)} (${String(filteredHeaders.length)} entries)`,
  );

  // Generate new ToC
  const newTocContent = generateTocMarkdown(headers, tocDepth);

  // Replace ToC section
  const beforeToc = lines.slice(0, startLine + 1);
  const afterToc = lines.slice(endLine);

  const newLines = [
    ...beforeToc,
    "",
    ...newTocContent.split("\n"),
    "",
    ...afterToc,
  ];

  const newContent = newLines.join("\n");

  // Write back
  writeFileSync(filePath, newContent, "utf-8");

  console.log(`  ✅ ToC updated successfully`);
  return true;
}

// ============================================================================
// Main Execution
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);

  console.log("🔧 SAP AI Provider - Documentation ToC Auto-Fix");
  console.log("=".repeat(60));

  if (args.length === 0) {
    // Fix all major documentation files with existing ToC
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
    // Fix specific file
    const file = args[0];
    fixTocInFile(file);
  }
}

main();
