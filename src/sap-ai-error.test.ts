/**
 * Unit tests for SAP AI Error Handling
 *
 * Tests error conversion from SAP AI SDK format to Vercel AI SDK format,
 * including status code mapping, retry logic, and error message enhancement.
 */

import type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";

import { APICallError, LoadAPIKeyError, NoSuchModelError } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";

import { convertSAPErrorToAPICallError, convertToAISDKError } from "./sap-ai-error";

/** Type for parsed responseBody in tests */
interface ParsedResponseBody {
  error: {
    code?: number;
    location?: string;
    message?: string;
    request_id?: string;
  };
}

describe("convertSAPErrorToAPICallError", () => {
  it("should convert SAP error with single error object", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code: 500,
        location: "LLM Module",
        message: "Test error message",
        request_id: "test-request-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.statusCode).toBe(500);
      expect(result.isRetryable).toBe(true);
    }
    expect(result.message).toContain("Test error message");
  });

  it("should convert SAP error with error list (array)", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: [
        {
          code: 400,
          location: "Input Module",
          message: "First error",
          request_id: "test-request-456",
        },
      ],
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.statusCode).toBe(400);
    }
    expect(result.message).toContain("First error");
  });

  it.each([
    { code: 408, description: "Request Timeout", message: "Request timed out" },
    { code: 409, description: "Conflict", message: "Conflict error" },
    { code: 429, description: "Rate Limit", message: "Rate limit exceeded" },
    {
      code: 500,
      description: "Internal Server Error",
      message: "Server error 500",
    },
    { code: 502, description: "Bad Gateway", message: "Server error 502" },
    {
      code: 503,
      description: "Service Unavailable",
      message: "Server error 503",
    },
    { code: 504, description: "Gateway Timeout", message: "Server error 504" },
  ])("should mark $code ($description) errors as retryable", ({ code, message }) => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code,
        location: "Gateway",
        message,
        request_id: `error-${String(code)}`,
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.statusCode).toBe(code);
      expect(result.isRetryable).toBe(true);
    }
  });

  it.each([
    {
      code: 401,
      description: "Unauthorized",
      message: "Unauthorized",
      messageContains: "Authentication failed",
    },
    {
      code: 403,
      description: "Forbidden",
      message: "Forbidden",
      messageContains: "Authentication failed",
    },
  ])(
    "should convert $code ($description) errors to LoadAPIKeyError",
    ({ code, message, messageContains }) => {
      const errorResponse: OrchestrationErrorResponse = {
        error: {
          code,
          location: "Auth",
          message,
          request_id: `error-${String(code)}`,
        },
      };

      const result = convertSAPErrorToAPICallError(errorResponse);

      expect(result).toBeInstanceOf(LoadAPIKeyError);
      expect(result.message).toContain(messageContains);
      expect(result.message).toContain("AICORE_SERVICE_KEY");
    },
  );

  it("should convert 404 errors to NoSuchModelError", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code: 404,
        location: "Deployment",
        message: "Model deployment-abc-123 not found",
        request_id: "error-404",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(NoSuchModelError);
    expect(result.message).toContain("Resource not found");
    if (result instanceof NoSuchModelError) {
      expect(result.modelId).toBe("deployment-abc-123");
      expect(result.modelType).toBe("languageModel");
    }
  });

  it("should preserve SAP metadata in responseBody", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code: 500,
        location: "Test Module",
        message: "Test error",
        request_id: "metadata-test-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.responseBody).toBeDefined();
      if (result.responseBody) {
        const body = JSON.parse(result.responseBody) as {
          error: {
            code: number;
            location: string;
            message: string;
            request_id: string;
          };
        };
        expect(body.error.message).toBe("Test error");
        expect(body.error.code).toBe(500);
        expect(body.error.location).toBe("Test Module");
        expect(body.error.request_id).toBe("metadata-test-123");
      }
    }
  });

  it("should add context URL to error", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code: 500,
        location: "Module",
        message: "Test error",
        request_id: "url-test-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse, {
      url: "https://api.sap.com/v1/chat",
    });

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.url).toBe("https://api.sap.com/v1/chat");
    }
  });

  it("should preserve response headers when provided", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code: 500,
        location: "Module",
        message: "Test error",
        request_id: "headers-test-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse, {
      responseHeaders: {
        "x-request-id": "headers-test-123",
      },
      url: "https://api.sap.com/v1/chat",
    });

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.responseHeaders).toEqual({
        "x-request-id": "headers-test-123",
      });
    }
  });

  it("should include request body in context", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code: 500,
        location: "Module",
        message: "Test error",
        request_id: "body-test-123",
      },
    };

    const requestBody = { prompt: "test prompt" };
    const result = convertSAPErrorToAPICallError(errorResponse, {
      requestBody,
    });

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.requestBodyValues).toEqual(requestBody);
    }
  });

  it("should add request ID to error message", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code: 500,
        location: "Module",
        message: "Test error",
        request_id: "message-test-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.message).toContain("Request ID: message-test-123");
  });
});

