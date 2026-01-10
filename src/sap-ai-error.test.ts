import { describe, it, expect } from "vitest";
import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";
import type { OrchestrationErrorResponse } from "@sap-ai-sdk/orchestration";
import {
  convertSAPErrorToAPICallError,
  convertToAISDKError,
} from "./sap-ai-error";

describe("convertSAPErrorToAPICallError", () => {
  it("should convert SAP error with single error object", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Test error message",
        code: 500,
        location: "LLM Module",
        request_id: "test-request-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(500);
    expect(result.message).toContain("Test error message");
    expect(result.isRetryable).toBe(true);
  });

  it("should convert SAP error with error list (array)", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: [
        {
          message: "First error",
          code: 400,
          location: "Input Module",
          request_id: "test-request-456",
        },
      ],
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain("First error");
  });

  it("should mark 429 errors as retryable", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Rate limit exceeded",
        code: 429,
        location: "API Gateway",
        request_id: "rate-limit-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.statusCode).toBe(429);
    expect(result.isRetryable).toBe(true);
    expect(result.message).toContain("Rate limit exceeded");
  });

  it("should mark 5xx errors as retryable", () => {
    const serverErrorCodes = [500, 502, 503, 504];

    for (const code of serverErrorCodes) {
      const errorResponse: OrchestrationErrorResponse = {
        error: {
          message: `Server error ${String(code)}`,
          code,
          location: "Gateway",
          request_id: `error-${String(code)}`,
        },
      };

      const result = convertSAPErrorToAPICallError(errorResponse);

      expect(
        result.statusCode,
        `${String(code)} should have correct status`,
      ).toBe(code);
      expect(result.isRetryable, `${String(code)} should be retryable`).toBe(
        true,
      );
    }
  });

  it("should NOT mark 401 errors as retryable", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Unauthorized",
        code: 401,
        location: "Auth",
        request_id: "auth-error-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.statusCode).toBe(401);
    expect(result.isRetryable).toBe(false);
    expect(result.message).toContain("Authentication failed");
  });

  it("should NOT mark 404 errors as retryable", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Model not found",
        code: 404,
        location: "LLM Module",
        request_id: "not-found-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.statusCode).toBe(404);
    expect(result.isRetryable).toBe(false);
    expect(result.message).toContain("Resource not found");
  });

  it("should preserve SAP metadata in responseBody", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Test error",
        code: 500,
        location: "Test Module",
        request_id: "metadata-test-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.responseBody).toBeDefined();
    if (result.responseBody) {
      const body = JSON.parse(result.responseBody) as {
        error: {
          message: string;
          code: number;
          location: string;
          request_id: string;
        };
      };
      expect(body.error.message).toBe("Test error");
      expect(body.error.code).toBe(500);
      expect(body.error.location).toBe("Test Module");
      expect(body.error.request_id).toBe("metadata-test-123");
    }
  });

  it("should add context URL to error", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Test error",
        code: 500,
        location: "Module",
        request_id: "url-test-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse, {
      url: "https://api.sap.com/v1/chat",
    });

    expect(result.url).toBe("https://api.sap.com/v1/chat");
  });

  it("should preserve response headers when provided", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Test error",
        code: 500,
        location: "Module",
        request_id: "headers-test-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse, {
      url: "https://api.sap.com/v1/chat",
      responseHeaders: {
        "x-request-id": "headers-test-123",
      },
    });

    expect(result.responseHeaders).toEqual({
      "x-request-id": "headers-test-123",
    });
  });

  it("should include request body in context", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Test error",
        code: 500,
        location: "Module",
        request_id: "body-test-123",
      },
    };

    const requestBody = { prompt: "test prompt" };
    const result = convertSAPErrorToAPICallError(errorResponse, {
      requestBody,
    });

    expect(result.requestBodyValues).toEqual(requestBody);
  });

  it("should add request ID to error message", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Test error",
        code: 500,
        location: "Module",
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
      url: "https://test.com",
      requestBodyValues: {},
      statusCode: 500,
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
        message: "Orchestration error",
        code: 500,
        location: "Module",
        request_id: "conversion-test-123",
      },
    };

    const result = convertToAISDKError(errorResponse);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("Orchestration error");
  });

  it("should not treat arbitrary objects with 'error' property as orchestration errors", () => {
    const notAnOrchestrationError = {
      error: { message: 123 },
    };

    const result = convertToAISDKError(notAnOrchestrationError);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).statusCode).toBe(500);
  });

  it("should not treat error array with non-object entries as orchestration errors", () => {
    const malformedErrorArray = {
      error: ["not an object", "also not an object"],
    };

    const result = convertToAISDKError(malformedErrorArray);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).statusCode).toBe(500);
    expect(result.message).toContain("Unknown error occurred");
  });

  it("should not treat error array with null entries as orchestration errors", () => {
    const malformedErrorArray = {
      error: [null, { message: "valid" }],
    };

    const result = convertToAISDKError(malformedErrorArray);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).statusCode).toBe(500);
  });

  it("should not treat error array with entries missing message as orchestration errors", () => {
    const malformedErrorArray = {
      error: [{ code: 400, location: "Module" }],
    };

    const result = convertToAISDKError(malformedErrorArray);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).statusCode).toBe(500);
  });

  it("should not treat error array with non-string message as orchestration errors", () => {
    const malformedErrorArray = {
      error: [{ message: { nested: "object" } }],
    };

    const result = convertToAISDKError(malformedErrorArray);

    expect(result).toBeInstanceOf(APICallError);
    expect((result as APICallError).statusCode).toBe(500);
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
      url: "https://api.sap.com",
      requestBody: { test: "data" },
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
      url: "sap-ai:orchestration",
      operation: "doGenerate",
      responseHeaders: {
        "x-request-id": "axios-123",
      },
    }) as APICallError;

    expect(result.responseHeaders).toEqual({
      "x-request-id": "axios-123",
    });
  });

  it("should handle error with null value", () => {
    const result = convertToAISDKError(null);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("Unknown error occurred");
  });

  it("should handle error with undefined value", () => {
    const result = convertToAISDKError(undefined);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("Unknown error occurred");
  });

  it("should handle error with number value", () => {
    const result = convertToAISDKError(42);

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

  it("should handle 403 forbidden errors as non-retryable with auth hint", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Forbidden",
        code: 403,
        location: "Auth",
        request_id: "forbidden-123",
      },
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.statusCode).toBe(403);
    expect(result.isRetryable).toBe(false);
    expect(result.message).toContain("Authentication failed");
  });

  it("should handle error without code (defaults to 500)", () => {
    // Cast to unknown first to simulate malformed API response
    const errorResponse = {
      error: {
        message: "Unknown error",
        location: "Unknown",
        request_id: "unknown-123",
      },
    } as unknown as OrchestrationErrorResponse;

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.statusCode).toBe(500);
    expect(result.isRetryable).toBe(true);
  });

  it("should handle error without location", () => {
    // Cast to unknown first to simulate malformed API response
    const errorResponse = {
      error: {
        message: "Error without location",
        code: 400,
        request_id: "no-loc-123",
      },
    } as unknown as OrchestrationErrorResponse;

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.statusCode).toBe(400);
    expect(result.message).not.toContain("Error location:");
  });

  it("should handle error without request_id", () => {
    // Cast to unknown first to simulate malformed API response
    const errorResponse = {
      error: {
        message: "Error without request ID",
        code: 400,
        location: "Module",
      },
    } as unknown as OrchestrationErrorResponse;

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.statusCode).toBe(400);
    expect(result.message).not.toContain("Request ID:");
  });

  it("should include location in error message for 4xx errors", () => {
    const errorResponse: OrchestrationErrorResponse = {
      error: {
        message: "Bad request",
        code: 400,
        location: "Input Validation",
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
          message: "First error in list",
          code: 400,
          location: "First Module",
          request_id: "first-123",
        },
        {
          message: "Second error in list",
          code: 500,
          location: "Second Module",
          request_id: "second-456",
        },
      ],
    };

    const result = convertSAPErrorToAPICallError(errorResponse);

    expect(result.message).toContain("First error in list");
    expect(result.statusCode).toBe(400);
  });

  it("should return undefined when error property is explicitly undefined", () => {
    const malformed = { error: undefined } as unknown;

    const result = convertToAISDKError(malformed);

    expect(result).toBeInstanceOf(APICallError);
    expect(result.message).toContain("Unknown error occurred");
  });

  it("should normalize array header values from axios errors by joining with comma", () => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: Record<string, unknown> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      headers: {
        "x-multi-value": ["value1", "value2", "value3"],
      },
    };

    const result = convertToAISDKError(axiosError) as APICallError;

    expect(result.responseHeaders).toEqual({
      "x-multi-value": "value1,value2,value3",
    });
  });

  it("should filter non-string values from array headers in axios errors", () => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: Record<string, unknown> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      headers: {
        "x-mixed": ["valid", 123, null, "also-valid"],
      },
    };

    const result = convertToAISDKError(axiosError) as APICallError;

    expect(result.responseHeaders).toEqual({
      "x-mixed": "valid,also-valid",
    });
  });

  it("should exclude array headers with only non-string items from axios errors", () => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: Record<string, unknown> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      headers: {
        "x-valid": "keep-this",
        "x-invalid-array": [123, null, undefined],
      },
    };

    const result = convertToAISDKError(axiosError) as APICallError;

    expect(result.responseHeaders).toEqual({
      "x-valid": "keep-this",
    });
  });

  it("should convert number header values to strings from axios errors", () => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: Record<string, unknown> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      headers: {
        "x-numeric": 42,
        "content-length": 1024,
      },
    };

    const result = convertToAISDKError(axiosError) as APICallError;

    expect(result.responseHeaders).toEqual({
      "x-numeric": "42",
      "content-length": "1024",
    });
  });

  it("should convert boolean header values to strings from axios errors", () => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: Record<string, unknown> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      headers: {
        "x-enabled": true,
        "x-disabled": false,
      },
    };

    const result = convertToAISDKError(axiosError) as APICallError;

    expect(result.responseHeaders).toEqual({
      "x-enabled": "true",
      "x-disabled": "false",
    });
  });

  it("should skip object and unsupported header value types from axios errors", () => {
    const axiosError = new Error("Request failed") as unknown as {
      isAxiosError: boolean;
      response: { headers: Record<string, unknown> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = {
      headers: {
        "x-valid": "valid-value",
        "x-object": { nested: "object" },
      },
    };

    const result = convertToAISDKError(axiosError) as APICallError;

    expect(result.responseHeaders).toEqual({
      "x-valid": "valid-value",
    });
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
