import type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";

/**
 * Custom error class for SAP AI Core errors.
 * Provides structured access to error details returned by the API.
 *
 * The SAP AI SDK handles most error responses internally, but this class
 * can be used to wrap and provide additional context for errors.
 *
 * @example
 * ```typescript
 * try {
 *   await model.doGenerate({ prompt });
 * } catch (error) {
 *   if (error instanceof SAPAIError) {
 *     console.error('Error Code:', error.code);
 *     console.error('Request ID:', error.requestId);
 *     console.error('Location:', error.location);
 *   }
 * }
 * ```
 */
export class SAPAIError extends Error {
  /** HTTP status code or custom error code */
  public readonly code?: number;

  /** Where the error occurred (e.g., module name) */
  public readonly location?: string;

  /** Unique identifier for tracking the request */
  public readonly requestId?: string;

  /** Additional error context or debugging information */
  public readonly details?: string;

  /** Original cause of the error */
  public readonly cause?: unknown;

  constructor(
    message: string,
    options?: {
      code?: number;
      location?: string;
      requestId?: string;
      details?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "SAPAIError";
    this.code = options?.code;
    this.location = options?.location;
    this.requestId = options?.requestId;
    this.details = options?.details;
    this.cause = options?.cause;
  }

  /**
   * Creates a SAPAIError from an OrchestrationErrorResponse.
   *
   * @param errorResponse - The error response from SAP AI SDK
   * @returns A new SAPAIError instance
   */
  static fromOrchestrationError(
    errorResponse: OrchestrationErrorResponse,
  ): SAPAIError {
    const error = errorResponse.error;

    // Handle both single error and error list
    if (Array.isArray(error)) {
      // ErrorList - get first error
      const firstError = error[0];
      // Defensive: firstError might be undefined if array is empty
      return new SAPAIError(
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        firstError?.message ?? "Unknown orchestration error",
        {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          code: firstError?.code,
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          location: firstError?.location,
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          requestId: firstError?.request_id,
        },
      );
    } else {
      // Single Error object
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      return new SAPAIError(error.message ?? "Unknown orchestration error", {
        code: error.code,
        location: error.location,
        requestId: error.request_id,
      });
    }
  }

  /**
   * Creates a SAPAIError from a generic error.
   *
   * @param error - The original error
   * @param context - Optional context about where the error occurred
   * @returns A new SAPAIError instance
   */
  static fromError(error: unknown, context?: string): SAPAIError {
    if (error instanceof SAPAIError) {
      return error;
    }

    let message: string;
    if (error instanceof Error) {
      message = error.message;
    } else if (error == null) {
      message = "Unknown error";
    } else if (
      typeof error === "string" ||
      typeof error === "number" ||
      typeof error === "boolean" ||
      typeof error === "bigint"
    ) {
      // Primitives that can be safely stringified
      message = String(error);
    } else {
      // Objects, symbols, and other types
      try {
        message = JSON.stringify(error);
      } catch {
        message = "[Unstringifiable Value]";
      }
    }

    return new SAPAIError(context ? `${context}: ${message}` : message, {
      cause: error,
    });
  }
}

// Re-export the error response type from SAP AI SDK
export type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";
