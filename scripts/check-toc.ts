/**
 * ToC (Table of Contents) Validation Script
 *
 * Validates that ToCs in Markdown files are synchronized with their headings.
 * @module scripts/check-toc
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/** Heading extracted from markdown content */
export interface Heading {
  baseSlug: string;
  level: number;
  slug: string;
  text: string;
}

/** ToC entry extracted from markdown content */
export interface TocEntry {
  slug: string;
  text: string;
}

/** Result of ToC validation for a single file */
export interface ValidationResult {
  errors: string[];
  skipped: boolean;
  valid: boolean;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract headings from markdown content, excluding code blocks.
 * Handles duplicate headings with GitHub-style suffixes (-1, -2, etc.).
 * @param content - Markdown file content
 * @returns Array of extracted headings with slugs
 */
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const slugCounts = new Map<string, number>();
  let inCodeBlock = false;

  for (const line of content.split("\n")) {
    if (/^(`{3,}|~{3,})/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      const level = match[1].length;
      const rawText = match[2];

      const text = rawText
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();

      const baseSlug = slugify(text);
      const count = slugCounts.get(baseSlug) ?? 0;
      slugCounts.set(baseSlug, count + 1);

      const slug = count === 0 ? baseSlug : `${baseSlug}-${String(count)}`;

      headings.push({ baseSlug, level, slug, text });
    }
  }

  return headings;
}

/**
 * Extract ToC entries from markdown content (case-insensitive).
 * @param content - Markdown file content
 * @returns Array of ToC entries
 */
export function extractTocEntries(content: string): TocEntry[] {
  const entries: TocEntry[] = [];

  const tocMatch = /##\s+Table of Contents\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i.exec(content);
  if (!tocMatch) return entries;

  const tocSection = tocMatch[1];
  const linkRegex = /\[([^\]]+)\]\(#([^)]+)\)/g;
  let match: null | RegExpExecArray;
  while ((match = linkRegex.exec(tocSection)) !== null) {
    entries.push({ slug: match[2], text: match[1] });
  }

  return entries;
}

/**
 * Run ToC validation on specified files or all .md files in current directory.
 * @param args - File paths to validate
 * @returns Exit code (0 for success, 1 for errors)
 */
export function run(args: string[]): number {
  let files = args;

  if (files.length === 0) {
    files = readdirSync(".")
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(".", f));
  }

  let hasErrors = false;
  let checkedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    try {
      const result = validateToc(file);

      if (result.skipped) {
        skippedCount++;
        continue;
      }

      checkedCount++;

      if (!result.valid) {
        hasErrors = true;
        console.error(`\x1b[31m✗ ${file}\x1b[0m`);
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
      } else {
        console.log(`\x1b[32m✓ ${file}\x1b[0m`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\x1b[31m✗ ${file}: ${message}\x1b[0m`);
      hasErrors = true;
    }
  }

  console.log(
    `\nChecked ${String(checkedCount)} file(s), skipped ${String(skippedCount)} (no ToC)`,
  );

  if (hasErrors) {
    console.error("\n\x1b[31mToC validation failed\x1b[0m");
    return 1;
  } else {
    console.log("\x1b[32mAll ToCs are valid\x1b[0m");
    return 0;
  }
}

/**
 * Generate GitHub-compatible slug from heading text.
 * Note: Does NOT collapse multiple hyphens from removed special chars.
 * @param text - Heading text to slugify
 * @returns GitHub-compatible anchor slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validate ToC against actual headings in a file.
 * @param filePath - Path to the markdown file
 * @returns Validation result
 */
export function validateToc(filePath: string): ValidationResult {
  const content = readFileSync(filePath, "utf-8");
  return validateTocContent(content);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Validate ToC against actual headings from content string.
 * @param content - Markdown content to validate
 * @returns Validation result
 */
export function validateTocContent(content: string): ValidationResult {
  const errors: string[] = [];

  const tocEntries = extractTocEntries(content);
  if (tocEntries.length === 0) {
    return { errors: [], skipped: true, valid: true };
  }

  const headings = extractHeadings(content);

  const validSlugs = new Set<string>();
  for (const h of headings) {
    if (h.text.toLowerCase() !== "table of contents") {
      validSlugs.add(h.slug);
      validSlugs.add(h.baseSlug);
    }
  }

  for (const entry of tocEntries) {
    if (!validSlugs.has(entry.slug)) {
      const similar = [...validSlugs].find(
        (s) => s.includes(entry.slug.replace(/-\d+$/, "")) || entry.slug.includes(s),
      );
      if (similar) {
        errors.push(`ToC link "#${entry.slug}" not found. Did you mean "#${similar}"?`);
      } else {
        errors.push(`ToC link "#${entry.slug}" (${entry.text}) has no matching heading`);
      }
    }
  }

  const tocSlugs = new Set(tocEntries.map((e) => e.slug));
  for (const heading of headings) {
    if (
      heading.level === 2 &&
      heading.text.toLowerCase() !== "table of contents" &&
      !tocSlugs.has(heading.slug) &&
      !tocSlugs.has(heading.baseSlug)
    ) {
      errors.push(`Heading "${heading.text}" (h2) is not in ToC`);
    }
  }

  return { errors, skipped: false, valid: errors.length === 0 };
}

// Run CLI if executed directly
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("check-toc.ts") || process.argv[1].endsWith("check-toc.js"));

if (isMainModule) {
  const exitCode = run(process.argv.slice(2));
  process.exit(exitCode);
}
