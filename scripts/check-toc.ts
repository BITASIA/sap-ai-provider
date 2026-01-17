/**
 * ToC (Table of Contents) Validation Script
 *
 * Validates that Table of Contents in Markdown files are synchronized
 * with their actual headings. Designed to work with manually-written ToCs
 * without requiring special markers.
 * @module scripts/check-toc
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/** Represents a heading extracted from markdown content */
export interface Heading {
  /** Base slug before duplicate suffix was added */
  baseSlug: string;
  /** Heading level (1-6) */
  level: number;
  /** GitHub-compatible anchor slug */
  slug: string;
  /** Original heading text (cleaned of markdown formatting) */
  text: string;
}

/** Represents a ToC entry extracted from markdown content */
export interface TocEntry {
  /** Target anchor slug */
  slug: string;
  /** Display text of the ToC link */
  text: string;
}

/** Result of ToC validation for a single file */
export interface ValidationResult {
  /** List of validation errors */
  errors: string[];
  /** Whether the file was skipped (no ToC found) */
  skipped: boolean;
  /** Whether the ToC is valid */
  valid: boolean;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract headings from markdown content, excluding code blocks.
 *
 * Handles:
 * - ATX-style headings (# Heading)
 * - Headings inside code blocks (excluded)
 * - Duplicate headings (GitHub-style suffix -1, -2, etc.)
 * - Markdown formatting in headings (bold, italic, code, links)
 * @param content - Markdown file content
 * @returns Array of extracted headings with slugs
 */
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const slugCounts = new Map<string, number>();
  let inCodeBlock = false;

  for (const line of content.split("\n")) {
    // Toggle code block state (handles ``` and ~~~)
    if (/^(`{3,}|~{3,})/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    // Match ATX headings (# Heading)
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      const level = match[1].length;
      const rawText = match[2];

      // Clean markdown formatting from heading text
      const text = rawText
        .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold **text**
        .replace(/\*([^*]+)\*/g, "$1") // Remove italic *text*
        .replace(/__([^_]+)__/g, "$1") // Remove bold __text__
        .replace(/_([^_]+)_/g, "$1") // Remove italic _text_
        .replace(/`([^`]+)`/g, "$1") // Remove inline code `text`
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links [text](url)
        .trim();

      const baseSlug = slugify(text);

      // GitHub adds -1, -2, etc. for duplicate headings
      const count = slugCounts.get(baseSlug) ?? 0;
      slugCounts.set(baseSlug, count + 1);

      const slug = count === 0 ? baseSlug : `${baseSlug}-${String(count)}`;

      headings.push({ baseSlug, level, slug, text });
    }
  }

  return headings;
}

/**
 * Extract ToC entries from markdown content.
 *
 * Looks for a "Table of Contents" section (case-insensitive) and extracts
 * all markdown links with anchor targets.
 * @param content - Markdown file content
 * @returns Array of ToC entries
 */
export function extractTocEntries(content: string): TocEntry[] {
  const entries: TocEntry[] = [];

  // Find ToC section (## Table of Contents followed by content until next h2/h1)
  const tocMatch = /##\s+Table of Contents\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i.exec(content);
  if (!tocMatch) return entries;

  const tocSection = tocMatch[1];

  // Extract links from ToC: [text](#anchor)
  const linkRegex = /\[([^\]]+)\]\(#([^)]+)\)/g;
  let match: null | RegExpExecArray;
  while ((match = linkRegex.exec(tocSection)) !== null) {
    entries.push({
      slug: match[2],
      text: match[1],
    });
  }

  return entries;
}

/**
 * Run ToC validation on specified files or all .md files in current directory.
 * @param args - Command line arguments (file paths)
 * @returns Exit code (0 for success, 1 for validation errors)
 */
export function run(args: string[]): number {
  let files = args;

  if (files.length === 0) {
    // Default: check all .md files in root (not in subdirs)
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
 *
 * GitHub's algorithm:
 * 1. Convert to lowercase
 * 2. Replace spaces with hyphens
 * 3. Remove non-word characters except hyphens
 * 4. Trim leading/trailing hyphens
 *
 * Note: GitHub does NOT collapse multiple hyphens that result from
 * removing special characters like `&` or `/`.
 * @param text - The heading text to slugify
 * @returns GitHub-compatible anchor slug
 * @example
 * slugify("Hello World") // "hello-world"
 * slugify("Error Handling & Reference") // "error-handling--reference"
 * slugify("Option 1: Factory") // "option-1-factory"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-") // Spaces to hyphens
    .replace(/[^\w-]/g, "") // Remove non-word chars except hyphen
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens
}

/**
 * Validate ToC against actual headings in a file.
 *
 * Checks:
 * 1. All ToC links point to existing headings
 * 2. All h2 headings are present in ToC (warning level)
 * @param filePath - Path to the markdown file
 * @returns Validation result with errors if any
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
 *
 * This is the core validation logic, separated from file I/O for testability.
 * @param content - Markdown content to validate
 * @returns Validation result with errors if any
 */
export function validateTocContent(content: string): ValidationResult {
  const errors: string[] = [];

  const tocEntries = extractTocEntries(content);
  if (tocEntries.length === 0) {
    // No ToC found - skip validation
    return { errors: [], skipped: true, valid: true };
  }

  const headings = extractHeadings(content);

  // Build set of valid slugs (both full slug and base slug for flexibility)
  const validSlugs = new Set<string>();
  for (const h of headings) {
    if (h.text.toLowerCase() !== "table of contents") {
      validSlugs.add(h.slug);
      validSlugs.add(h.baseSlug);
    }
  }

  // Check each ToC entry points to a valid heading
  for (const entry of tocEntries) {
    if (!validSlugs.has(entry.slug)) {
      // Try to find similar slugs for better error messages
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

  // Check for h2 headings that should be in ToC but aren't
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
// Note: Using import.meta.url check for ESM compatibility
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("check-toc.ts") || process.argv[1].endsWith("check-toc.js"));

if (isMainModule) {
  const exitCode = run(process.argv.slice(2));
  process.exit(exitCode);
}
