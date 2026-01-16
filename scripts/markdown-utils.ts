/**
 * Shared utilities for markdown documentation processing.
 * Used by validate-docs.ts and fix-docs-toc.ts to ensure consistency.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { TOC_DEPTH_THRESHOLD_PERCENT } from "./validation-config.js";

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
 * Base result type for file reading operations.
 */
interface FileReadResult {
  content: string;
  lines: string[];
}

/**
 * Checks if a file exists with caching support.
 * Use for repeated existence checks on the same paths.
 *
 * @param cache - Optional cache map for repeated lookups
 * @returns Function that checks file existence
 */
export function createFileExistsChecker(cache?: Map<string, boolean>): (path: string) => boolean {
  const fileCache = cache ?? new Map<string, boolean>();

  return (path: string): boolean => {
    if (!fileCache.has(path)) {
      fileCache.set(path, existsSync(path));
    }
    return fileCache.get(path) ?? false;
  };
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
 * Extracts code blocks from markdown content.
 *
 * @param content - Markdown content
 * @param language - Optional language filter (e.g., "typescript", "javascript")
 * @returns Array of code block contents (without fence markers)
 */
export function extractCodeBlocks(content: string, language?: string): string[] {
  const lang = language ?? "\\w*";
  const pattern = new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\\n\`\`\``, "g");
  return Array.from(content.matchAll(pattern)).map((m) => m[1]);
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
 * @param indentSize - Spaces per indent level (default: 2)
 * @returns ToC entries with 1-based lineNumber
 */
export function extractTocEntries(
  lines: string[],
  startLine: number,
  endLine: number,
  indentSize = 2,
): TocEntry[] {
  const entries: TocEntry[] = [];
  const tocPattern = /^(\s*)[-*]\s+\[([^\]]+)\]\(#([^)]+)\)/;

  for (let i = startLine + 1; i < endLine; i++) {
    const line = lines[i];
    const match = tocPattern.exec(line);

    if (match) {
      const indent = match[1].length;
      const text = match[2];
      const anchor = match[3];
      const level = Math.floor(indent / indentSize) + 2;

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
 * Checks if a file exists.
 *
 * @param path - Path to check
 * @returns True if file exists
 */
export function fileExists(path: string): boolean {
  return existsSync(path);
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

      // Use path segments for robust exclusion (avoids false positives like "node_modules_backup")
      const pathSegments = relativePath.split("/");
      if (exclude.some((ex) => pathSegments.includes(ex))) {
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
 * Generates ToC markdown from headers.
 *
 * @param headers - Headers to include
 * @param maxDepth - Maximum header level
 * @param indentSize - Spaces per level (default: 2)
 * @returns Markdown list with anchors
 */
export function generateTocMarkdown(
  headers: HeaderEntry[],
  maxDepth: number,
  indentSize = 2,
): string {
  const filteredHeaders = headers.filter((h) => h.level <= maxDepth);
  const lines: string[] = [];

  for (const header of filteredHeaders) {
    const indent = " ".repeat((header.level - 2) * indentSize);
    const line = `${indent}- [${header.text}](#${header.anchor})`;
    lines.push(line);
  }

  return lines.join("\n");
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
  let maxDepth = 2;

  for (const [level, count] of levelCounts.entries()) {
    if (count / totalHeaders >= TOC_DEPTH_THRESHOLD_PERCENT) {
      maxDepth = Math.max(maxDepth, level);
    }
  }

  return maxDepth;
}

/**
 * Checks if a file path matches any of the given patterns.
 * Patterns can be directories (ending with /) or file names.
 *
 * @param file - File path to check
 * @param patterns - Array of patterns to match against
 * @returns True if file matches any pattern
 * @example
 * matchesFilePattern("openspec/foo.md", ["openspec/"]) // true
 * matchesFilePattern("AGENTS.md", ["AGENTS.md"]) // true
 * matchesFilePattern("src/index.ts", ["openspec/"]) // false
 */
export function matchesFilePattern(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith("/")) {
      return file.startsWith(pattern) || file.includes(`/${pattern}`);
    } else {
      return file === pattern || file.endsWith(`/${pattern}`);
    }
  });
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Failed to read JSON file '${filePath}': ${message}`);
    return null;
  }
}

/**
 * Reads a markdown file and returns content + lines.
 *
 * @param filePath - Path to markdown file
 * @returns File content and split lines
 */
export function readMarkdownFile(filePath: string): FileReadResult {
  return readFileWithLines(filePath);
}

/**
 * Reads a markdown file and returns content, lines, and code block tracking.
 * Combines readMarkdownFile() and trackCodeBlocks() for common use case.
 *
 * @param filePath - Path to markdown file
 * @returns File content, split lines, and boolean array marking code block lines
 */
export function readMarkdownFileWithCodeBlocks(filePath: string): FileReadResult & {
  inCodeBlock: boolean[];
} {
  const { content, lines } = readFileWithLines(filePath);
  const inCodeBlock = trackCodeBlocks(lines);
  return { content, inCodeBlock, lines };
}

/**
 * Reads a text file and returns content + lines.
 * Use for non-markdown text files (e.g., .ts, .js).
 *
 * @param filePath - Path to text file
 * @returns File content and split lines
 */
export function readTextFile(filePath: string): FileReadResult {
  return readFileWithLines(filePath);
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
 */
export function textToAnchor(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replaceAll(/[\u{2600}-\u{26FF}]/gu, "")
    .replaceAll(/[\u{2700}-\u{27BF}]/gu, "")
    .replaceAll(/[^\da-z\s-_]/g, "")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
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

/**
 * Reads a text file and splits into lines (internal helper).
 *
 * @param filePath - Path to file
 * @returns Content and lines
 */
function readFileWithLines(filePath: string): FileReadResult {
  const content = readFileSync(filePath, "utf-8");
  return { content, lines: content.split("\n") };
}
