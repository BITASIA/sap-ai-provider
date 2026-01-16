/**
 * Unit tests for cli-utils.ts
 * Organized by function in source file order, each with:
 * 1. Nominal cases, 2. Variations, 3. Edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getArgs, parseArgs, parseArgsWithHelp, printHelp } from "../scripts/cli-utils.js";

// Store original process.argv to restore after tests
const originalArgv = process.argv;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  process.argv = originalArgv;
});

// =============================================================================
// getArgs
// =============================================================================

describe("getArgs", () => {
  // Nominal cases
  it("returns process.argv.slice(2)", () => {
    process.argv = ["node", "script.js", "arg1", "arg2"];
    expect(getArgs()).toEqual(["arg1", "arg2"]);
  });

  it("returns empty array when no arguments", () => {
    process.argv = ["node", "script.js"];
    expect(getArgs()).toEqual([]);
  });

  // Variations
  it("includes all arguments after script name", () => {
    process.argv = ["node", "script.js", "--flag", "value", "file.md"];
    expect(getArgs()).toEqual(["--flag", "value", "file.md"]);
  });
});

// =============================================================================
// parseArgs
// =============================================================================

describe("parseArgs", () => {
  // Nominal cases
  it("parses positional arguments as files", () => {
    process.argv = ["node", "script.js", "file1.md", "file2.md"];
    const result = parseArgs();
    expect(result.files).toEqual(["file1.md", "file2.md"]);
    expect(result.excludeDirs).toEqual([]);
    expect(result.help).toBe(false);
  });

  it("parses --exclude-dirs with comma-separated values", () => {
    process.argv = ["node", "script.js", "--exclude-dirs", "dir1,dir2,dir3"];
    const result = parseArgs();
    expect(result.excludeDirs).toEqual(["dir1", "dir2", "dir3"]);
  });

  it("parses --exclude-dir (singular alias)", () => {
    process.argv = ["node", "script.js", "--exclude-dir", "single-dir"];
    const result = parseArgs();
    expect(result.excludeDirs).toEqual(["single-dir"]);
  });

  // Variations: help flags
  it("sets help=true for --help", () => {
    process.argv = ["node", "script.js", "--help"];
    const result = parseArgs();
    expect(result.help).toBe(true);
  });

  it("sets help=true for -h", () => {
    process.argv = ["node", "script.js", "-h"];
    const result = parseArgs();
    expect(result.help).toBe(true);
  });

  // Variations: combined arguments
  it("combines files and exclude-dirs", () => {
    process.argv = ["node", "script.js", "file.md", "--exclude-dirs", "node_modules,dist"];
    const result = parseArgs();
    expect(result.files).toEqual(["file.md"]);
    expect(result.excludeDirs).toEqual(["node_modules", "dist"]);
  });

  it("handles multiple positional files", () => {
    process.argv = ["node", "script.js", "a.md", "b.md", "c.md"];
    const result = parseArgs();
    expect(result.files).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("trims whitespace from exclude-dirs values", () => {
    process.argv = ["node", "script.js", "--exclude-dirs", " dir1 , dir2 "];
    const result = parseArgs();
    expect(result.excludeDirs).toEqual(["dir1", "dir2"]);
  });

  it("filters empty values from exclude-dirs", () => {
    process.argv = ["node", "script.js", "--exclude-dirs", "dir1,,dir2,"];
    const result = parseArgs();
    expect(result.excludeDirs).toEqual(["dir1", "dir2"]);
  });

  // Edge cases
  it("handles empty args", () => {
    process.argv = ["node", "script.js"];
    const result = parseArgs();
    expect(result.files).toEqual([]);
    expect(result.excludeDirs).toEqual([]);
    expect(result.help).toBe(false);
  });

  it("exits on unknown option", () => {
    process.argv = ["node", "script.js", "--unknown-flag"];
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => parseArgs()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockError).toHaveBeenCalledWith("Unknown option: --unknown-flag");
  });

  it("exits when --exclude-dirs has no value", () => {
    process.argv = ["node", "script.js", "--exclude-dirs"];
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => parseArgs()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockError).toHaveBeenCalledWith(
      "Error: --exclude-dirs requires a comma-separated list of directories",
    );
  });

  it("exits when --exclude-dirs is followed by another option", () => {
    process.argv = ["node", "script.js", "--exclude-dirs", "--help"];
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => parseArgs()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

// =============================================================================
// printHelp
// =============================================================================

describe("printHelp", () => {
  // Nominal cases
  it("prints description and usage", () => {
    const mockLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const config = {
      description: "Test CLI Tool",
      usageExamples: ["npm run test", "npm run test -- --help"],
    };

    expect(() => {
      printHelp(config);
    }).toThrow("process.exit called");
    expect(mockLog).toHaveBeenCalledWith("Test CLI Tool");
    expect(mockLog).toHaveBeenCalledWith("Usage:");
    expect(mockLog).toHaveBeenCalledWith("  npm run test");
    expect(mockLog).toHaveBeenCalledWith("  npm run test -- --help");
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  // Variations
  it("prints custom options", () => {
    const mockLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const config = {
      description: "Test",
      options: [
        {
          aliases: ["--verbose", "-v"],
          description: "Enable verbose output",
        },
        {
          aliases: ["--output"],
          description: "Output file",
          takesValue: true,
          valuePlaceholder: "<file>",
        },
      ],
    };

    expect(() => {
      printHelp(config);
    }).toThrow("process.exit called");
    expect(mockLog).toHaveBeenCalledWith("  --verbose, -v  Enable verbose output");
    expect(mockLog).toHaveBeenCalledWith("  --output <file>  Output file");
  });

  it("prints default excluded dirs", () => {
    const mockLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const config = {
      defaultExcludeDirs: ["node_modules", ".git"],
      description: "Test",
    };

    expect(() => {
      printHelp(config);
    }).toThrow("process.exit called");
    expect(mockLog).toHaveBeenCalledWith("Default excluded directories:", "node_modules, .git");
  });

  // Edge cases
  it("handles config without usage examples", () => {
    const mockLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const config = {
      description: "Minimal config",
    };

    expect(() => {
      printHelp(config);
    }).toThrow("process.exit called");
    expect(mockLog).toHaveBeenCalledWith("Minimal config");
    expect(mockLog).toHaveBeenCalledWith("Options:");
  });

  it("handles empty usage examples array", () => {
    const mockLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const config = {
      description: "Test",
      usageExamples: [],
    };

    expect(() => {
      printHelp(config);
    }).toThrow("process.exit called");
    // Should not print any example lines
    const logCalls = mockLog.mock.calls.map((call) => call[0] as string | undefined);
    expect(
      logCalls.filter((c): c is string => typeof c === "string" && c.startsWith("  npm")),
    ).toEqual([]);
  });
});

// =============================================================================
// parseArgsWithHelp
// =============================================================================

describe("parseArgsWithHelp", () => {
  // Nominal cases
  it("returns parsed args when no help flag", () => {
    process.argv = ["node", "script.js", "file.md"];
    const config = { description: "Test" };
    const result = parseArgsWithHelp(config);
    expect(result.files).toEqual(["file.md"]);
    expect(result.help).toBe(false);
  });

  // Variations
  it("calls printHelp when help=true", () => {
    process.argv = ["node", "script.js", "--help"];
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const config = { description: "Test CLI" };

    expect(() => parseArgsWithHelp(config)).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("passes config to printHelp", () => {
    process.argv = ["node", "script.js", "-h"];
    const mockLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const config = {
      defaultExcludeDirs: ["test-dir"],
      description: "My Description",
    };

    expect(() => parseArgsWithHelp(config)).toThrow("process.exit called");
    expect(mockLog).toHaveBeenCalledWith("My Description");
    expect(mockLog).toHaveBeenCalledWith("Default excluded directories:", "test-dir");
  });

  // Edge cases
  it("returns empty result for empty args", () => {
    process.argv = ["node", "script.js"];
    const config = { description: "Test" };
    const result = parseArgsWithHelp(config);
    expect(result.files).toEqual([]);
    expect(result.excludeDirs).toEqual([]);
    expect(result.help).toBe(false);
  });
});
