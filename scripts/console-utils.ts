/**
 * Console output formatting utilities for documentation scripts.
 * Provides consistent emoji-based logging across validation and fix tools.
 */

/** Console output icons. */
export const icons = {
  error: "❌",
  info: "ℹ️",
  processing: "📄",
  success: "✅",
  warning: "⚠️",
} as const;

/**
 * Logs an error message with ❌ icon.
 *
 * @param message - Message to log
 */
export function logError(message: string): void {
  console.log(`  ${icons.error} ${message}`);
}

/**
 * Logs an info message with ℹ️ icon.
 *
 * @param message - Message to log
 */
export function logInfo(message: string): void {
  console.log(`  ${icons.info} ${message}`);
}

/**
 * Logs a processing message with 📄 icon.
 *
 * @param message - Message to log
 */
export function logProcessing(message: string): void {
  console.log(`  ${icons.processing} ${message}`);
}

/**
 * Logs a section header with separator line.
 *
 * @param title - Section title
 * @param width - Width of separator (default: 60)
 */
export function logSection(title: string, width = 60): void {
  console.log(`\n${title}`);
  console.log("=".repeat(width));
}

/**
 * Logs a success message with ✅ icon.
 *
 * @param message - Message to log
 */
export function logSuccess(message: string): void {
  console.log(`  ${icons.success} ${message}`);
}

/**
 * Logs a summary with counts.
 *
 * @param counts - Object with count labels and values
 */
export function logSummary(counts: Record<string, number>): void {
  console.log("\n📊 Summary:");
  for (const [label, count] of Object.entries(counts)) {
    console.log(`  ${label}: ${String(count)}`);
  }
}

/**
 * Logs a warning message with ⚠️ icon.
 *
 * @param message - Message to log
 */
export function logWarning(message: string): void {
  console.log(`  ${icons.warning} ${message}`);
}
