/**
 * Unit tests for validation-utils.ts
 * Organized by function in source file order, each with:
 * 1. Nominal cases, 2. Variations, 3. Edge cases
 */

import { describe, expect, it } from "vitest";

import {
  aggregateValidationResults,
  createValidationResult,
  finalizeValidationResult,
} from "../scripts/validation-utils.js";

// =============================================================================
// createValidationResult
// =============================================================================

describe("createValidationResult", () => {
  // Nominal cases
  it("creates result with empty arrays and passed=true", () => {
    const result = createValidationResult();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.passed).toBe(true);
  });

  // Variations
  it("returns a new object each time", () => {
    const result1 = createValidationResult();
    const result2 = createValidationResult();
    expect(result1).not.toBe(result2);
    expect(result1.errors).not.toBe(result2.errors);
    expect(result1.warnings).not.toBe(result2.warnings);
  });

  it("returned object is mutable", () => {
    const result = createValidationResult();
    result.errors.push("test error");
    result.warnings.push("test warning");
    expect(result.errors).toContain("test error");
    expect(result.warnings).toContain("test warning");
  });
});

// =============================================================================
// finalizeValidationResult
// =============================================================================

describe("finalizeValidationResult", () => {
  // Nominal cases
  it("sets passed=true when no errors", () => {
    const result = createValidationResult();
    result.warnings.push("some warning");
    const finalized = finalizeValidationResult(result);
    expect(finalized.passed).toBe(true);
  });

  it("sets passed=false when errors present", () => {
    const result = createValidationResult();
    result.errors.push("some error");
    const finalized = finalizeValidationResult(result);
    expect(finalized.passed).toBe(false);
  });

  // Variations
  it("preserves existing warnings", () => {
    const result = createValidationResult();
    result.warnings.push("warning 1", "warning 2");
    result.errors.push("error 1");
    const finalized = finalizeValidationResult(result);
    expect(finalized.warnings).toEqual(["warning 1", "warning 2"]);
  });

  it("preserves existing errors", () => {
    const result = createValidationResult();
    result.errors.push("error 1", "error 2");
    const finalized = finalizeValidationResult(result);
    expect(finalized.errors).toEqual(["error 1", "error 2"]);
  });

  it("returns the same object (mutates in place)", () => {
    const result = createValidationResult();
    const finalized = finalizeValidationResult(result);
    expect(finalized).toBe(result);
  });

  // Edge cases
  it("handles empty errors array", () => {
    const result = createValidationResult();
    const finalized = finalizeValidationResult(result);
    expect(finalized.passed).toBe(true);
    expect(finalized.errors).toEqual([]);
  });
});

// =============================================================================
// aggregateValidationResults
// =============================================================================

describe("aggregateValidationResults", () => {
  // Nominal cases
  it("combines multiple results", () => {
    const result1 = createValidationResult();
    result1.errors.push("error 1");
    result1.warnings.push("warning 1");

    const result2 = createValidationResult();
    result2.errors.push("error 2");
    result2.warnings.push("warning 2");

    const aggregated = aggregateValidationResults([result1, result2]);
    expect(aggregated.errors).toEqual(["error 1", "error 2"]);
    expect(aggregated.warnings).toEqual(["warning 1", "warning 2"]);
  });

  it("merges errors from all results", () => {
    const result1 = createValidationResult();
    result1.errors.push("a", "b");

    const result2 = createValidationResult();
    result2.errors.push("c");

    const result3 = createValidationResult();
    result3.errors.push("d", "e", "f");

    const aggregated = aggregateValidationResults([result1, result2, result3]);
    expect(aggregated.errors).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("merges warnings from all results", () => {
    const result1 = createValidationResult();
    result1.warnings.push("w1");

    const result2 = createValidationResult();
    result2.warnings.push("w2", "w3");

    const aggregated = aggregateValidationResults([result1, result2]);
    expect(aggregated.warnings).toEqual(["w1", "w2", "w3"]);
  });

  // Variations
  it("returns passed=false if any result has errors", () => {
    const result1 = createValidationResult();
    finalizeValidationResult(result1); // passed=true

    const result2 = createValidationResult();
    result2.errors.push("error");
    finalizeValidationResult(result2); // passed=false

    const aggregated = aggregateValidationResults([result1, result2]);
    expect(aggregated.passed).toBe(false);
  });

  it("returns passed=true if all results pass", () => {
    const result1 = createValidationResult();
    result1.warnings.push("warning only");
    finalizeValidationResult(result1);

    const result2 = createValidationResult();
    finalizeValidationResult(result2);

    const aggregated = aggregateValidationResults([result1, result2]);
    expect(aggregated.passed).toBe(true);
  });

  // Edge cases
  it("handles empty array input", () => {
    const aggregated = aggregateValidationResults([]);
    expect(aggregated.errors).toEqual([]);
    expect(aggregated.warnings).toEqual([]);
    expect(aggregated.passed).toBe(true);
  });

  it("handles single result input", () => {
    const result = createValidationResult();
    result.errors.push("single error");
    result.warnings.push("single warning");
    finalizeValidationResult(result);

    const aggregated = aggregateValidationResults([result]);
    expect(aggregated.errors).toEqual(["single error"]);
    expect(aggregated.warnings).toEqual(["single warning"]);
    expect(aggregated.passed).toBe(false);
  });

  it("returns a new object, not mutating inputs", () => {
    const result1 = createValidationResult();
    result1.errors.push("e1");

    const result2 = createValidationResult();
    result2.errors.push("e2");

    const aggregated = aggregateValidationResults([result1, result2]);

    expect(aggregated).not.toBe(result1);
    expect(aggregated).not.toBe(result2);
    expect(result1.errors).toEqual(["e1"]);
    expect(result2.errors).toEqual(["e2"]);
  });
});
