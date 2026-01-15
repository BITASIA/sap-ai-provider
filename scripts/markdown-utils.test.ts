/**
 * Unit tests for markdown utility functions
 * Tests the core algorithms fixed for documentation validation and ToC generation
 */

import { describe, expect, it } from "vitest";

import {
  detectToc,
  extractHeaders,
  inferTocDepth,
  textToAnchor,
  trackCodeBlocks,
} from "../scripts/markdown-utils.js";

describe("detectToc", () => {
  it("should detect ToC with 'Table of Contents' header", () => {
    const content = `# Title\n\n## Table of Contents\n\n- [Section 1](#section-1)\n- [Section 2](#section-2)\n\n\n## Section 1`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(6); // After 2 consecutive empty lines
  });

  it("should detect ToC end at next ## header", () => {
    const content = `## Table of Contents\n- [Section](#section)\n## Next Header`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
    expect(result.startLine).toBe(0);
    expect(result.endLine).toBe(2);
  });

  it("should require 2 CONSECUTIVE empty lines to end ToC", () => {
    const content = `## Table of Contents\n- [A](#a)\n\n- [B](#b)\n\n\n## Next`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
    // Should NOT end after first empty line at index 2
    // Should end before the 2 consecutive empty lines (indices 4, 5)
    expect(result.endLine).toBe(4);
  });

  it("should return false when no ToC found", () => {
    const content = `# Title\n\n## Introduction\n\nContent`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(false);
    expect(result.startLine).toBe(-1);
    expect(result.endLine).toBe(-1);
  });

  it("should detect ToC with case-insensitive 'Contents'", () => {
    const content = `## contents\n- [Test](#test)`;
    const result = detectToc(content);
    expect(result.hasToc).toBe(true);
  });
});

describe("textToAnchor", () => {
  it("should convert basic text to anchor", () => {
    expect(textToAnchor("Hello World")).toBe("hello-world");
  });

  it("should remove code blocks", () => {
    expect(textToAnchor("Use `createProvider()` function")).toBe("use-createprovider-function");
  });

  it("should extract content from single backtick code", () => {
    expect(textToAnchor("`createSAPAIProvider(options?)`")).toBe("createsapaiprovideroptions");
  });

  it("should extract content from multiple backtick segments", () => {
    expect(textToAnchor("API: `createProvider()` and `configure()`")).toBe(
      "api-createprovider-and-configure",
    );
  });

  it("should handle nested backticks correctly", () => {
    expect(textToAnchor("`provider(modelId, settings?)`")).toBe("providermodelid-settings");
  });

  it("should handle method signatures with backticks", () => {
    expect(textToAnchor("`doGenerate(options)`")).toBe("dogenerateoptions");
    expect(textToAnchor("`provider.chat(modelId, settings?)`")).toBe(
      "providerchatmodelid-settings",
    );
  });

  it("should handle emojis", () => {
    expect(textToAnchor("Section 🚀 Title")).toBe("section-title");
  });

  it("should handle special characters", () => {
    expect(textToAnchor("What's the API?")).toBe("whats-the-api");
  });

  it("should collapse multiple hyphens", () => {
    expect(textToAnchor("A - B - C")).toBe("a-b-c");
  });

  it("should trim hyphens", () => {
    expect(textToAnchor("- Title -")).toBe("title");
  });

  it("should handle empty result", () => {
    expect(textToAnchor("🚀🔥💯")).toBe("");
  });

  it("should handle complex real-world examples", () => {
    expect(textToAnchor("### `SAPAIProvider`")).toBe("sapaiprovider");
    expect(textToAnchor("#### `provider(modelId, settings?)`")).toBe("providermodelid-settings");
    expect(textToAnchor("### `convertToSAPMessages(prompt)`")).toBe("converttosapmessagesprompt");
  });

  it("should handle parentheses and special chars inside backticks", () => {
    expect(textToAnchor("`buildDpiMaskingProvider(config)`")).toBe("builddpimaskingproviderconfig");
    expect(textToAnchor("`buildAzureContentSafetyFilter(type, config?)`")).toBe(
      "buildazurecontentsafetyfiltertype-config",
    );
  });
});

