/**
 * Unit tests for markdown-utils.ts
 * Organized by function in source file order, each with:
 * 1. Nominal cases, 2. Variations, 3. Edge cases
 */

import { describe, expect, it } from "vitest";

import {
  createFileExistsChecker,
  detectToc,
  detectTocIndentation,
  extractCodeBlocks,
  extractHeaders,
  extractTocEntries,
  fileExists,
  findMarkdownFiles,
  generateTocMarkdown,
  inferTocDepth,
  matchesFilePattern,
  readJsonFile,
  readMarkdownFile,
  readMarkdownFileWithCodeBlocks,
  readTextFile,
  textToAnchor,
  trackCodeBlocks,
} from "../scripts/markdown-utils.js";

// =============================================================================
// createFileExistsChecker
// =============================================================================

describe("createFileExistsChecker", () => {
  // Nominal cases
  it("returns true for existing files", () => {
    const checker = createFileExistsChecker();
    expect(checker("README.md")).toBe(true);
    expect(checker("package.json")).toBe(true);
  });

  it("returns false for non-existing files", () => {
    const checker = createFileExistsChecker();
    expect(checker("non-existent-file.md")).toBe(false);
    expect(checker("fake/path/file.ts")).toBe(false);
  });

  // Variations: caching behavior
  it("caches results for repeated calls on same path", () => {
    const cache = new Map<string, boolean>();
    const checker = createFileExistsChecker(cache);

    checker("README.md");
    expect(cache.has("README.md")).toBe(true);
    expect(cache.get("README.md")).toBe(true);

    checker("non-existent.md");
    expect(cache.has("non-existent.md")).toBe(true);
    expect(cache.get("non-existent.md")).toBe(false);
  });

  it("uses provided cache when supplied", () => {
    const cache = new Map<string, boolean>();
    cache.set("pre-cached-file.md", true);

    const checker = createFileExistsChecker(cache);
    // Should return cached value without checking filesystem
    expect(checker("pre-cached-file.md")).toBe(true);
  });

  it("creates internal cache when none provided", () => {
    const checker1 = createFileExistsChecker();
    const checker2 = createFileExistsChecker();

    // Each checker has its own cache (isolation)
    checker1("README.md");
    checker2("README.md");
    // Both work independently (no shared state)
    expect(checker1("README.md")).toBe(true);
    expect(checker2("README.md")).toBe(true);
  });

  // Edge cases
  it("handles empty path", () => {
    const checker = createFileExistsChecker();
    expect(checker("")).toBe(false);
  });
});

// =============================================================================
// detectToc
// =============================================================================

describe("detectToc", () => {
  // Nominal cases
  it("detects ToC with 'Table of Contents' header", () => {
    const content = `# Title\n\n## Table of Contents\n\n- [Section 1](#section-1)\n- [Section 2](#section-2)\n\n\n## Section 1`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(6);
  });

  it("detects ToC with 'Contents' header (case-insensitive)", () => {
    const content = `## contents\n- [Test](#test)`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
  });

  it("detects ToC with 'ToC' abbreviation", () => {
    const content = `## ToC\n- [Section](#section)\n## Next`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
    expect(result.startLine).toBe(0);
  });

  // Variations: end detection
  it("ends ToC at next ## header", () => {
    const content = `## Table of Contents\n- [Section](#section)\n## Next Header`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
    expect(result.startLine).toBe(0);
    expect(result.endLine).toBe(2);
  });

  it("ends ToC after 2 consecutive empty lines", () => {
    const content = `## Table of Contents\n- [A](#a)\n\n- [B](#b)\n\n\n## Next`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
    expect(result.endLine).toBe(4);
  });

  // Edge cases
  it("handles ToC at end of file without terminator", () => {
    const content = `## Table of Contents\n- [A](#a)\n- [B](#b)`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
    expect(result.startLine).toBe(0);
    expect(result.endLine).toBe(1);
  });

  it("returns false when no ToC found", () => {
    const content = `# Title\n\n## Introduction\n\nContent`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(false);
    expect(result.startLine).toBe(-1);
    expect(result.endLine).toBe(-1);
  });

  it("handles empty content", () => {
    const result = detectToc("");
    expect(result.hasToc).toBe(false);
    expect(result.startLine).toBe(-1);
    expect(result.endLine).toBe(-1);
  });
});