describe("convertToAISDKError", () => {
  it("should return APICallError as-is if already an APICallError", () => {
    const apiError = new APICallError({
      message: "Test error",
      requestBodyValues: {},
      statusCode: 500,
      url: "https://test.com",
    });

    const result = convertToAISDKError(apiError);

    expect(result).toBe(apiError);
  });

  it("should return LoadAPIKeyError as-is if already a LoadAPIKeyError", () => {
    const keyError = new LoadAPIKeyError({ message: "API key error" });

    const result = convertToAISDKError(keyError);

    expect(result).toBe(keyError);
  });

  it("should convert OrchestrationErrorResponse", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code: 500,
        location: "Module",
        message: "Orchestration error",
        request_id: "conversion-test-123",
      },
    };

    const result = convertToAISDKError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("Orchestration error");
  });

  it.each([
    {
      errorObject: { error: { message: 123 } },
      expectsUnknown: false,
      testName: "arbitrary objects with 'error' property",
    },
    {
      errorObject: { error: ["not an object", "also not an object"] },
      expectsUnknown: true,
      testName: "error array with non-object entries",
    },
    {
      errorObject: { error: [null, { message: "valid" }] },
      expectsUnknown: false,
      testName: "error array with null entries",
    },
    {
      errorObject: { error: [{ code: 400, location: "Module" }] },
      expectsUnknown: false,
      testName: "error array with entries missing message",
    },
    {
      errorObject: { error: [{ message: { nested: "object" } }] },
      expectsUnknown: false,
      testName: "error array with non-string message",
    },
  ])("should not treat $testName as orchestration errors", ({ errorObject, expectsUnknown }) => {
    const result = convertToAISDKError(errorObject);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).statusCode).toBe(500);
    if (expectsUnknown) {
      expect(result.message).toContain("Unknown error occurred");
    }
  });

  it("should convert authentication errors to LoadAPIKeyError", () => {
    const authError = new Error("Authentication failed for AICORE_SERVICE_KEY");

    const result = convertToAISDKError(authError);

    expect(result).toBeInstanceOf(LoadAPIKeyError);
    expect(result.message).toContain("SAP AI Core authentication failed");
  });

  it("should detect unauthorized errors", () => {
    const unauthorizedError = new Error("Request unauthorized");

    const result = convertToAISDKError(unauthorizedError);

    expect(result).toBeInstanceOf(LoadAPIKeyError);
  });

  it("should convert network errors to retryable APICallError", () => {
    const networkError = new Error("ECONNREFUSED: Connection refused");

    const result = convertToAISDKError(networkError);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).isRetryable).toBe(true);
    expect((result as APICallError).statusCode).toBe(503);
    expect(result.message).toContain("Network error");
  });

  it("should convert timeout errors to retryable APICallError", () => {
    const timeoutError = new Error("Request timeout exceeded");

    const result = convertToAISDKError(timeoutError);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).isRetryable).toBe(true);
    expect((result as APICallError).statusCode).toBe(503);
  });

  it("should convert ENOTFOUND errors to retryable APICallError", () => {
    const dnsError = new Error("getaddrinfo ENOTFOUND api.sap.com");

    const result = convertToAISDKError(dnsError);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).isRetryable).toBe(true);
  });

  it("should convert generic errors to non-retryable APICallError", () => {
    const genericError = new Error("Something went wrong");

    const result = convertToAISDKError(genericError);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).isRetryable).toBe(false);
    expect((result as APICallError).statusCode).toBe(500);
  });

  it("should handle string errors", () => {
    const stringError = "An error occurred";

    const result = convertToAISDKError(stringError);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("An error occurred");
  });

  it("should handle unknown error types", () => {
    const unknownError = { weird: "object" };

    const result = convertToAISDKError(unknownError);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("Unknown error occurred");
  });

  it("should add operation context to error message", () => {
    const error = new Error("Test error");

    const result = convertToAISDKError(error, { operation: "doGenerate" });

    expect(result.message).toContain("doGenerate");
  });

  it("should pass through context URL and requestBody", () => {
    const error = new Error("Test error");
    const context = {
      operation: "doStream",
      requestBody: { test: "data" },
      url: "https://api.sap.com",
    };

    const result = convertToAISDKError(error, context) as APICallError;

    expect(result.url).toBe("https://api.sap.com");
    expect(result.requestBodyValues).toEqual({ test: "data" });
  });

  it("should preserve response headers from context", () => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: Record<string, string> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      headers: {
        "x-request-id": "axios-123",
      },
    };

    const result = convertToAISDKError(axiosError, {
      operation: "doGenerate",
      responseHeaders: {
        "x-request-id": "axios-123",
      },
      url: "sap-ai:orchestration",
    }) as APICallError;

    expect(result.responseHeaders).toEqual({
      "x-request-id": "axios-123",
    });
  });

  it.each([
    { description: "null", value: null },
    { description: "undefined", value: undefined },
    { description: "number", value: 42 },
  ])("should handle error with $description value", ({ value }) => {
    const result = convertToAISDKError(value);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("Unknown error occurred");
  });

  it("should detect invalid credentials error", () => {
    const error = new Error("Invalid credentials provided");

    const result = convertToAISDKError(error);

    expect(result).toBeInstanceOf(LoadAPIKeyError);
  });

  it("should handle network error with mixed case", () => {
    const error = new Error("NETWORK connection failed");

    const result = convertToAISDKError(error);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).isRetryable).toBe(true);
    expect((result as APICallError).statusCode).toBe(503);
  });

  it("should handle error without operation context", () => {
    const error = new Error("Simple error");

    const result = convertToAISDKError(error);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("SAP AI Core error:");
    expect(result.message).not.toContain("undefined");
  });

  it("should handle error without code (defaults to 500)", () => {
    // Cast to unknown first to simulate malformed API response
    const errorResponse = {
      error: {
        location: "Unknown",
        message: "Unknown error",
        request_id: "unknown-123",
      },
    } as unknown as OrchestrationErrorResponse;

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.statusCode).toBe(500);
      expect(result.isRetryable).toBe(true);
    }
  });

  it("should handle error without location", () => {
    // Cast to unknown first to simulate malformed API response
    const errorResponse = {
      error: {
        code: 400,
        message: "Error without location",
        request_id: "no-loc-123",
      },
    } as unknown as OrchestrationErrorResponse;

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.statusCode).toBe(400);
    }
    expect(result.message).not.toContain("Error location:");
  });

  it("should handle error without request_id", () => {
    // Cast to unknown first to simulate malformed API response
    const errorResponse = {
      error: {
        code: 400,
        location: "Module",
        message: "Error without request ID",
      },
    } as unknown as OrchestrationErrorResponse;

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.statusCode).toBe(400);
    }
    expect(result.message).not.toContain("Request ID:");
  });

  it("should include location in error message for 4xx errors", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        code: 400,
        location: "Input Validation",
        message: "Bad request",
        request_id: "validation-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.message).toContain("Error location: Input Validation");
  });

  it("should handle error list with multiple entries (uses first)", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: [
        {
          code: 400,
          location: "First Module",
          message: "First error in list",
          request_id: "first-123",
        },
        {
          code: 500,
          location: "Second Module",
          message: "Second error in list",
          request_id: "second-456",
        },
      ],
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.message).toContain("First error in list");
    expect(result).toBeInstanceOf(APICallError);
    if (result instanceof APICallError) {
      expect(result.statusCode).toBe(400);
    }
  });

  it("should return undefined when error property is explicitly undefined", () => {
    const malformed = { error: undefined } as unknown;

    const result = convertToAISDKError(malformed);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("Unknown error occurred");
  });

  it.each([
    {
      description: "normalize array header values by joining with semicolon",
      expected: { "x-multi-value": "value1; value2; value3" },
      headers: { "x-multi-value": ["value1", "value2", "value3"] },
    },
    {
      description: "filter non-string values from array headers",
      expected: { "x-mixed": "valid; also-valid" },
      headers: { "x-mixed": ["valid", 123, null, "also-valid"] },
    },
    {
      description: "exclude array headers with only non-string items",
      expected: { "x-valid": "keep-this" },
      headers: {
        "x-invalid-array": [123, null, undefined],
        "x-valid": "keep-this",
      },
    },
    {
      description: "convert number header values to strings",
      expected: { "content-length": "1024", "x-numeric": "42" },
      headers: { "content-length": 1024, "x-numeric": 42 },
    },
    {
      description: "convert boolean header values to strings",
      expected: { "x-disabled": "false", "x-enabled": "true" },
      headers: { "x-disabled": false, "x-enabled": true },
    },
    {
      description: "skip object and unsupported header value types",
      expected: { "x-valid": "valid-value" },
      headers: { "x-object": { nested: "object" }, "x-valid": "valid-value" },
    },
  ])("should $description from axios errors", ({ expected, headers }) => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: Record<string, unknown> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = { headers };

    const result = convertToAISDKError(axiosError) as APICallError;

    expect(result.responseHeaders).toEqual(expected);
  });

  it("should return undefined when all axios header values are unsupported types", () => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: Record<string, unknown> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      headers: {
        "x-object": { nested: "object" },
      },
    };

    const result = convertToAISDKError(axiosError) as APICallError;

    expect(result.responseHeaders).toBeUndefined();
  });

  it("should return undefined for null axios headers", () => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: null };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      headers: null,
    };

    const result = convertToAISDKError(axiosError) as APICallError;

    expect(result.responseHeaders).toBeUndefined();
  });

  it("should return undefined when rootCause is not an object", () => {
    const primitiveError = "just a string error";

    const result = convertToAISDKError(primitiveError) as APICallError;

    expect(result.responseHeaders).toBeUndefined();
  });
});