describe("trackCodeBlocks", () => {
  it("should track simple code block with 3 backticks", () => {
    const lines = ["Text", "```", "code", "```", "Text"];
    const result = trackCodeBlocks(lines);
    expect(result).toEqual([false, true, true, true, false]);
  });

  it("should handle 4+ backtick code blocks", () => {
    const lines = ["Text", "````", "```nested```", "````", "Text"];
    const result = trackCodeBlocks(lines);
    expect(result).toEqual([false, true, true, true, false]);
  });

  it("should match opening and closing backtick counts", () => {
    const lines = ["````", "```", "code", "```", "more", "````", "text"];
    const result = trackCodeBlocks(lines);
    expect(result).toEqual([true, true, true, true, true, true, false]);
  });

  it("should handle unclosed code block", () => {
    const lines = ["```", "code", "text"];
    const result = trackCodeBlocks(lines);
    expect(result).toEqual([true, true, true]);
  });

  it("should handle multiple code blocks", () => {
    const lines = ["text", "```", "code1", "```", "text", "```", "code2", "```", "text"];
    const result = trackCodeBlocks(lines);
    expect(result).toEqual([false, true, true, true, false, true, true, true, false]);
  });

  it("should ignore backticks not at start of line", () => {
    const lines = ["text with ``` backticks", "not a code block"];
    const result = trackCodeBlocks(lines);
    expect(result).toEqual([false, false]);
  });
});

describe("extractHeaders", () => {
  it("should extract headers with correct levels", () => {
    const lines = ["# H1", "## H2", "### H3", "#### H4"];
    const headers = extractHeaders(lines, -1);
    expect(headers).toHaveLength(3); // H1 is excluded (only ## and below)
    expect(headers[0]).toMatchObject({ anchor: "h2", level: 2, text: "H2" });
    expect(headers[1]).toMatchObject({ anchor: "h3", level: 3, text: "H3" });
    expect(headers[2]).toMatchObject({ anchor: "h4", level: 4, text: "H4" });
  });

  it("should skip headers in code blocks", () => {
    const lines = ["## Header 1", "```", "## Not a header", "```", "## Header 2"];
    const headers = extractHeaders(lines, -1);
    expect(headers).toHaveLength(2);
    expect(headers[0].text).toBe("Header 1");
    expect(headers[1].text).toBe("Header 2");
  });

  it("should skip the ToC header itself", () => {
    const lines = ["## Table of Contents", "- [Test](#test)", "## Real Header"];
    const headers = extractHeaders(lines, 0); // ToC at line 0
    expect(headers).toHaveLength(1);
    expect(headers[0].text).toBe("Real Header");
  });

  it("should handle duplicate anchors", () => {
    const lines = ["## Test", "## Test", "## Test"];
    const headers = extractHeaders(lines, -1);
    expect(headers).toHaveLength(3);
    expect(headers[0].anchor).toBe("test");
    expect(headers[1].anchor).toBe("test-1");
    expect(headers[2].anchor).toBe("test-2");
  });

  it("should store 1-based line number", () => {
    const lines = ["text", "## Header", "text"];
    const headers = extractHeaders(lines, -1);
    expect(headers).toHaveLength(1);
    expect(headers[0].lineNumber).toBe(2); // 1-based line number
  });
});

describe("inferTocDepth", () => {
  it("should return 2 for empty headers array", () => {
    expect(inferTocDepth([])).toBe(2);
  });

  it("should include levels with >10% representation", () => {
    // 10 headers: 5 × level 2, 3 × level 3, 2 × level 4
    // Level 2: 50% ✓
    // Level 3: 30% ✓
    // Level 4: 20% ✓
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

  it("should exclude levels with <10% representation but include 10%", () => {
    // 20 headers: 18 × level 2, 2 × level 3 (= 10%, should be INCLUDED with >= threshold)
    const headers = Array.from({ length: 18 }, (_, i) => ({
      anchor: `h${String(i)}`,
      level: 2,
      lineNumber: i + 1,
      text: `Header ${String(i)}`,
    }));
    headers.push({ anchor: "x", level: 3, lineNumber: 19, text: "X" });
    headers.push({ anchor: "y", level: 3, lineNumber: 20, text: "Y" });

    expect(inferTocDepth(headers)).toBe(3); // Level 3 is exactly 10%, included with >=
  });

  it("should return at least 2", () => {
    const headers = [{ anchor: "a", level: 2, lineNumber: 1, text: "A" }];
    expect(inferTocDepth(headers)).toBe(2);
  });

  it("should handle all same level", () => {
    const headers = Array.from({ length: 5 }, (_, i) => ({
      anchor: `h${String(i)}`,
      level: 3,
      lineNumber: i + 1,
      text: `Header ${String(i)}`,
    }));
    expect(inferTocDepth(headers)).toBe(3);
  });
});