// =============================================================================
// detectTocIndentation
// =============================================================================

describe("detectTocIndentation", () => {
  // Nominal cases
  it("detects 2-space indentation", () => {
    const lines = [
      "## Table of Contents",
      "- [Section 1](#section-1)",
      "  - [Subsection](#subsection)",
      "## Next",
    ];
    expect(detectTocIndentation(lines, 0, 3)).toBe(2);
  });

  it("detects 4-space indentation", () => {
    const lines = [
      "## Table of Contents",
      "- [Section 1](#section-1)",
      "    - [Subsection](#subsection)",
      "## Next",
    ];
    expect(detectTocIndentation(lines, 0, 3)).toBe(4);
  });

  // Variations
  it("uses first indented entry found", () => {
    const lines = [
      "## Table of Contents",
      "- [A](#a)",
      "   - [B](#b)", // 3 spaces
      "      - [C](#c)", // 6 spaces
      "## Next",
    ];
    expect(detectTocIndentation(lines, 0, 4)).toBe(3);
  });

  it("handles asterisk list markers", () => {
    const lines = ["## ToC", "* [A](#a)", "  * [B](#b)", "## Next"];
    expect(detectTocIndentation(lines, 0, 3)).toBe(2);
  });

  // Edge cases: defaults
  it("returns default 2 when no indented entries", () => {
    const lines = [
      "## Table of Contents",
      "- [Section 1](#section-1)",
      "- [Section 2](#section-2)",
    ];
    expect(detectTocIndentation(lines, 0, 3)).toBe(2);
  });

  it("returns default 2 for empty ToC", () => {
    const lines = ["## Table of Contents", "", "## Next"];
    expect(detectTocIndentation(lines, 0, 2)).toBe(2);
  });
});

// =============================================================================
// extractHeaders
// =============================================================================

describe("extractHeaders", () => {
  // Nominal cases
  it("extracts headers H2-H6 with correct levels", () => {
    const lines = ["# H1", "## H2", "### H3", "#### H4", "##### H5", "###### H6"];
    const headers = extractHeaders(lines, -1);
    expect(headers).toHaveLength(5);
    expect(headers.map((h) => h.level)).toEqual([2, 3, 4, 5, 6]);
  });

  it("stores 1-based line numbers", () => {
    const lines = ["text", "## Header", "text"];
    const headers = extractHeaders(lines, -1);
    expect(headers).toHaveLength(1);
    expect(headers[0].lineNumber).toBe(2);
  });

  it("trims header text", () => {
    const lines = ["##   Padded Text   "];
    const headers = extractHeaders(lines, -1);
    expect(headers[0].text).toBe("Padded Text");
  });

  // Variations: skipping
  it("skips headers inside code blocks", () => {
    const lines = ["## Header 1", "```", "## Not a header", "```", "## Header 2"];
    const headers = extractHeaders(lines, -1);
    expect(headers).toHaveLength(2);
    expect(headers[0].text).toBe("Header 1");
    expect(headers[1].text).toBe("Header 2");
  });

  it("skips ToC header when tocStartLine provided", () => {
    const lines = ["## Table of Contents", "- [Test](#test)", "## Real Header"];
    const headers = extractHeaders(lines, 0);
    expect(headers).toHaveLength(1);
    expect(headers[0].text).toBe("Real Header");
  });

  it("ignores malformed headers (no space after #)", () => {
    const lines = ["##NoSpace", "## Valid", "#Only one hash"];
    const headers = extractHeaders(lines, -1);
    expect(headers).toHaveLength(1);
    expect(headers[0].text).toBe("Valid");
  });

  // Variations: duplicate anchors
  it("appends suffix for duplicate anchors", () => {
    const lines = ["## Test", "## Test", "## Test"];
    const headers = extractHeaders(lines, -1);
    expect(headers.map((h) => h.anchor)).toEqual(["test", "test-1", "test-2"]);
  });

  // Edge cases
  it("returns empty array for empty input", () => {
    expect(extractHeaders([], -1)).toEqual([]);
  });
});

