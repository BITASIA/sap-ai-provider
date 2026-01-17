/**
 * Unit tests for ToC (Table of Contents) Validation Script
 *
 * Tests the core functions for extracting headings, ToC entries,
 * generating slugs, and validating ToC synchronization.
 */

import { describe, expect, it } from "vitest";

import { extractHeadings, extractTocEntries, slugify, validateTocContent } from "./check-toc";

// ============================================================================
// slugify() Tests
// ============================================================================

describe("slugify", () => {
  describe("basic transformations", () => {
    it("should convert simple text to lowercase slug", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("should handle single word", () => {
      expect(slugify("Features")).toBe("features");
    });

    it("should collapse multiple spaces to single hyphen", () => {
      expect(slugify("Hello    World")).toBe("hello-world");
    });

    it("should handle mixed case", () => {
      expect(slugify("HeLLo WoRLD")).toBe("hello-world");
    });
  });

  describe("special characters", () => {
    it("should remove & but keep resulting double hyphens", () => {
      expect(slugify("Error Handling & Reference")).toBe("error-handling--reference");
    });

    it("should remove / but keep resulting double hyphens", () => {
      expect(slugify("Problem: High token usage / costs")).toBe("problem-high-token-usage--costs");
    });

    it("should remove colons", () => {
      expect(slugify("Option 1: Factory Function")).toBe("option-1-factory-function");
    });

    it("should remove parentheses", () => {
      expect(slugify("createSAPAIProvider(options?)")).toBe("createsapaiprovideroptions");
    });

    it("should remove question marks and exclamation marks", () => {
      expect(slugify("What is this?")).toBe("what-is-this");
      expect(slugify("Hello World!")).toBe("hello-world");
    });

    it("should handle backticks", () => {
      expect(slugify("`code` Example")).toBe("code-example");
    });
  });

  describe("numbers", () => {
    it("should preserve numbers", () => {
      expect(slugify("Version 2.0")).toBe("version-20");
    });

    it("should handle numbered lists", () => {
      expect(slugify("1. First Step")).toBe("1-first-step");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(slugify("")).toBe("");
    });

    it("should handle whitespace only", () => {
      expect(slugify("   ")).toBe("");
    });

    it("should trim leading/trailing hyphens", () => {
      expect(slugify("- Hello -")).toBe("hello");
    });

    it("should handle existing hyphens", () => {
      expect(slugify("pre-commit hooks")).toBe("pre-commit-hooks");
    });

    it("should handle underscores (preserved as word chars)", () => {
      expect(slugify("my_function_name")).toBe("my_function_name");
    });
  });
});

// ============================================================================
// extractHeadings() Tests
// ============================================================================

describe("extractHeadings", () => {
  describe("basic heading extraction", () => {
    it("should extract h1 heading", () => {
      const content = "# Main Title\n\nSome content";
      const headings = extractHeadings(content);

      expect(headings).toHaveLength(1);
      expect(headings[0]).toEqual({
        baseSlug: "main-title",
        level: 1,
        slug: "main-title",
        text: "Main Title",
      });
    });

    it("should extract all heading levels (h1-h6)", () => {
      const content = `
# H1
## H2
### H3
#### H4
##### H5
###### H6
`;
      const headings = extractHeadings(content);

      expect(headings).toHaveLength(6);
      expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("should extract multiple headings", () => {
      const content = `
# Title
## Section 1
### Subsection
## Section 2
`;
      const headings = extractHeadings(content);

      expect(headings).toHaveLength(4);
      expect(headings.map((h) => h.text)).toEqual([
        "Title",
        "Section 1",
        "Subsection",
        "Section 2",
      ]);
    });
  });

  describe("code block handling", () => {
    it("should exclude headings inside triple backtick code blocks", () => {
      const content = `
# Real Heading

\`\`\`markdown
# Heading in code block
\`\`\`

## Another Real Heading
`;
      const headings = extractHeadings(content);

      expect(headings).toHaveLength(2);
      expect(headings.map((h) => h.text)).toEqual(["Real Heading", "Another Real Heading"]);
    });

    it("should exclude headings inside tilde code blocks", () => {
      const content = `
# Real Heading

~~~
# Heading in code block
~~~

## Another Real Heading
`;
      const headings = extractHeadings(content);

      expect(headings).toHaveLength(2);
    });

    it("should handle code blocks with language specifier", () => {
      const content = `
# Real Heading

\`\`\`typescript
# This is a comment not a heading
const x = 1;
\`\`\`
`;
      const headings = extractHeadings(content);

      expect(headings).toHaveLength(1);
      expect(headings[0].text).toBe("Real Heading");
    });
  });

  describe("markdown formatting in headings", () => {
    it("should remove bold formatting (**text**)", () => {
      const content = "## **Bold** Heading";
      const headings = extractHeadings(content);

      expect(headings[0].text).toBe("Bold Heading");
    });

    it("should remove italic formatting (*text*)", () => {
      const content = "## *Italic* Heading";
      const headings = extractHeadings(content);

      expect(headings[0].text).toBe("Italic Heading");
    });

    it("should remove inline code (`text`)", () => {
      const content = "## The `code` Example";
      const headings = extractHeadings(content);

      expect(headings[0].text).toBe("The code Example");
    });

    it("should remove links but keep text ([text](url))", () => {
      const content = "## See [Documentation](https://example.com)";
      const headings = extractHeadings(content);

      expect(headings[0].text).toBe("See Documentation");
    });

    it("should handle mixed formatting", () => {
      const content = "## **Bold** and *italic* with `code`";
      const headings = extractHeadings(content);

      expect(headings[0].text).toBe("Bold and italic with code");
    });
  });

  describe("duplicate headings", () => {
    it("should add suffix for duplicate headings", () => {
      const content = `
## Features
## Features
## Features
`;
      const headings = extractHeadings(content);

      expect(headings).toHaveLength(3);
      expect(headings[0].slug).toBe("features");
      expect(headings[1].slug).toBe("features-1");
      expect(headings[2].slug).toBe("features-2");
    });

    it("should track baseSlug separately from slug", () => {
      const content = `
## Summary
## Details
## Summary
`;
      const headings = extractHeadings(content);

      expect(headings[0]).toMatchObject({
        baseSlug: "summary",
        slug: "summary",
      });
      expect(headings[2]).toMatchObject({
        baseSlug: "summary",
        slug: "summary-1",
      });
    });
  });

  describe("edge cases", () => {
    it("should return empty array for content with no headings", () => {
      const content = "Just some regular text\n\nMore text";
      const headings = extractHeadings(content);

      expect(headings).toEqual([]);
    });

    it("should handle empty content", () => {
      expect(extractHeadings("")).toEqual([]);
    });

    it("should ignore lines that look like headings but aren't", () => {
      const content = `
#Not a heading (no space)
 # Also not (leading space)
`;
      const headings = extractHeadings(content);

      expect(headings).toEqual([]);
    });

    it("should handle headings with special characters", () => {
      const content = "## Error Handling & Reference";
      const headings = extractHeadings(content);

      expect(headings[0].slug).toBe("error-handling--reference");
    });
  });
});

// ============================================================================
// extractTocEntries() Tests
// ============================================================================

describe("extractTocEntries", () => {
  describe("basic extraction", () => {
    it("should extract ToC entries from standard format", () => {
      const content = `
# Title

## Table of Contents

- [Features](#features)
- [Installation](#installation)

## Features
`;
      const entries = extractTocEntries(content);

      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ slug: "features", text: "Features" });
      expect(entries[1]).toEqual({
        slug: "installation",
        text: "Installation",
      });
    });

    it("should extract nested ToC entries", () => {
      const content = `
## Table of Contents

- [Section 1](#section-1)
  - [Subsection 1.1](#subsection-11)
  - [Subsection 1.2](#subsection-12)
- [Section 2](#section-2)

## Section 1
`;
      const entries = extractTocEntries(content);

      expect(entries).toHaveLength(4);
      expect(entries.map((e) => e.slug)).toEqual([
        "section-1",
        "subsection-11",
        "subsection-12",
        "section-2",
      ]);
    });
  });

  describe("edge cases", () => {
    it("should return empty array when no ToC section exists", () => {
      const content = `
# Title

## Features

Some content
`;
      const entries = extractTocEntries(content);

      expect(entries).toEqual([]);
    });

    it("should be case-insensitive for ToC header", () => {
      const content = `
## TABLE OF CONTENTS

- [Features](#features)

## Features
`;
      const entries = extractTocEntries(content);

      expect(entries).toHaveLength(1);
    });

    it("should handle ToC with no links", () => {
      const content = `
## Table of Contents

This ToC has no links, just text.

## Features
`;
      const entries = extractTocEntries(content);

      expect(entries).toEqual([]);
    });

    it("should stop at next h2 heading", () => {
      const content = `
## Table of Contents

- [Features](#features)

## Features

Some regular [link](#not-in-toc) in content.
`;
      const entries = extractTocEntries(content);

      expect(entries).toHaveLength(1);
      expect(entries[0].slug).toBe("features");
    });

    it("should handle ToC entries with special characters in text", () => {
      const content = `
## Table of Contents

- [Error Handling & Reference](#error-handling--reference)
- [\`createSAPAIProvider()\`](#createsapaiprovider)

## Features
`;
      const entries = extractTocEntries(content);

      expect(entries).toHaveLength(2);
      expect(entries[0].text).toBe("Error Handling & Reference");
      expect(entries[1].text).toBe("`createSAPAIProvider()`");
    });
  });
});

// ============================================================================
// validateTocContent() Tests
// ============================================================================

describe("validateTocContent", () => {
  describe("valid ToCs", () => {
    it("should pass for valid ToC with matching headings", () => {
      const content = `
# Title

## Table of Contents

- [Features](#features)
- [Installation](#installation)

## Features

Content here.

## Installation

More content.
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.skipped).toBe(false);
    });

    it("should pass for ToC with nested entries", () => {
      const content = `
## Table of Contents

- [Section 1](#section-1)
  - [Subsection](#subsection)
- [Section 2](#section-2)

## Section 1

### Subsection

## Section 2
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(true);
    });
  });

  describe("skipped files", () => {
    it("should skip file with no ToC", () => {
      const content = `
# Title

## Features

Content
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("broken links", () => {
    it("should detect ToC link with no matching heading", () => {
      const content = `
## Table of Contents

- [Features](#features)
- [Nonexistent](#nonexistent)

## Features

Content
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("nonexistent");
    });

    it("should suggest similar slugs when available", () => {
      const content = `
## Table of Contents

- [Features](#feature)

## Features

Content
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Did you mean");
      expect(result.errors[0]).toContain("features");
    });
  });

  describe("missing headings in ToC", () => {
    it("should detect h2 heading not in ToC", () => {
      const content = `
## Table of Contents

- [Features](#features)

## Features

Content

## Installation

More content
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Installation"))).toBe(true);
    });

    it("should not complain about missing h3 headings", () => {
      const content = `
## Table of Contents

- [Features](#features)

## Features

### Subsection not in ToC

Content
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(true);
    });
  });

  describe("duplicate headings", () => {
    it("should handle duplicate headings with correct suffixes", () => {
      const content = `
## Table of Contents

- [Summary](#summary)
- [Details](#details)
- [Summary (again)](#summary-1)

## Summary

First summary.

## Details

Details here.

## Summary

Second summary.
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(true);
    });

    it("should accept base slug for duplicate headings", () => {
      const content = `
## Table of Contents

- [Summary](#summary)
- [Summary (Part 2)](#summary)

## Summary

First.

## Summary

Second.
`;
      // Both ToC entries point to "summary" which should match both headings
      const result = validateTocContent(content);

      expect(result.valid).toBe(true);
    });
  });

  describe("special characters in headings", () => {
    it("should handle & in headings correctly", () => {
      const content = `
## Table of Contents

- [Error Handling & Reference](#error-handling--reference)

## Error Handling & Reference

Content
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(true);
    });

    it("should handle / in headings correctly", () => {
      const content = `
## Table of Contents

- [Problem: High usage / costs](#problem-high-usage--costs)

## Problem: High usage / costs

Content
`;
      const result = validateTocContent(content);

      expect(result.valid).toBe(true);
    });
  });
});
