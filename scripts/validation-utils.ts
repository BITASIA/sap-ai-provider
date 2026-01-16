/**
 * Shared validation utilities for documentation scripts.
 * Provides common validation result handling used across validation checks.
 */

/**
 * Validation check result.
 * Used by all validation functions in validate-docs.ts.
 */
export interface ValidationResult {
  /** Error messages (failures that must be fixed). */
  errors: string[];
  /** Whether check passed (no errors). */
  passed: boolean;
  /** Warning messages (issues to consider). */
  warnings: string[];
}

/**
 * Combines multiple validation results into one.
 *
 * @param results - Validation results to aggregate
 * @returns Combined result with all errors/warnings
 */
export function aggregateValidationResults(results: ValidationResult[]): ValidationResult {
  return results.reduce<ValidationResult>(
    (acc, result) => ({
      errors: [...acc.errors, ...result.errors],
      passed: acc.passed && result.passed,
      warnings: [...acc.warnings, ...result.warnings],
    }),
    createValidationResult(),
  );
}

/**
 * Creates an empty validation result.
 * Reduces boilerplate in validation functions.
 *
 * @returns Fresh validation result with empty arrays and passed=true
 * @example
 * function validateSomething(): ValidationResult {
 *   const result = createValidationResult();
 *   if (somethingWrong) {
 *     result.errors.push("Something is wrong");
 *   }
 *   return finalizeValidationResult(result);
 * }
 */
export function createValidationResult(): ValidationResult {
  return {
    errors: [],
    passed: true,
    warnings: [],
  };
}

/**
 * Finalizes a validation result by setting passed based on errors.
 * Call this before returning from a validation function.
 *
 * @param result - Validation result to finalize
 * @returns The same result with passed updated
 */
export function finalizeValidationResult(result: ValidationResult): ValidationResult {
  result.passed = result.errors.length === 0;
  return result;
}