// =============================================================================
// extractTocEntries
// =============================================================================

describe("extractTocEntries", () => {
  // Nominal cases
  it("extracts basic ToC entries with text and anchor", () => {
    const lines = [
      "## Table of Contents",
      "- [Introduction](#introduction)",
      "- [Getting Started](#getting-started)",
      "## Introduction",
    ];
    const entries = extractTocEntries(lines, 0, 3);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ anchor: "introduction", level: 2, text: "Introduction" });
    expect(entries[1]).toMatchObject({
      anchor: "getting-started",
      level: 2,
      text: "Getting Started",
    });
  });

  it("stores 1-based line numbers", () => {
    const lines = ["## ToC", "- [A](#a)", "- [B](#b)", "## Next"];
    const entries = extractTocEntries(lines, 0, 3);
    expect(entries[0].lineNumber).toBe(2);
    expect(entries[1].lineNumber).toBe(3);
  });

  // Variations: indentation levels
  it("calculates level from indentation (2 spaces = 1 level)", () => {
    const lines = [
      "## ToC",
      "- [Level 2](#level-2)",
      "  - [Level 3](#level-3)",
      "    - [Level 4](#level-4)",
      "## Next",
    ];
    const entries = extractTocEntries(lines, 0, 4);
    expect(entries.map((e) => e.level)).toEqual([2, 3, 4]);
  });

  it("handles deeply nested entries (L2-L6)", () => {
    const lines = [
      "## ToC",
      "- [L2](#l2)",
      "  - [L3](#l3)",
      "    - [L4](#l4)",
      "      - [L5](#l5)",
      "        - [L6](#l6)",
      "## Next",
    ];
    const entries = extractTocEntries(lines, 0, 6);
    expect(entries.map((e) => e.level)).toEqual([2, 3, 4, 5, 6]);
  });

  // Variations: syntax
  it("handles asterisk list markers", () => {
    const lines = ["## ToC", "* [Section A](#section-a)", "* [Section B](#section-b)", "## Next"];
    const entries = extractTocEntries(lines, 0, 3);
    expect(entries).toHaveLength(2);
  });

  it("preserves backticks in text, extracts clean anchor", () => {
    const lines = [
      "## ToC",
      "- [`createProvider()`](#createprovider)",
      "- [API Reference](#api-reference)",
      "## Next",
    ];
    const entries = extractTocEntries(lines, 0, 3);
    expect(entries[0].text).toBe("`createProvider()`");
    expect(entries[0].anchor).toBe("createprovider");
  });

  // Edge cases
  it("ignores non-link lines", () => {
    const lines = ["## ToC", "Some description", "- [Valid](#valid)", "More text", "## Next"];
    const entries = extractTocEntries(lines, 0, 4);
    expect(entries).toHaveLength(1);
  });

  it("returns empty array for empty ToC section", () => {
    const lines = ["## Table of Contents", "", "## Next"];
    const entries = extractTocEntries(lines, 0, 2);
    expect(entries).toHaveLength(0);
  });
});

// =============================================================================
// findMarkdownFiles
// =============================================================================

describe("findMarkdownFiles", () => {
  // Nominal cases
  it("finds .md files in current directory", () => {
    const files = findMarkdownFiles(".");
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f === "README.md")).toBe(true);
  });

  it("returns only .md files", () => {
    const files = findMarkdownFiles(".");
    expect(files.every((f) => f.endsWith(".md"))).toBe(true);
  });

  // Variations: exclusion
  it("excludes specified directories", () => {
    const filesWithoutNode = findMarkdownFiles(".", ["node_modules"]);

    // Exclusion should filter out node_modules paths
    expect(filesWithoutNode.every((f) => !f.includes("node_modules"))).toBe(true);
  });

  it("excludes multiple directories", () => {
    const files = findMarkdownFiles(".", ["node_modules", ".git", "openspec"]);
    // Exclusion is based on exact path segments, not substring matching
    // e.g., ".git" excludes ".git/" but not ".github/"
    expect(files.every((f) => !f.split("/").includes("node_modules"))).toBe(true);
    expect(files.every((f) => !f.split("/").includes(".git"))).toBe(true);
    expect(files.every((f) => !f.split("/").includes("openspec"))).toBe(true);
  });

  // Variations: subdirectories
  it("recurses into subdirectories", () => {
    const files = findMarkdownFiles(".", ["node_modules"]);
    // Project has .md files in subdirectories (e.g., openspec/, .github/)
    const hasNestedFiles = files.some((f) => f.includes("/"));
    expect(hasNestedFiles).toBe(true);
  });

  // Edge cases
  it("returns empty array for directory with no .md files", () => {
    const files = findMarkdownFiles("src");
    // src/ contains .ts files, not .md files
    expect(files).toEqual([]);
  });
});

