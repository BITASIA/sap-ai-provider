/**
 * Unit tests for markdown-utils.ts
 * Organized by function in source file order, each with:
 * 1. Nominal cases, 2. Variations, 3. Edge cases
 */

import { describe, expect, it } from "vitest";

import {
  detectToc,
  detectTocIndentation,
  extractHeaders,
  extractTocEntries,
  inferTocDepth,
  textToAnchor,
  trackCodeBlocks,
} from "../scripts/markdown-utils.js";

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
