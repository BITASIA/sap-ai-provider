import type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";

import { APICallError, LoadAPIKeyError, NoSuchModelError } from "@ai-sdk/provider";
import { isErrorWithCause } from "@sap-cloud-sdk/util";

/**
 * Converts SAP AI SDK OrchestrationErrorResponse to AI SDK APICallError.
 *
 * This ensures standardized error handling compatible with the AI SDK
 * error classification system (retryable vs non-retryable errors).
 * @param errorResponse - The error response from SAP AI SDK
 * @param context - Optional context about where the error occurred
 * @param context.requestBody - The request body that caused the error
 * @param context.responseHeaders - Response headers from the failed request
 * @param context.url - URL that was called when the error occurred
 * @returns APICallError, LoadAPIKeyError, or NoSuchModelError compatible with AI SDK
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
): APICallError | LoadAPIKeyError | NoSuchModelError {
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

  // Handle authentication errors (401/403) with LoadAPIKeyError
  if (statusCode === 401 || statusCode === 403) {
    enhancedMessage +=
      "\n\nAuthentication failed. Verify your AICORE_SERVICE_KEY environment variable is set correctly." +
      "\nSee: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/create-service-key";
    if (requestId) {
      enhancedMessage += `\nRequest ID: ${requestId}`;
    }
    return new LoadAPIKeyError({
      message: enhancedMessage,
    });
  }

  // Handle model/deployment not found (404) with NoSuchModelError
  if (statusCode === 404) {
    enhancedMessage +=
      "\n\nResource not found. The model or deployment may not exist in your SAP AI Core instance." +
      "\nSee: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/create-deployment-for-orchestration";
    if (requestId) {
      enhancedMessage += `\nRequest ID: ${requestId}`;
    }
    // Try to extract model/deployment identifier from message or location
    const modelId = extractModelIdentifier(message, location);
    return new NoSuchModelError({
      message: enhancedMessage,
      modelId: modelId ?? "unknown",
      modelType: "languageModel",
    });
  }

  if (statusCode === 429) {
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
 * @param error - The error to convert
 * @param context - Optional context about where the error occurred
 * @param context.operation - The operation that was being performed when the error occurred
 * @param context.requestBody - The request body that caused the error
 * @param context.responseHeaders - Response headers from the failed request
 * @param context.url - URL that was called when the error occurred
 * @returns APICallError, LoadAPIKeyError, or NoSuchModelError
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
): APICallError | LoadAPIKeyError | NoSuchModelError {
  if (
    error instanceof APICallError ||
    error instanceof LoadAPIKeyError ||
    error instanceof NoSuchModelError
  ) {
    return error;
  }

  // Extract the root cause if this is an ErrorWithCause from SAP SDK
  // ErrorWithCause chains: ErrorWithCause -> ErrorWithCause -> ... -> root Error
  const rootError = error instanceof Error && isErrorWithCause(error) ? error.rootCause : error;

  // First check if it's a direct OrchestrationErrorResponse
  if (isOrchestrationErrorResponse(rootError)) {
    return convertSAPErrorToAPICallError(rootError, {
      ...context,
      responseHeaders: context?.responseHeaders ?? getAxiosResponseHeaders(error),
    });
  }

  // Extract SAP error JSON from SSE error message
  if (rootError instanceof Error) {
    const parsedError = tryExtractSAPErrorFromMessage(rootError.message);
    if (parsedError && isOrchestrationErrorResponse(parsedError)) {
      return convertSAPErrorToAPICallError(parsedError, {
        ...context,
        responseHeaders: context?.responseHeaders ?? getAxiosResponseHeaders(error),
      });
    }
  }

  const responseHeaders = context?.responseHeaders ?? getAxiosResponseHeaders(error);

  if (rootError instanceof Error) {
    const errorMsg = rootError.message.toLowerCase();
    const originalMsg = rootError.message;

    // Authentication errors -> LoadAPIKeyError
    if (
      errorMsg.includes("authentication") ||
      errorMsg.includes("unauthorized") ||
      errorMsg.includes("aicore_service_key") ||
      errorMsg.includes("invalid credentials") ||
      errorMsg.includes("service credentials") ||
      errorMsg.includes("service binding")
    ) {
      return new LoadAPIKeyError({
        message:
          `SAP AI Core authentication failed: ${originalMsg}\n\n` +
          `Make sure your AICORE_SERVICE_KEY environment variable is set correctly.\n` +
          `See: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/create-service-key`,
      });
    }

    // Network errors
    if (
      errorMsg.includes("econnrefused") ||
      errorMsg.includes("enotfound") ||
      errorMsg.includes("network") ||
      errorMsg.includes("timeout")
    ) {
      return new APICallError({
        cause: error,
        isRetryable: true,
        message: `Network error connecting to SAP AI Core: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 503,
        url: context?.url ?? "",
      });
    }

    // Destination resolution errors
    if (errorMsg.includes("could not resolve destination")) {
      return new APICallError({
        cause: error,
        isRetryable: false,
        message:
          `SAP AI Core destination error: ${originalMsg}\n\n` +
          `Check your destination configuration or provide a valid destinationName.`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 400,
        url: context?.url ?? "",
      });
    }

    // Deployment resolution errors -> NoSuchModelError
    if (
      errorMsg.includes("failed to resolve deployment") ||
      errorMsg.includes("no deployment matched")
    ) {
      const modelId = extractModelIdentifier(originalMsg);
      return new NoSuchModelError({
        message:
          `SAP AI Core deployment error: ${originalMsg}\n\n` +
          `Make sure you have a running orchestration deployment in your AI Core instance.\n` +
          `See: https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/create-deployment-for-orchestration`,
        modelId: modelId ?? "unknown",
        modelType: "languageModel",
      });
    }

    // Content filtering errors
    if (errorMsg.includes("filtered by the output filter")) {
      return new APICallError({
        cause: error,
        isRetryable: false,
        message:
          `Content was filtered: ${originalMsg}\n\n` +
          `The model's response was blocked by content safety filters. Try a different prompt.`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 400,
        url: context?.url ?? "",
      });
    }

    // Extract HTTP status code from error message
    const statusMatch = /status code (\d+)/i.exec(originalMsg);
    if (statusMatch) {
      const extractedStatus = parseInt(statusMatch[1], 10);
      return new APICallError({
        cause: error,
        isRetryable: isRetryable(extractedStatus),
        message: `SAP AI Core request failed: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: extractedStatus,
        url: context?.url ?? "",
      });
    }

    // Consumed stream is a programming error
    if (errorMsg.includes("consumed stream")) {
      return new APICallError({
        cause: error,
        isRetryable: false,
        message: `SAP AI Core stream consumption error: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 500,
        url: context?.url ?? "",
      });
    }

    // SSE stream errors
    if (
      errorMsg.includes("iterating over") ||
      errorMsg.includes("parse message into json") ||
      errorMsg.includes("received from") ||
      errorMsg.includes("no body") ||
      errorMsg.includes("invalid sse payload")
    ) {
      return new APICallError({
        cause: error,
        isRetryable: true,
        message: `SAP AI Core streaming error: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 500,
        url: context?.url ?? "",
      });
    }

    // Configuration and validation errors
    if (
      errorMsg.includes("prompt template or messages must be defined") ||
      errorMsg.includes("filtering parameters cannot be empty") ||
      errorMsg.includes("templating yaml string must be non-empty") ||
      errorMsg.includes("could not access response data") ||
      errorMsg.includes("could not parse json") ||
      errorMsg.includes("error parsing yaml") ||
      errorMsg.includes("yaml does not conform") ||
      errorMsg.includes("validation errors")
    ) {
      return new APICallError({
        cause: error,
        isRetryable: false,
        message: `SAP AI Core configuration error: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 400,
        url: context?.url ?? "",
      });
    }

    // Buffer not available is an environment error
    if (errorMsg.includes("buffer is not available as globals")) {
      return new APICallError({
        cause: error,
        isRetryable: false,
        message: `SAP AI Core environment error: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 500,
        url: context?.url ?? "",
      });
    }

    // Response stream undefined is a programming error
    if (errorMsg.includes("response stream is undefined")) {
      return new APICallError({
        cause: error,
        isRetryable: false,
        message: `SAP AI Core response stream error: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 500,
        url: context?.url ?? "",
      });
    }

    // Response timing issues
    if (
      errorMsg.includes("response is required to process") ||
      errorMsg.includes("stream is still open") ||
      errorMsg.includes("data is not available yet")
    ) {
      return new APICallError({
        cause: error,
        isRetryable: true,
        message: `SAP AI Core response processing error: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 500,
        url: context?.url ?? "",
      });
    }

    // Deployment retrieval errors
    if (errorMsg.includes("failed to fetch the list of deployments")) {
      return new APICallError({
        cause: error,
        isRetryable: true,
        message: `SAP AI Core deployment retrieval error: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 503,
        url: context?.url ?? "",
      });
    }

    // Stream buffer type errors
    if (errorMsg.includes("received non-uint8array")) {
      return new APICallError({
        cause: error,
        isRetryable: false,
        message: `SAP AI Core stream buffer error: ${originalMsg}`,
        requestBodyValues: context?.requestBody,
        responseHeaders,
        statusCode: 500,
        url: context?.url ?? "",
      });
    }
  }

  const message =
    rootError instanceof Error
      ? rootError.message
      : typeof rootError === "string"
        ? rootError
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
 * Extracts model or deployment identifier from error message or location.
 * @param message - Error message
 * @param location - Error location
 * @returns Model/deployment identifier or undefined
 * @internal
 */