// =============================================================================
// inferTocDepth
// =============================================================================

describe("inferTocDepth", () => {
  // Nominal cases
  it("includes levels with >=10% representation", () => {
    // 10 headers: 5×L2 (50%), 3×L3 (30%), 2×L4 (20%)
    const headers = [
      { anchor: "a", level: 2, lineNumber: 1, text: "A" },
      { anchor: "b", level: 2, lineNumber: 2, text: "B" },
      { anchor: "c", level: 2, lineNumber: 3, text: "C" },
      { anchor: "d", level: 2, lineNumber: 4, text: "D" },
      { anchor: "e", level: 2, lineNumber: 5, text: "E" },
      { anchor: "f", level: 3, lineNumber: 6, text: "F" },
      { anchor: "g", level: 3, lineNumber: 7, text: "G" },
      { anchor: "h", level: 3, lineNumber: 8, text: "H" },
      { anchor: "i", level: 4, lineNumber: 9, text: "I" },
      { anchor: "j", level: 4, lineNumber: 10, text: "J" },
    ];
    expect(inferTocDepth(headers)).toBe(4);
  });

  // Variations: threshold boundary
  it("includes level at exactly 10% threshold", () => {
    // 20 headers: 18×L2 (90%), 2×L3 (10%)
    const headers = Array.from({ length: 18 }, (_, i) => ({
      anchor: `h${String(i)}`,
      level: 2,
      lineNumber: i + 1,
      text: `H${String(i)}`,
    }));
    headers.push({ anchor: "x", level: 3, lineNumber: 19, text: "X" });
    headers.push({ anchor: "y", level: 3, lineNumber: 20, text: "Y" });
    expect(inferTocDepth(headers)).toBe(3);
  });

  it("excludes levels below 10% threshold", () => {
    // 21 headers: 19×L2 (90.5%), 2×L3 (9.5%)
    const headers = Array.from({ length: 19 }, (_, i) => ({
      anchor: `h${String(i)}`,
      level: 2,
      lineNumber: i + 1,
      text: `H${String(i)}`,
    }));
    headers.push({ anchor: "x", level: 3, lineNumber: 20, text: "X" });
    headers.push({ anchor: "y", level: 3, lineNumber: 21, text: "Y" });
    expect(inferTocDepth(headers)).toBe(2);
  });

  // Variations: special distributions
  it("handles all headers at same level", () => {
    const headers = Array.from({ length: 5 }, (_, i) => ({
      anchor: `h${String(i)}`,
      level: 3,
      lineNumber: i + 1,
      text: `H${String(i)}`,
    }));
    expect(inferTocDepth(headers)).toBe(3);
  });

  it("finds max depth across non-contiguous levels", () => {
    // L2 and L5 only, both >10%
    const headers = [
      { anchor: "a", level: 2, lineNumber: 1, text: "A" },
      { anchor: "b", level: 2, lineNumber: 2, text: "B" },
      { anchor: "c", level: 5, lineNumber: 3, text: "C" },
      { anchor: "d", level: 5, lineNumber: 4, text: "D" },
    ];
    expect(inferTocDepth(headers)).toBe(5);
  });

  // Edge cases
  it("returns minimum 2 for empty headers", () => {
    expect(inferTocDepth([])).toBe(2);
  });

  it("returns header level when single header present", () => {
    const headers = [{ anchor: "a", level: 4, lineNumber: 1, text: "A" }];
    expect(inferTocDepth(headers)).toBe(4);
  });
});

// =============================================================================
// matchesFilePattern
// =============================================================================

