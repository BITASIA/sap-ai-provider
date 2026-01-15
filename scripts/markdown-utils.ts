/**
 * Shared utilities for markdown documentation processing.
 * Used by validate-docs.ts and fix-docs-toc.ts to ensure consistency.
 */

/** Markdown header with anchor and position. */
export interface HeaderEntry {
  /** GitHub-style anchor (e.g., "hello-world"). */
  anchor: string;
  /** Header level (2-6 for ## to ######). */
  level: number;
  /** 0-based line index. */
  line: number;
  /** Header text without # symbols. */
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
 * Extracts headers (## to ######) from markdown.
 * Skips code blocks and ToC header. Handles duplicate anchors with -1, -2 suffixes.
 *
 * @param lines - Markdown lines
 * @param tocStartLine - 0-based ToC header index to skip (-1 if none)
 * @returns Headers with 0-based line indices
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
        line: i,
        text,
      });
    }
  }

  return headers;
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
    .replaceAll(/`[^`]+`/g, "")
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
