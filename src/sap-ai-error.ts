import { createJsonErrorResponseHandler } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { HTTP_STATUS_CODES, ERROR_NAME } from "./constants";

/**
 * Schema for SAP AI Core error responses.
 * This matches the error format returned by the SAP AI Core API.
 */
const sapAIErrorSchema = z
  .object({
    /** Unique identifier for tracking the request */
    request_id: z.string().optional(),

    /** HTTP status code or custom error code */
    code: z.number().optional(),

    /** Human-readable error message */
    message: z.string().optional(),

    /** Where the error occurred (e.g., endpoint, function) */
    location: z.string().optional(),

    /** Detailed error information */
    error: z
      .object({
        /** Specific error message */
        message: z.string().optional(),

        /** Error type code */
        code: z.string().optional(),

        /** Parameter that caused the error */
        param: z.string().optional(),

        /** Error category (e.g., 'validation', 'auth') */
        type: z.string().optional(),
      })
      .optional(),

    /** Additional error context or debugging information */
    details: z.string().optional(),
  })
  .optional();

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

  constructor(
    message: string,
    /** Raw error data from the API response */
    public readonly data?: SAPAIErrorData,
    /** Original HTTP response object */
    public readonly response?: Response,
  ) {
    super(message);
    this.name = ERROR_NAME;

    if (data) {
      this.code = data.code;
      this.location = data.location;
      this.requestId = data.request_id;
      this.details = data.details;
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
    return (
      data?.error?.message ||
      data?.message ||
      "An error occurred during the SAP AI Core request."
    );
  },
  isRetryable: (response: Response, _error?: unknown) => {
    const status = response.status;
    return (
      status === HTTP_STATUS_CODES.TOO_MANY_REQUESTS ||
      status === HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR ||
      status === HTTP_STATUS_CODES.BAD_GATEWAY ||
      status === HTTP_STATUS_CODES.SERVICE_UNAVAILABLE ||
      status === HTTP_STATUS_CODES.GATEWAY_TIMEOUT
    );
  },
});
