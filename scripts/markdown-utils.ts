/**
 * Shared utilities for markdown documentation processing.
 * Used by validate-docs.ts and fix-docs-toc.ts to ensure consistency.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Markdown header with anchor and position. */
export interface HeaderEntry {
  /** GitHub-style anchor (e.g., "hello-world"). */
  anchor: string;
  /** Header level (2-6 for ## to ######). */
  level: number;
  /** 1-based line number for error reporting. */
  lineNumber: number;
  /** Header text without # symbols. */
  text: string;
}

/** Table of Contents entry (same structure as HeaderEntry). */
export interface TocEntry {
  /** GitHub-style anchor. */
  anchor: string;
  /** Header level (2-6). */
  level: number;
  /** 1-based line number. */
  lineNumber: number;
  /** Header text. */
  text: string;
}

/**
 * Detects Table of Contents section in markdown.
 * ToC ends at next ## header OR 2 consecutive empty lines.
 *
 * @param content - Markdown content
 * @returns Detection result with 0-based line indices
 */
export function detectToc(content: string): {
  /** 0-based index of last ToC line. */
  endLine: number;
  /** Whether ToC was found. */
  hasToc: boolean;
  /** 0-based index of ToC header line. */
  startLine: number;
} {
  const lines = content.split("\n");
  const tocPatterns = [/^##\s+Table of Contents$/i, /^##\s+Contents$/i, /^##\s+ToC$/i];

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
          } else {
            emptyLines = 0;
          }

          if (emptyLines >= 2) {
            endLine = j - 1;
            break;
          }
        }

        return { endLine, hasToc: true, startLine: i };
      }
    }
  }

  return { endLine: -1, hasToc: false, startLine: -1 };
}

/**
 * Detects indentation from existing ToC entries.
 *
 * @param lines - File lines
 * @param startLine - 0-based ToC start
 * @param endLine - 0-based ToC end
 * @returns Spaces per indent level (default: 2)
 */
export function detectTocIndentation(lines: string[], startLine: number, endLine: number): number {
  const tocPattern = /^(\s*)[-*]\s+\[/;

  for (let i = startLine + 1; i < endLine; i++) {
    const match = tocPattern.exec(lines[i]);
    if (match) {
      const indent = match[1].length;
      if (indent > 0) {
        return indent;
      }
    }
  }

  return 2;
}

/**
 * Extracts headers (## to ######) from markdown.
 * Skips code blocks and ToC header. Handles duplicate anchors with -1, -2 suffixes.
 *
 * @param lines - Markdown lines
 * @param tocStartLine - 0-based ToC header index to skip (-1 if none)
 * @returns Headers with 1-based line numbers
 */
export function extractHeaders(lines: string[], tocStartLine: number): HeaderEntry[] {
  const headers: HeaderEntry[] = [];
  const inCodeBlock = trackCodeBlocks(lines);
  const anchorCounts = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    if (inCodeBlock[i] || i === tocStartLine) {
      continue;
    }

    const line = lines[i];
    const headerMatch = /^(#{2,6})\s+(.+)$/.exec(line);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2].trim();
      let anchor = textToAnchor(text);

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
 * Extracts ToC entries from markdown list.
 *
 * @param lines - File lines
 * @param startLine - 0-based ToC start
 * @param endLine - 0-based ToC end
 * @returns ToC entries with 1-based lineNumber
 */
export function extractTocEntries(lines: string[], startLine: number, endLine: number): TocEntry[] {
  const entries: TocEntry[] = [];
  const tocPattern = /^(\s*)[-*]\s+\[([^\]]+)\]\(#([^)]+)\)/;

  for (let i = startLine + 1; i < endLine; i++) {
    const line = lines[i];
    const match = tocPattern.exec(line);

    if (match) {
      const indent = match[1].length;
      const text = match[2];
      const anchor = match[3];
      const level = Math.floor(indent / 2) + 2;

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
 * Finds all .md files recursively, excluding specified directories.
 *
 * @param dir - Root directory
 * @param exclude - Directories to skip
 * @returns Relative paths to .md files
 */
export function findMarkdownFiles(dir: string, exclude: readonly string[] = []): string[] {
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
 * Infers ToC depth from header distribution.
 * Includes levels with ≥10% representation.
 *
 * @param headers - Headers to analyze
 * @returns Max depth (2-6, minimum 2)
 */
export function inferTocDepth(headers: HeaderEntry[]): number {
  const levelCounts = new Map<number, number>();

  for (const header of headers) {
    levelCounts.set(header.level, (levelCounts.get(header.level) ?? 0) + 1);
  }

  const totalHeaders = headers.length;
  const threshold = 0.1;
  let maxDepth = 2;

  for (const [level, count] of levelCounts.entries()) {
    if (count / totalHeaders >= threshold) {
      maxDepth = Math.max(maxDepth, level);
    }
  }

  return maxDepth;
}

/**
 * Reads and parses JSON file safely.
 *
 * @param filePath - Path to .json file
 * @returns Parsed object or null on error
 */
export function readJsonFile(filePath: string): null | Record<string, unknown> {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Converts header text to GitHub-compatible anchor.
 *
 * @param text - Header text
 * @returns Lowercase, hyphenated anchor
 * @example
 * textToAnchor("Hello World") // "hello-world"
 * textToAnchor("🚀 Getting Started") // "getting-started"
 * textToAnchor("API: `createProvider()`") // "api-createprovider"
 * textToAnchor("`createSAPAIProvider(options?)`") // "createsapaiprovider"
 */
export function textToAnchor(text: string): string {
  return (
    text
      .toLowerCase()
      // Extract content from backticks (remove backticks but keep content)
      .replaceAll(/`([^`]+)`/g, "$1")
      // Remove emojis
      .replaceAll(/[\u{1F300}-\u{1F9FF}]/gu, "")
      .replaceAll(/[\u{2600}-\u{26FF}]/gu, "")
      .replaceAll(/[\u{2700}-\u{27BF}]/gu, "")
      // Remove special characters, keep alphanumeric, spaces, hyphens, underscores
      .replaceAll(/[^\da-z\s-_]/g, "")
      // Collapse multiple spaces to single hyphen
      .replaceAll(/\s+/g, "-")
      // Collapse multiple hyphens to single hyphen
      .replaceAll(/-+/g, "-")
      // Trim leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * Tracks which lines are inside code blocks.
 * Matches opening/closing backtick counts (3+).
 *
 * @param lines - Markdown lines
 * @returns Boolean array (true = inside code block)
 */
export function trackCodeBlocks(lines: string[]): boolean[] {
  const inCodeBlock = new Array<boolean>(lines.length).fill(false);
  let currentBlockBackticks = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const backtickMatch = /^(`{3,})/.exec(trimmed);

    if (backtickMatch) {
      const backtickCount = backtickMatch[1].length;

      if (currentBlockBackticks === 0) {
        currentBlockBackticks = backtickCount;
        inCodeBlock[i] = true;
      } else if (backtickCount === currentBlockBackticks) {
        inCodeBlock[i] = true;
        currentBlockBackticks = 0;
      } else {
        inCodeBlock[i] = true;
      }
    } else if (currentBlockBackticks > 0) {
      inCodeBlock[i] = true;
    }
  }

  return inCodeBlock;
}
