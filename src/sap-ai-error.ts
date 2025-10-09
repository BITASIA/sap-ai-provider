import { createJsonErrorResponseHandler } from "@ai-sdk/provider-utils";
import { z } from "zod";

/**
 * Schema for SAP AI Core error responses.
 * Matches Orchestration v2 ErrorResponse shape and supports legacy fallback.
 */
const sapAIErrorInnerSchema = z.object({
  /** Unique identifier for tracking the request */
  request_id: z.string(),
  /** HTTP status code or custom error code */
  code: z.number(),
  /** Human-readable error message */
  message: z.string(),
  /** Where the error occurred (e.g., module name) */
  location: z.string(),
  /** Optional intermediate results for debugging */
  intermediate_results: z.any().optional(),
});

// v2 envelope: { error: { ... } }
const sapAIErrorEnvelopeSchema = z.object({
  error: sapAIErrorInnerSchema,
});

// Legacy fallback (v1-style): top-level fields and optional nested error object
const sapAIErrorLegacySchema = z.object({
  request_id: z.string().optional(),
  code: z.number().optional(),
  message: z.string().optional(),
  location: z.string().optional(),
  details: z.string().optional(),
  error: z
    .object({
      message: z.string().optional(),
      code: z.string().optional(),
      param: z.string().optional(),
      type: z.string().optional(),
    })
    .optional(),
});

const sapAIErrorSchema = z.union([sapAIErrorEnvelopeSchema, sapAIErrorLegacySchema]);

export type SAPAIErrorData = z.infer<typeof sapAIErrorSchema>;

/**
 * Custom error class for SAP AI Core errors.
 * Provides structured access to error details returned by the API.
 *
 * @example
 * ```typescript
 * try {
 *   await model.generate();
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

  /** Where the error occurred (e.g., endpoint, function) */
  public readonly location?: string;

  /** Unique identifier for tracking the request */
  public readonly requestId?: string;

  /** Additional error context or debugging information */
  public readonly details?: string;

  /** Intermediate results returned with the error (v2 only) */
  public readonly intermediateResults?: unknown;

  constructor(
    message: string,
    /** Raw error data from the API response */
    public readonly data?: SAPAIErrorData,
    /** Original HTTP response object */
    public readonly response?: Response,
  ) {
    super(message);
    this.name = "SAPAIError";

    if (data) {
      // v2 envelope
      if ((data as any).error) {
        const inner = (data as any).error as z.infer<typeof sapAIErrorInnerSchema>;
        this.code = inner.code;
        this.location = inner.location;
        this.requestId = inner.request_id;
        this.details = undefined;
        this.intermediateResults = inner.intermediate_results;
      } else {
        // legacy top-level
        this.code = (data as any).code;
        this.location = (data as any).location;
        this.requestId = (data as any).request_id;
        this.details = (data as any).details;
      }
    }
  }
}

/**
 * Error response handler for SAP AI Core API calls.
 * Converts API error responses into SAPAIError instances.
 *
 * Features:
 * - Parses error responses into structured format
 * - Provides clear error messages
 * - Handles retryable errors (429, 5xx)
 */
export const sapAIFailedResponseHandler: any = createJsonErrorResponseHandler({
  errorSchema: sapAIErrorSchema as any,
  errorToMessage: (data: SAPAIErrorData) => {
    // Prefer v2 envelope message
    if (data && (data as any).error?.message) return (data as any).error.message;
    // Legacy
    if ((data as any)?.message) return (data as any).message as string;
    return "An error occurred during the SAP AI Core request.";
  },
  isRetryable: (response: Response, error?: unknown) => {
    const status = response.status;
    return (
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  },
});
