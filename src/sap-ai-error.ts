import type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";

import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";
import { isErrorWithCause } from "@sap-cloud-sdk/util";

/**
 * Converts SAP AI SDK OrchestrationErrorResponse to AI SDK APICallError.
 *
 * This ensures standardized error handling compatible with the AI SDK
 * error classification system (retryable vs non-retryable errors).
 *
 * @param errorResponse - The error response from SAP AI SDK
 * @param context - Optional context about where the error occurred
 * @returns APICallError compatible with AI SDK
 *
 * @example
 * **Basic Usage**
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
    requestBody?: unknown;
    responseHeaders?: Record<string, string>;
    url?: string;
  },
): APICallError {
  const error = errorResponse.error;

  let message: string;
  let code: number | undefined;
  let location: string | undefined;
  let requestId: string | undefined;

  if (Array.isArray(error)) {
    // Prefer the first entry when an error list is returned
    const firstError = error[0];
    message = firstError.message;
    code = firstError.code;
    location = firstError.location;
    requestId = firstError.request_id;
  } else {
    message = error.message;
    code = error.code;
    location = error.location;
    requestId = error.request_id;
  }

  const statusCode = getStatusCodeFromSAPError(code);

  const responseBody = JSON.stringify({
    error: {
      code,
      location,
      message,
      request_id: requestId,
    },
  });

  let enhancedMessage = message;

  if (statusCode === 401 || statusCode === 403) {
    enhancedMessage +=
      "\n\nAuthentication failed. Verify your AICORE_SERVICE_KEY environment variable is set correctly." +
      "\nSee: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/create-service-key";
  } else if (statusCode === 404) {
    enhancedMessage +=
      "\n\nResource not found. The model or deployment may not exist in your SAP AI Core instance." +
      "\nSee: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/create-deployment-for-orchestration";
  } else if (statusCode === 429) {
    enhancedMessage +=
      "\n\nRate limit exceeded. Please try again later or contact your SAP administrator." +
      "\nSee: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/rate-limits";
  } else if (statusCode >= 500) {
    enhancedMessage +=
      "\n\nSAP AI Core service error. This is typically a temporary issue. The request will be retried automatically." +
      "\nSee: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/troubleshooting";
  } else if (location) {
    enhancedMessage += `\n\nError location: ${location}`;
  }

  if (requestId) {
    enhancedMessage += `\nRequest ID: ${requestId}`;
  }

  return new APICallError({
    isRetryable: isRetryable(statusCode),
    message: enhancedMessage,
    requestBodyValues: context?.requestBody,
    responseBody,
    responseHeaders: context?.responseHeaders,
    statusCode,
    url: context?.url ?? "",
  });
}

/**
 * Converts a generic error to an appropriate AI SDK error.
 *
 * @param error - The error to convert
 * @param context - Optional context about where the error occurred
 * @returns APICallError or LoadAPIKeyError
 *
 * @example
 * **Basic Usage**
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
    requestBody?: unknown;
    responseHeaders?: Record<string, string>;
    url?: string;
  },
): APICallError | LoadAPIKeyError {
  if (error instanceof APICallError || error instanceof LoadAPIKeyError) {
    return error;
  }

  if (isOrchestrationErrorResponse(error)) {
    return convertSAPErrorToAPICallError(error, {
      ...context,
      responseHeaders:
        context?.responseHeaders ?? getAxiosResponseHeaders(error),
    });
  }

  const responseHeaders =
    context?.responseHeaders ?? getAxiosResponseHeaders(error);

  if (error instanceof Error) {
    const errorMsg = error.message.toLowerCase();
    if (
      errorMsg.includes("authentication") ||
      errorMsg.includes("unauthorized") ||
      errorMsg.includes("aicore_service_key") ||
      errorMsg.includes("invalid credentials")
    ) {
      return new LoadAPIKeyError({
        message:
          `SAP AI Core authentication failed: ${error.message}\n\n` +
          `Make sure your AICORE_SERVICE_KEY environment variable is set correctly.\n` +
          `See: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/create-service-key`,
      });
    }

    if (
      errorMsg.includes("econnrefused") ||
      errorMsg.includes("enotfound") ||
      errorMsg.includes("network") ||
      errorMsg.includes("timeout")
    ) {
      return new APICallError({
        cause: error,
        isRetryable: true,
        message: `Network error connecting to SAP AI Core: ${error.message}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 503,
        url: context?.url ?? "",
      });
    }
  }

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
    cause: error,
    isRetryable: false,
    message: fullMessage,
    requestBodyValues: context?.requestBody,
    responseHeaders,
    statusCode: 500,
    url: context?.url ?? "",
  });
}

/**
 * Extracts response headers from Axios errors.
 *
 * @param error - Error object
 * @returns Response headers or undefined
 * @internal
 */
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
 * Maps SAP AI Core error codes to HTTP status codes for standardized error handling.
 *
 * Validates that codes are in standard HTTP range (100-599) and falls back
 * to 500 for custom SAP error codes outside this range.
 *
 * @param code - SAP error code
 * @returns HTTP status code (100-599)
 * @internal
 */
function getStatusCodeFromSAPError(code?: number): number {
  if (!code) return 500;

  // Validate the code is a standard HTTP status code (100-599)
  if (code >= 100 && code < 600) {
    return code;
  }

  // If code is outside HTTP range (custom SAP codes), map to generic server error
  return 500;
}

/**
 * Type guard to check if an error is an OrchestrationErrorResponse.
 *
 * Performs progressive validation:
 * 1. Checks for object with 'error' property
 * 2. Validates error is object or array
 * 3. Checks for required 'message' property (string type)
 *
 * @param error - Error to check
 * @returns True if error is OrchestrationErrorResponse
 * @internal
 */
function isOrchestrationErrorResponse(
  error: unknown,
): error is OrchestrationErrorResponse {
  if (error === null || typeof error !== "object" || !("error" in error)) {
    return false;
  }

  const errorEnvelope = error as { error?: unknown };
  const innerError = errorEnvelope.error;

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

/**
 * Determines if an error should be retryable based on status code.
 * Following the AI SDK pattern: 429 (rate limit) and 5xx (server errors) are retryable.
 *
 * @param statusCode - HTTP status code
 * @returns True if error should be retried
 * @internal
 */
function isRetryable(statusCode: number): boolean {
  return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}

/**
 * Normalizes various header formats to Record<string, string>.
 *
 * @param headers - Raw headers object
 * @returns Normalized headers or undefined
 * @internal
 */
function normalizeHeaders(
  headers: unknown,
): Record<string, string> | undefined {
  if (!headers || typeof headers !== "object") return undefined;

  const record = headers as Record<string, unknown>;
  const entries = Object.entries(record).flatMap(([key, value]) => {
    if (typeof value === "string") return [[key, value]];
    if (Array.isArray(value)) {
      // Use semicolon separator to avoid ambiguity with commas in header values
      // Example: "Accept: text/html, application/json" contains commas
      const strings = value
        .filter((item): item is string => typeof item === "string")
        .join("; ");
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

export type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";