describe("SSE Error Handling", () => {
  it("should extract SAP error from SSE message (wrapped format)", () => {
    const sapError = {
      error: {
        code: 429,
        location: "Rate Limiter",
        message: "Too many requests",
        request_id: "sse-error-123",
      },
    };

    const error = new Error(`Error received from the server.\\n${JSON.stringify(sapError)}`);
    const result = convertToAISDKError(error) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(429);
    expect(result.message).toContain("Too many requests");
    expect(result.isRetryable).toBe(true);

    const responseBody = JSON.parse(result.responseBody ?? "{}") as ParsedResponseBody;
    expect(responseBody.error.request_id).toBe("sse-error-123");
  });

  it("should extract SAP error from SSE message (direct format)", () => {
    // Direct format: {"code":...} without "error" wrapper
    const sapErrorDirect = {
      code: 503,
      message: "Service unavailable",
      request_id: "sse-direct-123",
    };

    const error = new Error(`Error received from the server.\\n${JSON.stringify(sapErrorDirect)}`);
    const result = convertToAISDKError(error) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(503);
    expect(result.isRetryable).toBe(true);
  });

  it("should extract SAP error from ErrorWithCause rootCause", () => {
    const sapError = {
      error: { code: 500, message: "Model overloaded", request_id: "wrapped-123" },
    };

    const innerError = new Error(`Error received from the server.\n${JSON.stringify(sapError)}`);
    const wrappedError = new Error("Error while iterating over SSE stream.");
    Object.defineProperty(wrappedError, "name", { value: "ErrorWithCause" });
    Object.defineProperty(wrappedError, "rootCause", { get: () => innerError });

    const result = convertToAISDKError(wrappedError) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(500);
    const responseBody = JSON.parse(result.responseBody ?? "{}") as ParsedResponseBody;
    expect(responseBody.error.request_id).toBe("wrapped-123");
  });

  it("should handle SSE stream errors without JSON", () => {
    const innerError = new Error("Could not parse message into JSON");
    const wrappedError = new Error("Error while iterating over SSE stream.");
    Object.defineProperty(wrappedError, "name", { value: "ErrorWithCause" });
    Object.defineProperty(wrappedError, "rootCause", { get: () => innerError });

    const result = convertToAISDKError(wrappedError) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("streaming error");
    expect(result.isRetryable).toBe(true);
  });

  it("should handle malformed JSON gracefully", () => {
    const error = new Error("Error received from the server.\n{invalid json}");
    const result = convertToAISDKError(error) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(500);
  });

  it("should traverse nested ErrorWithCause chain", () => {
    const rootError = new Error("Network timeout");
    const middleError = new Error("HTTP request failed");
    Object.defineProperty(middleError, "name", { value: "ErrorWithCause" });
    const topError = new Error("SSE stream error");
    Object.defineProperty(topError, "name", { value: "ErrorWithCause" });
    Object.defineProperty(topError, "rootCause", { get: () => rootError });

    const result = convertToAISDKError(topError) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("Network timeout");
  });
});

