import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";
import type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";
import { isErrorWithCause } from "@sap-cloud-sdk/util";

/**
 * Maps SAP AI Core error codes to HTTP status codes for retry logic.
 */
function getStatusCodeFromSAPError(code?: number): number {
  if (!code) return 500;
  return code;
}

/**
 * Determines if an error should be retryable based on status code.
 * Following the Vercel AI SDK pattern: 429 (rate limit) and 5xx (server errors) are retryable.
 */
function isRetryable(statusCode: number): boolean {
  return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}

/**
 * Converts SAP AI SDK OrchestrationErrorResponse to Vercel AI SDK APICallError.
 *
 * This ensures compatibility with OpenCode's error handling system which expects
 * APICallError from the Vercel AI SDK.
 *
 * @param errorResponse - The error response from SAP AI SDK
 * @param context - Optional context about where the error occurred
 * @returns APICallError compatible with Vercel AI SDK
 *
 * @example
 * ```typescript
 * try {
 *   await client.chatCompletion({ messages });
 * } catch (error) {
 *   throw convertSAPErrorToAPICallError(error);
 * }
 * ```
 */
export function convertSAPErrorToAPICallError(
  errorResponse: OrchestrationErrorResponse,
  context?: {
    url?: string;
    requestBody?: unknown;
    responseHeaders?: Record<string, string>;
  },
): APICallError {
  const error = errorResponse.error;

  // Handle both single error and error list
  let message: string;
  let code: number | undefined;
  let location: string | undefined;
  let requestId: string | undefined;

  if (Array.isArray(error)) {
    // ErrorList - get first error (array is never empty based on SAP AI SDK behavior)
    const firstError = error[0];
    message = firstError.message;
    code = firstError.code;
    location = firstError.location;
    requestId = firstError.request_id;
  } else {
    // Single Error object
    message = error.message;
    code = error.code;
    location = error.location;
    requestId = error.request_id;
  }

  const statusCode = getStatusCodeFromSAPError(code);

  // Build detailed error response body with SAP-specific metadata
  const responseBody = JSON.stringify({
    error: {
      message,
      code,
      location,
      request_id: requestId,
    },
  });

  // Add helpful context to error message based on error type
  let enhancedMessage = message;

  if (statusCode === 401 || statusCode === 403) {
    enhancedMessage +=
      "\n\nAuthentication failed. Verify your AICORE_SERVICE_KEY environment variable is set correctly.";
  } else if (statusCode === 404) {
    enhancedMessage +=
      "\n\nResource not found. The model or deployment may not exist in your SAP AI Core instance.";
  } else if (statusCode === 429) {
    enhancedMessage +=
      "\n\nRate limit exceeded. Please try again later or contact your SAP administrator.";
  } else if (location) {
    enhancedMessage += `\n\nError location: ${location}`;
  }

  if (requestId) {
    enhancedMessage += `\nRequest ID: ${requestId}`;
  }

  return new APICallError({
    message: enhancedMessage,
    url: context?.url ?? "",
    requestBodyValues: context?.requestBody,
    statusCode,
    responseHeaders: context?.responseHeaders,
    responseBody,
    isRetryable: isRetryable(statusCode),
  });
}

/**
 * Type guard to check if an error is an OrchestrationErrorResponse.
 */
function isOrchestrationErrorResponse(
  error: unknown,
): error is OrchestrationErrorResponse {
  if (error === null || typeof error !== "object" || !("error" in error)) {
    return false;
  }

  const errorEnvelope = error as { error?: unknown };
  const innerError = errorEnvelope.error;

  // Must be present (array/object)
  if (innerError === undefined) return false;

  if (Array.isArray(innerError)) {
    return innerError.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        "message" in entry &&
        typeof (entry as { message?: unknown }).message === "string",
    );
  }

  return (
    typeof innerError === "object" &&
    innerError !== null &&
    "message" in innerError &&
    typeof (innerError as { message?: unknown }).message === "string"
  );
}

function normalizeHeaders(
  headers: unknown,
): Record<string, string> | undefined {
  if (!headers || typeof headers !== "object") return undefined;

  const record = headers as Record<string, unknown>;
  const entries = Object.entries(record).flatMap(([key, value]) => {
    if (typeof value === "string") return [[key, value]];
    if (Array.isArray(value)) {
      const strings = value
        .filter((item): item is string => typeof item === "string")
        .join(",");
      return strings.length > 0 ? [[key, strings]] : [];
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return [[key, String(value)]];
    }
    return [];
  });

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

function getAxiosResponseHeaders(
  error: unknown,
): Record<string, string> | undefined {
  if (!(error instanceof Error)) return undefined;

  const rootCause = isErrorWithCause(error) ? error.rootCause : error;
  if (typeof rootCause !== "object") return undefined;

  const maybeAxios = rootCause as {
    isAxiosError?: boolean;
    response?: { headers?: unknown };
  };

  if (maybeAxios.isAxiosError !== true) return undefined;
  return normalizeHeaders(maybeAxios.response?.headers);
}

/**
 * Converts a generic error to an appropriate Vercel AI SDK error.
 *
 * @param error - The error to convert
 * @param context - Optional context about where the error occurred
 * @returns APICallError or LoadAPIKeyError
 *
 * @example
 * ```typescript
 * catch (error) {
 *   throw convertToAISDKError(error, { operation: 'doGenerate' });
 * }
 * ```
 */
export function convertToAISDKError(
  error: unknown,
  context?: {
    operation?: string;
    url?: string;
    requestBody?: unknown;
    responseHeaders?: Record<string, string>;
  },
): APICallError | LoadAPIKeyError {
  // If it's already a Vercel AI SDK error, return as-is
  if (error instanceof APICallError || error instanceof LoadAPIKeyError) {
    return error;
  }

  // Handle SAP AI SDK OrchestrationErrorResponse
  if (isOrchestrationErrorResponse(error)) {
    return convertSAPErrorToAPICallError(error, {
      ...context,
      responseHeaders:
        context?.responseHeaders ?? getAxiosResponseHeaders(error),
    });
  }

  const responseHeaders =
    context?.responseHeaders ?? getAxiosResponseHeaders(error);

  // Handle authentication errors
  if (error instanceof Error) {
    const errorMsg = error.message.toLowerCase();
    if (
      errorMsg.includes("authentication") ||
      errorMsg.includes("unauthorized") ||
      errorMsg.includes("aicore_service_key") ||
      errorMsg.includes("invalid credentials")
    ) {
      return new LoadAPIKeyError({
        message: `SAP AI Core authentication failed: ${error.message}`,
      });
    }

    // Handle network/connection errors
    if (
      errorMsg.includes("econnrefused") ||
      errorMsg.includes("enotfound") ||
      errorMsg.includes("network") ||
      errorMsg.includes("timeout")
    ) {
      return new APICallError({
        message: `Network error connecting to SAP AI Core: ${error.message}`,
        url: context?.url ?? "",
        requestBodyValues: context?.requestBody,
        statusCode: 503,
        isRetryable: true,
        responseHeaders,
        cause: error,
      });
    }
  }

  // Generic error - wrap in APICallError
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error occurred";

  const fullMessage = context?.operation
    ? `SAP AI Core ${context.operation} failed: ${message}`
    : `SAP AI Core error: ${message}`;

  return new APICallError({
    message: fullMessage,
    url: context?.url ?? "",
    requestBodyValues: context?.requestBody,
    statusCode: 500,
    isRetryable: false,
    responseHeaders,
    cause: error,
  });
}

// Re-export types for backwards compatibility
export type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";