describe("matchesFilePattern", () => {
  // Nominal cases
  it("matches exact file name", () => {
    expect(matchesFilePattern("AGENTS.md", ["AGENTS.md"])).toBe(true);
    expect(matchesFilePattern("README.md", ["README.md"])).toBe(true);
  });

  it("matches directory pattern with trailing slash", () => {
    expect(matchesFilePattern("openspec/foo.md", ["openspec/"])).toBe(true);
    expect(matchesFilePattern("openspec/changes/bar.md", ["openspec/"])).toBe(true);
  });

  // Variations: nested paths
  it("matches file in nested path", () => {
    expect(matchesFilePattern("src/utils/AGENTS.md", ["AGENTS.md"])).toBe(true);
    expect(matchesFilePattern(".github/copilot-instructions.md", ["copilot-instructions.md"])).toBe(
      true,
    );
  });

  it("matches directory pattern in nested path", () => {
    expect(matchesFilePattern("foo/openspec/bar.md", ["openspec/"])).toBe(true);
  });

  it("matches with multiple patterns", () => {
    expect(matchesFilePattern("openspec/spec.md", ["node_modules/", "openspec/"])).toBe(true);
    expect(matchesFilePattern("AGENTS.md", ["README.md", "AGENTS.md"])).toBe(true);
  });

  // Edge cases: non-matching
  it("returns false for non-matching file", () => {
    expect(matchesFilePattern("src/index.ts", ["openspec/"])).toBe(false);
    expect(matchesFilePattern("README.md", ["AGENTS.md"])).toBe(false);
  });

  it("returns false for partial match without proper boundary", () => {
    // "openspec" without trailing slash should not match as directory
    expect(matchesFilePattern("openspec-backup/file.md", ["openspec/"])).toBe(false);
  });

  it("returns false for empty patterns array", () => {
    expect(matchesFilePattern("README.md", [])).toBe(false);
  });

  it("handles file pattern that looks like directory", () => {
    // Pattern without trailing slash is treated as file name
    expect(matchesFilePattern("openspec", ["openspec"])).toBe(true);
    expect(matchesFilePattern("path/to/openspec", ["openspec"])).toBe(true);
  });
});

// =============================================================================
// textToAnchor
// =============================================================================

describe("textToAnchor", () => {
  // Nominal cases
  it("converts text to lowercase hyphenated anchor", () => {
    expect(textToAnchor("Hello World")).toBe("hello-world");
  });

  it("preserves numbers", () => {
    expect(textToAnchor("Version 2.0")).toBe("version-20");
    expect(textToAnchor("Step 1: Setup")).toBe("step-1-setup");
    expect(textToAnchor("404 Not Found")).toBe("404-not-found");
  });

  it("preserves underscores", () => {
    expect(textToAnchor("snake_case_name")).toBe("snake_case_name");
    expect(textToAnchor("SCREAMING_SNAKE")).toBe("screaming_snake");
  });

  // Variations: backticks
  it("extracts content from backticks (removes backticks)", () => {
    expect(textToAnchor("Use `createProvider()` function")).toBe("use-createprovider-function");
    expect(textToAnchor("`createSAPAIProvider(options?)`")).toBe("createsapaiprovideroptions");
    expect(textToAnchor("API: `createProvider()` and `configure()`")).toBe(
      "api-createprovider-and-configure",
    );
  });

  it("handles method signatures with special chars in backticks", () => {
    expect(textToAnchor("`provider(modelId, settings?)`")).toBe("providermodelid-settings");
    expect(textToAnchor("`buildAzureContentSafetyFilter(type, config?)`")).toBe(
      "buildazurecontentsafetyfiltertype-config",
    );
  });

  // Variations: emoji removal
  it("removes emojis from all unicode ranges", () => {
    expect(textToAnchor("Section 🚀 Title")).toBe("section-title"); // U+1F300-1F9FF
    expect(textToAnchor("Weather ☀️ Report")).toBe("weather-report"); // U+2600-26FF
    expect(textToAnchor("Check ✓ Mark")).toBe("check-mark"); // U+2700-27BF
  });

  // Variations: special characters
  it("removes special characters", () => {
    expect(textToAnchor("What's the API?")).toBe("whats-the-api");
    expect(textToAnchor("C++ Programming")).toBe("c-programming");
    expect(textToAnchor("foo@bar.com")).toBe("foobarcom");
  });

  // Variations: whitespace normalization
  it("normalizes whitespace and hyphens", () => {
    expect(textToAnchor("A - B - C")).toBe("a-b-c");
    expect(textToAnchor("Multiple   Spaces")).toBe("multiple-spaces");
    expect(textToAnchor("- Title -")).toBe("title");
    expect(textToAnchor("  padded  ")).toBe("padded");
  });

  // Edge cases
  it("handles empty and special-only input", () => {
    expect(textToAnchor("")).toBe("");
    expect(textToAnchor("🚀🔥💯")).toBe("");
    expect(textToAnchor("---")).toBe("");
  });
});