describe("SDK-specific Error Handling", () => {
  it("should handle destination resolution errors", () => {
    const error = new Error("Could not resolve destination.");

    const result = convertToAISDKError(error) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(500);
    expect(result.message).toContain("destination");
  });

  it("should handle deployment resolution errors", () => {
    const error = new Error("Failed to resolve deployment: d123abc");

    const result = convertToAISDKError(error);

    expect(result).toBeInstanceOf(NoSuchModelError);
    expect(result.message).toContain("deployment");
    if (result instanceof NoSuchModelError) {
      expect(result.modelId).toBe("d123abc");
      expect(result.modelType).toBe("languageModel");
    }
  });

  it("should handle content filtering errors", () => {
    const error = new Error("Content was filtered by the output filter.");

    const result = convertToAISDKError(error) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(400);
    expect(result.isRetryable).toBe(false);
  });

  it("should extract status code from error message", () => {
    const error = new Error("Request failed with status code 429.");

    const result = convertToAISDKError(error) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(429);
    expect(result.isRetryable).toBe(true);
  });

  it("should handle ErrorWithCause chain with network error as root", () => {
    const networkError = new Error("getaddrinfo ENOTFOUND api.ai.sap.com");
    const outerError = new Error("Failed to fetch deployments");
    Object.defineProperty(outerError, "name", { value: "ErrorWithCause" });
    Object.defineProperty(outerError, "rootCause", { get: () => networkError });

    const result = convertToAISDKError(outerError) as APICallError;

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(503);
    expect(result.isRetryable).toBe(true);
  });
});