function extractModelIdentifier(message: string, location?: string): string | undefined {
  // Try to extract from message: "deployment: xyz", "deployment xyz", "model: xyz", etc.
  const patterns = [
    /deployment[:\s]+([a-zA-Z0-9_-]+)/i,
    /model[:\s]+([a-zA-Z0-9_-]+)/i,
    /resource[:\s]+([a-zA-Z0-9_-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(message);
    if (match?.[1]) {
      return match[1];
    }
  }

  // Try location as fallback
  if (location) {
    const locationMatch = /([a-zA-Z0-9_-]+)/.exec(location);
    if (locationMatch?.[1]) {
      return locationMatch[1];
    }
  }

  return undefined;
}

/**
 * Extracts response headers from Axios errors.
 * @param error - Error object
 * @returns Response headers or undefined
 * @internal
 */
function getAxiosResponseHeaders(error: unknown): Record<string, string> | undefined {
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
 * @param code - SAP error code
 * @returns HTTP status code (100-599)
 * @example
 * ```typescript
 * getStatusCodeFromSAPError(401) // Returns 401 (Unauthorized)
 * getStatusCodeFromSAPError(429) // Returns 429 (Rate Limit)
 * getStatusCodeFromSAPError(999) // Returns 500 (custom SAP code → fallback)
 * getStatusCodeFromSAPError()    // Returns 500 (no code provided)
 * ```
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
 * @param error - Error to check
 * @returns True if error is OrchestrationErrorResponse
 * @internal
 */
function isOrchestrationErrorResponse(error: unknown): error is OrchestrationErrorResponse {
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
 * Determines if an HTTP status code represents a retryable error.
 * Following the Vercel AI SDK pattern from api-call-error.ts:
 * - 408 (Request Timeout)
 * - 409 (Conflict)
 * - 429 (Too Many Requests / Rate Limit)
 * - 5xx (Server Errors)
 * @param statusCode - HTTP status code
 * @returns True if error should be retried
 * @internal
 */
function isRetryable(statusCode: number): boolean {
  return (
    statusCode === 408 ||
    statusCode === 409 ||
    statusCode === 429 ||
    (statusCode >= 500 && statusCode < 600)
  );
}

/**
 * Normalizes various header formats to Record<string, string>.
 * @param headers - Raw headers object
 * @returns Normalized headers or undefined
 * @internal
 */
function normalizeHeaders(headers: unknown): Record<string, string> | undefined {
  if (!headers || typeof headers !== "object") return undefined;

  const record = headers as Record<string, unknown>;
  const entries = Object.entries(record).flatMap(([key, value]) => {
    if (typeof value === "string") return [[key, value]];
    if (Array.isArray(value)) {
      // Use semicolon separator to avoid ambiguity with commas in header values
      // Example: "Accept: text/html, application/json" contains commas
      const strings = value.filter((item): item is string => typeof item === "string").join("; ");
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

/**
 * Extracts SAP error JSON from an error message.
 * @param message - Error message that may contain JSON
 * @returns Parsed error in OrchestrationErrorResponse format, or null
 * @internal
 */
function tryExtractSAPErrorFromMessage(message: string): unknown {
  const jsonMatch = /\{[\s\S]*\}/.exec(message);
  if (!jsonMatch) return null;

  try {
    const parsed: unknown = JSON.parse(jsonMatch[0]);

    // Already in OrchestrationErrorResponse format
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      return parsed;
    }

    // Direct SSE format - wrap it
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      return { error: parsed as Record<string, unknown> };
    }

    return null;
  } catch {
    return null;
  }
}

export type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";