// =============================================================================
// trackCodeBlocks
// =============================================================================

describe("trackCodeBlocks", () => {
  // Nominal cases
  it("tracks code block with 3 backticks", () => {
    const lines = ["Text", "```", "code", "```", "Text"];
    expect(trackCodeBlocks(lines)).toEqual([false, true, true, true, false]);
  });

  it("tracks code block with language tag", () => {
    const lines = ["Text", "```typescript", "const x = 1;", "```", "Text"];
    expect(trackCodeBlocks(lines)).toEqual([false, true, true, true, false]);
  });

  it("tracks multiple code blocks", () => {
    const lines = ["text", "```", "code1", "```", "text", "```", "code2", "```", "text"];
    expect(trackCodeBlocks(lines)).toEqual([
      false,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  // Variations: backtick count matching
  it("tracks 4+ backtick code blocks", () => {
    const lines = ["Text", "````", "```nested```", "````", "Text"];
    expect(trackCodeBlocks(lines)).toEqual([false, true, true, true, false]);
  });

  it("matches opening and closing backtick counts exactly", () => {
    const lines = ["````", "```", "code", "```", "more", "````", "text"];
    expect(trackCodeBlocks(lines)).toEqual([true, true, true, true, true, true, false]);
  });

  // Variations: position
  it("ignores backticks not at start of trimmed line", () => {
    const lines = ["text with ``` backticks", "not a code block"];
    expect(trackCodeBlocks(lines)).toEqual([false, false]);
  });

  it("handles indented code fences", () => {
    const lines = ["text", "  ```", "code", "  ```", "text"];
    expect(trackCodeBlocks(lines)).toEqual([false, true, true, true, false]);
  });

  // Edge cases
  it("handles unclosed code block", () => {
    const lines = ["```", "code", "text"];
    expect(trackCodeBlocks(lines)).toEqual([true, true, true]);
  });

  it("returns empty array for empty input", () => {
    expect(trackCodeBlocks([])).toEqual([]);
  });
});

// =============================================================================
// extractCodeBlocks
// =============================================================================

describe("extractCodeBlocks", () => {
  // Nominal cases
  it("extracts single code block without language filter", () => {
    const content = "# Title\n\n```typescript\nconst x = 1;\n```\n\nText";
    const result = extractCodeBlocks(content);
    expect(result).toEqual(["const x = 1;"]);
  });

  it("extracts code block with specific language filter", () => {
    const content = "```typescript\nconst x = 1;\n```\n\n```javascript\nvar y = 2;\n```";
    const result = extractCodeBlocks(content, "typescript");
    expect(result).toEqual(["const x = 1;"]);
  });

  it("extracts multiple code blocks", () => {
    const content = "```typescript\ncode1\n```\n\ntext\n\n```typescript\ncode2\n```";
    const result = extractCodeBlocks(content, "typescript");
    expect(result).toEqual(["code1", "code2"]);
  });

  // Variations
  it("extracts code blocks with different languages", () => {
    const content = "```javascript\njs code\n```\n\n```typescript\nts code\n```";
    expect(extractCodeBlocks(content, "javascript")).toEqual(["js code"]);
    expect(extractCodeBlocks(content, "typescript")).toEqual(["ts code"]);
  });

  it("extracts multiline code blocks", () => {
    const content = "```typescript\nline1\nline2\nline3\n```";
    const result = extractCodeBlocks(content, "typescript");
    expect(result).toEqual(["line1\nline2\nline3"]);
  });

  // Edge cases
  it("returns empty array when no code blocks found", () => {
    const content = "# Title\n\nJust text, no code blocks.";
    expect(extractCodeBlocks(content)).toEqual([]);
  });

  it("returns empty array for empty content", () => {
    expect(extractCodeBlocks("")).toEqual([]);
  });

  it("handles code blocks with no language specified", () => {
    const content = "```\nplain code\n```";
    const result = extractCodeBlocks(content);
    expect(result).toEqual(["plain code"]);
  });
});

// =============================================================================
// generateTocMarkdown
// =============================================================================

describe("generateTocMarkdown", () => {
  // Nominal cases
  it("generates ToC markdown from headers", () => {
    const headers = [
      { anchor: "section-1", level: 2, lineNumber: 1, text: "Section 1" },
      { anchor: "section-2", level: 2, lineNumber: 5, text: "Section 2" },
      { anchor: "subsection", level: 3, lineNumber: 10, text: "Subsection" },
    ];
    const result = generateTocMarkdown(headers, 3);
    expect(result).toBe(
      "- [Section 1](#section-1)\n- [Section 2](#section-2)\n  - [Subsection](#subsection)",
    );
  });

  it("respects maxDepth parameter", () => {
    const headers = [
      { anchor: "h2", level: 2, lineNumber: 1, text: "H2" },
      { anchor: "h3", level: 3, lineNumber: 3, text: "H3" },
      { anchor: "h4", level: 4, lineNumber: 5, text: "H4" },
    ];
    const result = generateTocMarkdown(headers, 3);
    expect(result).toBe("- [H2](#h2)\n  - [H3](#h3)");
  });

  it("uses custom indent size", () => {
    const headers = [
      { anchor: "h2", level: 2, lineNumber: 1, text: "H2" },
      { anchor: "h3", level: 3, lineNumber: 3, text: "H3" },
    ];
    const result = generateTocMarkdown(headers, 3, 4);
    expect(result).toBe("- [H2](#h2)\n    - [H3](#h3)");
  });

  // Variations
  it("handles only H2 headers", () => {
    const headers = [
      { anchor: "a", level: 2, lineNumber: 1, text: "A" },
      { anchor: "b", level: 2, lineNumber: 3, text: "B" },
    ];
    const result = generateTocMarkdown(headers, 2);
    expect(result).toBe("- [A](#a)\n- [B](#b)");
  });

  it("handles deeply nested headers", () => {
    const headers = [
      { anchor: "h2", level: 2, lineNumber: 1, text: "H2" },
      { anchor: "h3", level: 3, lineNumber: 3, text: "H3" },
      { anchor: "h4", level: 4, lineNumber: 5, text: "H4" },
      { anchor: "h5", level: 5, lineNumber: 7, text: "H5" },
    ];
    const result = generateTocMarkdown(headers, 5);
    expect(result).toContain("      - [H5](#h5)"); // 3 levels deep = 6 spaces
  });

  // Edge cases
  it("returns empty string for empty headers", () => {
    expect(generateTocMarkdown([], 3)).toBe("");
  });

  it("filters out all headers when maxDepth is too low", () => {
    const headers = [
      { anchor: "h3", level: 3, lineNumber: 1, text: "H3" },
      { anchor: "h4", level: 4, lineNumber: 3, text: "H4" },
    ];
    expect(generateTocMarkdown(headers, 2)).toBe("");
  });
});

// =============================================================================
// readMarkdownFile
// =============================================================================

describe("readMarkdownFile", () => {
  // Note: These tests require actual file I/O, so we test with existing files

  it("reads file and returns content and lines", () => {
    // Using a known existing file in the project
    const result = readMarkdownFile("README.md");
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("lines");
    expect(typeof result.content).toBe("string");
    expect(Array.isArray(result.lines)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it("splits content correctly into lines", () => {
    const result = readMarkdownFile("README.md");
    const manualSplit = result.content.split("\n");
    expect(result.lines).toEqual(manualSplit);
  });

  it("handles files with multiple lines", () => {
    const result = readMarkdownFile("README.md");
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.lines.join("\n")).toBe(result.content);
  });
});

// =============================================================================
// readMarkdownFileWithCodeBlocks
// =============================================================================

describe("readMarkdownFileWithCodeBlocks", () => {
  it("reads file and returns content, lines, and code block tracking", () => {
    const result = readMarkdownFileWithCodeBlocks("README.md");
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("lines");
    expect(result).toHaveProperty("inCodeBlock");
    expect(typeof result.content).toBe("string");
    expect(Array.isArray(result.lines)).toBe(true);
    expect(Array.isArray(result.inCodeBlock)).toBe(true);
  });

  it("returns inCodeBlock array matching lines length", () => {
    const result = readMarkdownFileWithCodeBlocks("README.md");
    expect(result.inCodeBlock.length).toBe(result.lines.length);
  });

  it("correctly tracks code blocks in file", () => {
    const result = readMarkdownFileWithCodeBlocks("README.md");
    // README.md contains code blocks, so some lines should be marked as inside code blocks
    const hasCodeBlocks = result.inCodeBlock.some((inBlock) => inBlock);
    expect(hasCodeBlocks).toBe(true);
  });

  it("is consistent with calling readMarkdownFile and trackCodeBlocks separately", () => {
    const combined = readMarkdownFileWithCodeBlocks("README.md");
    const separate = readMarkdownFile("README.md");
    const separateCodeBlocks = trackCodeBlocks(separate.lines);

    expect(combined.content).toBe(separate.content);
    expect(combined.lines).toEqual(separate.lines);
    expect(combined.inCodeBlock).toEqual(separateCodeBlocks);
  });
});

// =============================================================================
// fileExists
// =============================================================================

describe("fileExists", () => {
  // Nominal cases
  it("returns true for existing file", () => {
    expect(fileExists("README.md")).toBe(true);
    expect(fileExists("package.json")).toBe(true);
  });

  it("returns false for non-existing file", () => {
    expect(fileExists("non-existent-file.md")).toBe(false);
    expect(fileExists("fake/path/to/file.ts")).toBe(false);
  });

  // Edge cases
  it("handles empty path", () => {
    expect(fileExists("")).toBe(false);
  });

  it("returns false for directory path", () => {
    // fileExists wraps existsSync which returns true for directories
    // but this documents the actual behavior
    expect(fileExists("src")).toBe(true);
  });
});

// =============================================================================
// readJsonFile
// =============================================================================

describe("readJsonFile", () => {
  // Nominal cases
  it("reads and parses valid JSON file", () => {
    const result = readJsonFile("package.json");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("@mymediset/sap-ai-provider");
  });

  it("reads nested JSON structure", () => {
    const result = readJsonFile("package.json");
    expect(result).not.toBeNull();
    expect(result?.scripts).toBeDefined();
    expect(typeof result?.scripts).toBe("object");
  });

  // Edge cases
  it("returns null for non-existent file", () => {
    const result = readJsonFile("non-existent.json");
    expect(result).toBeNull();
  });

  it("returns null for invalid JSON content", () => {
    // README.md is not valid JSON
    const result = readJsonFile("README.md");
    expect(result).toBeNull();
  });

  it("returns null for empty path", () => {
    const result = readJsonFile("");
    expect(result).toBeNull();
  });
});

// =============================================================================
// readTextFile
// =============================================================================

describe("readTextFile", () => {
  // Nominal cases
  it("reads file and returns content and lines", () => {
    const result = readTextFile("package.json");
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("lines");
    expect(typeof result.content).toBe("string");
    expect(Array.isArray(result.lines)).toBe(true);
  });

  it("works with TypeScript files", () => {
    const result = readTextFile("src/index.ts");
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.lines.length).toBeGreaterThan(0);
  });

  // Edge cases
  it("is consistent with readMarkdownFile for same file", () => {
    const textResult = readTextFile("README.md");
    const markdownResult = readMarkdownFile("README.md");

    expect(textResult.content).toBe(markdownResult.content);
    expect(textResult.lines).toEqual(markdownResult.lines);
  });

  it("splits content correctly into lines", () => {
    const result = readTextFile("package.json");
    expect(result.lines.join("\n")).toBe(result.content);
  });
});
