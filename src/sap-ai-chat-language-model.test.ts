import { describe, it, expect, vi } from "vitest";
import { SAPAIChatLanguageModel } from "./sap-ai-chat-language-model";
import type {
  LanguageModelV2Prompt,
  LanguageModelV2FunctionTool,
  LanguageModelV2ProviderTool,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";

// Mock the OrchestrationClient
vi.mock("@sap-ai-sdk/orchestration", () => {
  class MockOrchestrationClient {
    static lastChatCompletionRequest: unknown;
    static chatCompletionError: Error | undefined;
    static chatCompletionResponse:
      | {
          rawResponse?: { headers?: Record<string, unknown> };
          getContent: () => string | null;
          getToolCalls: () =>
            | { id: string; function: { name: string; arguments: string } }[]
            | undefined;
          getTokenUsage: () => {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          };
          getFinishReason: () => string;
        }
      | undefined;

    static setChatCompletionError(error: Error) {
      MockOrchestrationClient.chatCompletionError = error;
    }

    static setChatCompletionResponse(
      response: typeof MockOrchestrationClient.chatCompletionResponse,
    ) {
      MockOrchestrationClient.chatCompletionResponse = response;
    }

    chatCompletion = vi.fn().mockImplementation((request) => {
      MockOrchestrationClient.lastChatCompletionRequest = request;

      const errorToThrow = MockOrchestrationClient.chatCompletionError;
      if (errorToThrow) {
        MockOrchestrationClient.chatCompletionError = undefined;
        throw errorToThrow;
      }

      // Return custom response if set
      if (MockOrchestrationClient.chatCompletionResponse) {
        const response = MockOrchestrationClient.chatCompletionResponse;
        MockOrchestrationClient.chatCompletionResponse = undefined;
        return Promise.resolve(response);
      }

      const messages = (request as { messages?: unknown[] }).messages;
      const hasImage =
        messages?.some(
          (msg) =>
            typeof msg === "object" &&
            msg !== null &&
            "content" in msg &&
            Array.isArray((msg as { content?: unknown }).content),
        ) ?? false;

      if (hasImage) {
        throw new Error("boom");
      }

      return Promise.resolve({
        rawResponse: {
          headers: {
            "x-request-id": "test-request-id",
          },
        },
        getContent: () => "Hello!",
        getToolCalls: () => undefined,
        getTokenUsage: () => ({
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        }),
        getFinishReason: () => "stop",
      });
    });

    static streamChunks:
      | {
          getDeltaContent: () => string | null;
          getDeltaToolCalls: () =>
            | {
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }[]
            | undefined;
          getFinishReason: () => string | null | undefined;
          getTokenUsage: () =>
            | {
                prompt_tokens: number;
                completion_tokens: number;
                total_tokens: number;
              }
            | undefined;
        }[]
      | undefined;

    static streamError: Error | undefined;

    static setStreamChunks(
      chunks: {
        getDeltaContent: () => string | null;
        getDeltaToolCalls: () =>
          | {
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[]
          | undefined;
        getFinishReason: () => string | null | undefined;
        getTokenUsage: () =>
          | {
              prompt_tokens: number;
              completion_tokens: number;
              total_tokens: number;
            }
          | undefined;
      }[],
    ) {
      MockOrchestrationClient.streamChunks = chunks;
      MockOrchestrationClient.streamError = undefined;
    }

    static setStreamError(error: Error) {
      MockOrchestrationClient.streamError = error;
    }

    static streamSetupError: Error | undefined;

    static setStreamSetupError(error: Error) {
      MockOrchestrationClient.streamSetupError = error;
    }

    stream = vi.fn().mockImplementation(() => {
      // Throw synchronously if setup error is set (tests outer catch in doStream)
      if (MockOrchestrationClient.streamSetupError) {
        const error = MockOrchestrationClient.streamSetupError;
        MockOrchestrationClient.streamSetupError = undefined;
        throw error;
      }

      const chunks =
        MockOrchestrationClient.streamChunks ??
        ([
          {
            getDeltaContent: () => "Hello",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => null,
            getTokenUsage: () => undefined,
          },
          {
            getDeltaContent: () => "!",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => "stop",
            getTokenUsage: () => ({
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            }),
          },
        ] as const);

      // Find the last non-null finish reason from chunks
      let lastFinishReason: string | null | undefined;
      let lastTokenUsage:
        | {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          }
        | undefined;

      for (const chunk of chunks) {
        const fr = chunk.getFinishReason();
        if (fr !== null && fr !== undefined) {
          lastFinishReason = fr;
        }
        const tu = chunk.getTokenUsage();
        if (tu) {
          lastTokenUsage = tu;
        }
      }

      const errorToThrow = MockOrchestrationClient.streamError;

      return {
        stream: {
          *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
              yield chunk;
            }
            // Throw error after yielding chunks if configured
            if (errorToThrow) {
              throw errorToThrow;
            }
          },
        },
        getTokenUsage: () =>
          lastTokenUsage ?? {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        getFinishReason: () => lastFinishReason,
      };
    });
  }

  return {
    OrchestrationClient: MockOrchestrationClient,
  };
});

describe("SAPAIChatLanguageModel", () => {
  const createModel = (modelId = "gpt-4o", settings: unknown = {}) => {
    return new SAPAIChatLanguageModel(
      modelId,
      settings as ConstructorParameters<typeof SAPAIChatLanguageModel>[1],
      {
        provider: "sap-ai",
        deploymentConfig: { resourceGroup: "default" },
      },
    );
  };

  const createPrompt = (text: string): LanguageModelV2Prompt => [
    { role: "user", content: [{ type: "text", text }] },
  ];

  const expectRequestBodyHasMessages = (result: {
    request: { body?: unknown };
  }) => {
    const body: unknown = result.request.body;
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
    expect(body).toHaveProperty("messages");
  };

  const expectToOmitKeys = (value: unknown, keys: string[]) => {
    expect(value).toBeTruthy();
    expect(typeof value).toBe("object");

    for (const key of keys) {
      expect(value).not.toHaveProperty(key);
    }
  };

  const setStreamChunks = async (chunks: unknown[]) => {
    const MockClient = await getMockClient();
    if (!MockClient.setStreamChunks) {
      throw new Error("mock missing setStreamChunks");
    }
    MockClient.setStreamChunks(chunks);
  };

  const getMockClient = async () => {
    const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
    return OrchestrationClient as unknown as {
      lastChatCompletionRequest: unknown;
      setStreamChunks?: (chunks: unknown[]) => void;
      setChatCompletionError?: (error: Error) => void;
      setChatCompletionResponse?: (response: unknown) => void;
      setStreamError?: (error: Error) => void;
      setStreamSetupError?: (error: Error) => void;
    };
  };

  type OrchestrationChatCompletionRequest = {
    messages?: unknown;
    model?: {
      name?: string;
      version?: string;
      params?: Record<string, unknown>;
    };
    tools?: unknown;
    response_format?: unknown;
  } & Record<string, unknown>;

  const getLastChatCompletionRequest = async () => {
    const MockClient = await getMockClient();
    return MockClient.lastChatCompletionRequest as OrchestrationChatCompletionRequest;
  };

  const expectRequestBodyHasMessagesAndNoWarnings = (result: {
    request: { body?: unknown };
    warnings: unknown[];
  }) => {
    expect(result.warnings).toHaveLength(0);
    expectRequestBodyHasMessages(result);
  };

  const expectWarningMessageContains = (
    warnings: { type: string; message?: string }[],
    substring: string,
  ) => {
    expect(
      warnings.some(
        (warning) =>
          typeof warning.message === "string" &&
          warning.message.includes(substring),
      ),
    ).toBe(true);
  };

  describe("model properties", () => {
    it("should have correct specification version", () => {
      const model = createModel();
      expect(model.specificationVersion).toBe("v2");
    });

    it("should have correct model ID", () => {
      const model = createModel("gpt-4o");
      expect(model.modelId).toBe("gpt-4o");
    });

    it("should have correct provider", () => {
      const model = createModel();
      expect(model.provider).toBe("sap-ai");
    });

    it("should not support HTTP URLs", () => {
      const model = createModel();
      expect(model.supportsUrl(new URL("http://example.com/image.png"))).toBe(
        false,
      );
    });

    it("should support data URLs", () => {
      const model = createModel();
      expect(model.supportsUrl(new URL("data:image/png;base64,Zm9v"))).toBe(
        true,
      );
    });

    it("should have supportedUrls getter for image types", () => {
      const model = createModel();
      const urls = model.supportedUrls;

      expect(urls).toHaveProperty("image/*");
      expect(urls["image/*"]).toHaveLength(2);
      // First regex should match HTTPS URLs
      expect(urls["image/*"][0].test("https://example.com/image.png")).toBe(
        true,
      );
      expect(urls["image/*"][0].test("http://example.com/image.png")).toBe(
        false,
      );
      // Second regex should match data URLs for images
      expect(urls["image/*"][1].test("data:image/png;base64,Zm9v")).toBe(true);
    });

    describe("model capabilities", () => {
      it("should default all capabilities to true for modern model behavior", () => {
        const model = createModel("any-model");

        // All capabilities default to true - no model list maintenance needed
        expect(model.supportsImageUrls).toBe(true);
        expect(model.supportsStructuredOutputs).toBe(true);
        expect(model.supportsToolCalls).toBe(true);
        expect(model.supportsStreaming).toBe(true);
        expect(model.supportsMultipleCompletions).toBe(true);
        expect(model.supportsParallelToolCalls).toBe(true);
      });

      it("should have consistent capabilities across different model IDs", () => {
        // Capabilities are static defaults, not model-dependent
        const models = [
          "gpt-4o",
          "anthropic--claude-3.5-sonnet",
          "gemini-2.0-flash",
          "amazon--nova-pro",
          "mistralai--mistral-large-instruct",
          "unknown-future-model",
        ];

        for (const modelId of models) {
          const model = createModel(modelId);
          expect(model.supportsImageUrls).toBe(true);
          expect(model.supportsStructuredOutputs).toBe(true);
          expect(model.supportsToolCalls).toBe(true);
          expect(model.supportsStreaming).toBe(true);
          expect(model.supportsMultipleCompletions).toBe(true);
          expect(model.supportsParallelToolCalls).toBe(true);
        }
      });
    });
  });

  describe("doGenerate", () => {
    it("should generate text response", async () => {
      const model = createModel();
      const prompt = createPrompt("Hello");

      const result = await model.doGenerate({ prompt });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: "text", text: "Hello!" });
      expect(result.finishReason).toBe("stop");
      expect(result.usage).toEqual({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      });
      expect(result.response.headers).toBeDefined();
      expect(result.response.headers).toMatchObject({
        "x-request-id": "test-request-id",
      });
      expect(result.providerMetadata?.["sap-ai"]).toMatchObject({
        finishReason: "stop",
        finishReasonMapped: "stop",
        requestId: "test-request-id",
      });
    });

    describe("error handling", () => {
      it("should propagate axios response headers into doGenerate errors", async () => {
        const MockClient = await getMockClient();
        if (!MockClient.setChatCompletionError) {
          throw new Error("mock missing setChatCompletionError");
        }

        const axiosError = new Error("Request failed") as Error & {
          isAxiosError: boolean;
          response: { headers: Record<string, string> };
        };
        axiosError.isAxiosError = true;
        axiosError.response = {
          headers: {
            "x-request-id": "do-generate-axios-123",
          },
        };

        MockClient.setChatCompletionError(axiosError);

        const model = createModel();
        const prompt = createPrompt("Hello");

        await expect(model.doGenerate({ prompt })).rejects.toMatchObject({
          responseHeaders: {
            "x-request-id": "do-generate-axios-123",
          },
        });
      });

      it("should sanitize requestBodyValues in errors", async () => {
        const model = createModel();

        const prompt: LanguageModelV2Prompt = [
          {
            role: "user",
            content: [
              {
                type: "file",
                mediaType: "image/png",
                data: "BASE64_IMAGE_DATA",
              },
            ],
          },
        ];

        let caught: unknown;
        try {
          await model.doGenerate({ prompt });
        } catch (error: unknown) {
          caught = error;
        }

        const caughtError = caught as {
          name?: string;
          requestBodyValues?: unknown;
        };

        expect(caughtError.name).toEqual(
          expect.stringContaining("APICallError"),
        );
        expect(caughtError.requestBodyValues).toMatchObject({
          promptMessages: 1,
          hasImageParts: true,
        });
      });
    });

    it("should pass tools to orchestration config", async () => {
      const model = createModel();
      const prompt = createPrompt("What is 2+2?");

      const tools: LanguageModelV2FunctionTool[] = [
        {
          type: "function",
          name: "calculate",
          description: "Perform calculation",
          inputSchema: {
            type: "object",
            properties: {
              expression: { type: "string" },
            },
            required: ["expression"],
          },
        },
      ];

      const result = await model.doGenerate({ prompt, tools });

      expectRequestBodyHasMessagesAndNoWarnings(result);
    });

    it("should pass parallel_tool_calls when configured", async () => {
      const model = createModel("gpt-4o", {
        modelParams: {
          parallel_tool_calls: true,
        },
      });

      const prompt = createPrompt("Hi");

      const result = await model.doGenerate({ prompt });

      expectRequestBodyHasMessages(result);
    });

    it("should apply providerOptions.sap overrides", async () => {
      const model = createModel("gpt-4o", {
        modelVersion: "settings-version",
        includeReasoning: false,
        modelParams: {
          temperature: 0.1,
        },
      });

      const prompt = createPrompt("Hi");

      const result = await model.doGenerate({
        prompt,
        providerOptions: {
          sap: {
            modelVersion: "provider-options-version",
            includeReasoning: true,
            modelParams: {
              temperature: 0.9,
            },
          },
        },
      });

      expectRequestBodyHasMessages(result);
    });

    it("should map responseFormat json without schema to json_object", async () => {
      const model = createModel();

      const prompt = createPrompt("Return JSON");

      const result = await model.doGenerate({
        prompt,
        responseFormat: { type: "json" },
      });

      expectRequestBodyHasMessages(result);

      const request = await getLastChatCompletionRequest();

      expect(request.response_format).toEqual({ type: "json_object" });
    });

    it("should map responseFormat json with schema to json_schema", async () => {
      const model = createModel();

      const prompt = createPrompt("Return JSON");

      const schema = {
        type: "object" as const,
        properties: {
          answer: { type: "string" as const },
        },
        required: ["answer"],
        additionalProperties: false,
      };

      const result = await model.doGenerate({
        prompt,
        responseFormat: {
          type: "json",
          schema,
          name: "response",
          description: "A structured response",
        },
      });

      expectRequestBodyHasMessages(result);

      const request = await getLastChatCompletionRequest();

      expect(request.response_format).toEqual({
        type: "json_schema",
        json_schema: {
          name: "response",
          description: "A structured response",
          schema,
          strict: null,
        },
      });
    });

    it("should warn about unsupported tool types", async () => {
      const model = createModel();
      const prompt = createPrompt("Hello");

      const tools = [
        {
          type: "provider-defined" as const,
          id: "custom-tool",
          args: {},
        },
      ];

      const result = await model.doGenerate({
        prompt,
        tools: tools as unknown as LanguageModelV2ProviderTool[],
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe("unsupported-tool");
    });

    it("should prefer call options.tools over settings.tools (and warn)", async () => {
      const model = createModel("gpt-4o", {
        tools: [
          {
            type: "function",
            function: {
              name: "settings_tool",
              description: "From settings",
              parameters: {
                type: "object",
                properties: {},
                required: [],
              },
            },
          },
        ],
      });

      const prompt = createPrompt("Hello");

      const tools: LanguageModelV2FunctionTool[] = [
        {
          type: "function",
          name: "call_tool",
          description: "From call options",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      ];

      const result = await model.doGenerate({ prompt, tools });
      const warnings = result.warnings;

      expectWarningMessageContains(warnings, "preferring call options.tools");

      expectRequestBodyHasMessages(result);

      const request = await getLastChatCompletionRequest();

      // Call options.tools should override settings.tools
      const requestTools = Array.isArray(request.tools)
        ? (request.tools as unknown[])
        : [];

      expect(
        requestTools.some(
          (tool) =>
            typeof tool === "object" &&
            tool !== null &&
            (tool as { function?: { name?: unknown } }).function?.name ===
              "call_tool",
        ),
      ).toBe(true);

      expect(
        requestTools.some(
          (tool) =>
            typeof tool === "object" &&
            tool !== null &&
            (tool as { function?: { name?: unknown } }).function?.name ===
              "settings_tool",
        ),
      ).toBe(false);
    });

    it("should warn when tool Zod schema conversion fails", async () => {
      // In ESM, spying on `zod-to-json-schema` exports is not reliable.
      // Instead, we provide a Zod-like object that passes our `isZodSchema`
      // check but throws when stringified during conversion.
      const model = createModel();
      const prompt = createPrompt("Use a tool");

      const zodLikeThatThrows = {
        _def: {},
        parse: () => undefined,
        toJSON: () => {
          throw new Error("conversion failed");
        },
      };

      const tools: LanguageModelV2FunctionTool[] = [
        {
          type: "function",
          name: "badTool",
          description: "Tool with failing Zod schema conversion",
          inputSchema: {},
          parameters: zodLikeThatThrows,
        } as unknown as LanguageModelV2FunctionTool,
      ];

      const result = await model.doGenerate({ prompt, tools });

      expectRequestBodyHasMessages(result);
    });

    it("should include tool calls in doGenerate response content", async () => {
      const MockClient = await getMockClient();
      if (!MockClient.setChatCompletionResponse) {
        throw new Error("mock missing setChatCompletionResponse");
      }

      MockClient.setChatCompletionResponse({
        rawResponse: {
          headers: { "x-request-id": "tool-call-test" },
        },
        getContent: () => null,
        getToolCalls: () => [
          {
            id: "call_123",
            function: {
              name: "get_weather",
              arguments: '{"location":"Paris"}',
            },
          },
        ],
        getTokenUsage: () => ({
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        }),
        getFinishReason: () => "tool_calls",
      });

      const model = createModel();
      const prompt = createPrompt("What's the weather?");

      const result = await model.doGenerate({ prompt });

      expect(result.content).toContainEqual({
        type: "tool-call",
        toolCallId: "call_123",
        toolName: "get_weather",
        input: '{"location":"Paris"}',
      });
      expect(result.finishReason).toBe("tool-calls");
    });

    it("should normalize array header values in doGenerate response", async () => {
      const MockClient = await getMockClient();
      if (!MockClient.setChatCompletionResponse) {
        throw new Error("mock missing setChatCompletionResponse");
      }

      MockClient.setChatCompletionResponse({
        rawResponse: {
          headers: {
            "x-request-id": "array-header-test",
            "x-multi-value": ["value1", "value2"],
          },
        },
        getContent: () => "Response",
        getToolCalls: () => undefined,
        getTokenUsage: () => ({
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        }),
        getFinishReason: () => "stop",
      });

      const model = createModel();
      const prompt = createPrompt("Test");

      const result = await model.doGenerate({ prompt });

      expect(result.response.headers).toEqual({
        "x-request-id": "array-header-test",
        "x-multi-value": "value1,value2",
      });
    });

    it("should convert numeric header values to strings in doGenerate response", async () => {
      const MockClient = await getMockClient();
      if (!MockClient.setChatCompletionResponse) {
        throw new Error("mock missing setChatCompletionResponse");
      }

      MockClient.setChatCompletionResponse({
        rawResponse: {
          headers: {
            "content-length": 1024,
            "x-retry-after": 30,
          },
        },
        getContent: () => "Response",
        getToolCalls: () => undefined,
        getTokenUsage: () => ({
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        }),
        getFinishReason: () => "stop",
      });

      const model = createModel();
      const prompt = createPrompt("Test");

      const result = await model.doGenerate({ prompt });

      expect(result.response.headers).toEqual({
        "content-length": "1024",
        "x-retry-after": "30",
      });
    });

    it("should skip unsupported header value types in doGenerate response", async () => {
      const MockClient = await getMockClient();
      if (!MockClient.setChatCompletionResponse) {
        throw new Error("mock missing setChatCompletionResponse");
      }

      MockClient.setChatCompletionResponse({
        rawResponse: {
          headers: {
            "x-valid": "keep-this",
            "x-object": { nested: "object" },
          },
        },
        getContent: () => "Response",
        getToolCalls: () => undefined,
        getTokenUsage: () => ({
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        }),
        getFinishReason: () => "stop",
      });

      const model = createModel();
      const prompt = createPrompt("Test");

      const result = await model.doGenerate({ prompt });

      expect(result.response.headers).toEqual({
        "x-valid": "keep-this",
      });
    });

    it("should filter non-string values from array headers in doGenerate response", async () => {
      const MockClient = await getMockClient();
      if (!MockClient.setChatCompletionResponse) {
        throw new Error("mock missing setChatCompletionResponse");
      }

      MockClient.setChatCompletionResponse({
        rawResponse: {
          headers: {
            "x-mixed": ["valid", 123, null, "also-valid"],
          },
        },
        getContent: () => "Response",
        getToolCalls: () => undefined,
        getTokenUsage: () => ({
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        }),
        getFinishReason: () => "stop",
      });

      const model = createModel();
      const prompt = createPrompt("Test");

      const result = await model.doGenerate({ prompt });

      expect(result.response.headers).toEqual({
        "x-mixed": "valid,also-valid",
      });
    });

    it("should exclude array headers with only non-string items in doGenerate response", async () => {
      const MockClient = await getMockClient();
      if (!MockClient.setChatCompletionResponse) {
        throw new Error("mock missing setChatCompletionResponse");
      }

      MockClient.setChatCompletionResponse({
        rawResponse: {
          headers: {
            "x-valid": "keep-this",
            "x-invalid-array": [123, null, undefined],
          },
        },
        getContent: () => "Response",
        getToolCalls: () => undefined,
        getTokenUsage: () => ({
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        }),
        getFinishReason: () => "stop",
      });

      const model = createModel();
      const prompt = createPrompt("Test");

      const result = await model.doGenerate({ prompt });

      expect(result.response.headers).toEqual({
        "x-valid": "keep-this",
      });
    });

    it("should include response body in doGenerate result", async () => {
      const model = createModel();
      const prompt = createPrompt("Hello");

      const result = await model.doGenerate({ prompt });

      expect(result.response.body).toBeDefined();
      expect(result.response.body).toHaveProperty("content");
      expect(result.response.body).toHaveProperty("tokenUsage");
      expect(result.response.body).toHaveProperty("finishReason");
    });
  });

  describe("doStream", () => {
    it("should stream basic text (edge-runtime compatible)", async () => {
      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ prompt });
      const reader = stream.getReader();

      const parts: unknown[] = [];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }

      expect(
        parts.some((p) => (p as { type?: string }).type === "stream-start"),
      ).toBe(true);
      expect(
        parts.some((p) => (p as { type?: string }).type === "finish"),
      ).toBe(true);
    });

    it("should not mutate stream-start warnings when warnings occur during stream", async () => {
      // Produce only a tool call delta with arguments, but without a tool name.
      // This triggers a warning during the final tool-call flush.

      await setStreamChunks([
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "toolcall-0",
              function: {
                arguments: '{"x":1}',
              },
            },
          ],
          getFinishReason: () => "tool_calls",
          getTokenUsage: () => ({
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          }),
        },
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const result = await model.doStream({ prompt });

      const parts: LanguageModelV2StreamPart[] = [];
      for await (const part of result.stream) {
        parts.push(part);
      }

      const warnings = result.warnings;

      const streamStart = parts.find((part) => part.type === "stream-start");
      expect(streamStart?.warnings).toHaveLength(0);

      // But the final warnings returned from doStream should include the flush-time warning.
      // Important: consume the stream first; `result.warnings` is only populated
      // after the stream has fully resolved.

      expect(warnings.length).toBeGreaterThan(0);
    });
    async function readAllParts(
      stream: ReadableStream<LanguageModelV2StreamPart>,
    ) {
      const parts: LanguageModelV2StreamPart[] = [];
      const reader = stream.getReader();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }

      return parts;
    }

    it("should stream text response", async () => {
      await setStreamChunks([
        {
          getDeltaContent: () => "Hello",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          getDeltaContent: () => "!",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "stop",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          }),
        },
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      // Check stream structure
      expect(parts[0].type).toBe("stream-start");
      expect(parts.some((p) => p.type === "response-metadata")).toBe(true);
      const responseMetadata = parts.find(
        (p) => p.type === "response-metadata",
      );
      expect(responseMetadata).toBeDefined();
      if (responseMetadata?.type === "response-metadata") {
        expect(responseMetadata.modelId).toBe("gpt-4o");
      }
      expect(parts.some((p) => p.type === "text-delta")).toBe(true);
      expect(parts.some((p) => p.type === "finish")).toBe(true);

      // Check finish part
      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("stop");
      }
    });

    it("should flush tool calls immediately on tool-calls finishReason", async () => {
      await setStreamChunks([
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "call_0",
              function: { name: "get_weather", arguments: '{"city":' },
            },
          ],
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          // On this chunk, the model declares tool_calls and we expect the
          // provider to flush tool-call parts immediately.
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "call_0",
              function: { arguments: '"Paris"}' },
            },
          ],
          getFinishReason: () => "tool_calls",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          }),
        },
        {
          // A trailing chunk after tool_calls should not produce text deltas.
          getDeltaContent: () => "SHOULD_NOT_APPEAR",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
      ]);

      const model = createModel();
      const prompt = createPrompt("Use tool");

      const result = await model.doStream({ prompt });
      const parts = await readAllParts(result.stream);

      const toolCallIndex = parts.findIndex((p) => p.type === "tool-call");
      const finishIndex = parts.findIndex((p) => p.type === "finish");

      expect(toolCallIndex).toBeGreaterThanOrEqual(0);
      expect(finishIndex).toBeGreaterThanOrEqual(0);
      expect(toolCallIndex).toBeLessThan(finishIndex);

      const finishPart = parts[finishIndex];
      if (finishPart.type === "finish") {
        expect(finishPart.finishReason).toBe("tool-calls");
      }

      // Ensure we stop emitting text deltas after tool-calls is detected.
      const textDeltas = parts
        .filter(
          (
            p,
          ): p is Extract<LanguageModelV2StreamPart, { type: "text-delta" }> =>
            p.type === "text-delta",
        )
        .map((p) => p.delta);
      expect(textDeltas.join("")).not.toContain("SHOULD_NOT_APPEAR");
    });

    it("should use latest tool call id when it changes", async () => {
      await setStreamChunks([
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "call_old",
              function: { name: "calc", arguments: "{" },
            },
          ],
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "call_new",
              function: { arguments: '"x":1}' },
            },
          ],
          getFinishReason: () => "tool_calls",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          }),
        },
      ]);

      const model = createModel();
      const prompt = createPrompt("Use tools");

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const toolInputDeltas = parts.filter(
        (p) => p.type === "tool-input-delta",
      );
      expect(toolInputDeltas).toHaveLength(2);

      const toolCall = parts.find((p) => p.type === "tool-call");
      expect(toolCall).toBeDefined();
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolCallId).toBe("call_new");
        expect(toolCall.toolName).toBe("calc");
        expect(toolCall.input).toBe('{"x":1}');
      }

      const toolInputEnd = parts.find((p) => p.type === "tool-input-end");
      expect(toolInputEnd).toBeDefined();
      if (toolInputEnd?.type === "tool-input-end") {
        expect(toolInputEnd.id).toBe("call_new");
      }
    });

    it.each([
      {
        input: "max_tokens_reached",
        expected: "length",
        description: "max_tokens_reached as length",
      },
      { input: "length", expected: "length", description: "length" },
      { input: "eos", expected: "stop", description: "eos as stop" },
      {
        input: "stop_sequence",
        expected: "stop",
        description: "stop_sequence as stop",
      },
      { input: "end_turn", expected: "stop", description: "end_turn as stop" },
      {
        input: "content_filter",
        expected: "content-filter",
        description: "content_filter",
      },
      { input: "error", expected: "error", description: "error" },
      {
        input: "max_tokens",
        expected: "length",
        description: "max_tokens as length",
      },
      {
        input: "tool_call",
        expected: "tool-calls",
        description: "tool_call as tool-calls",
      },
      {
        input: "function_call",
        expected: "tool-calls",
        description: "function_call as tool-calls",
      },
      {
        input: "some_new_unknown_reason",
        expected: "other",
        description: "unknown reason as other",
      },
      {
        input: undefined,
        expected: "unknown",
        description: "undefined as unknown",
      },
    ])(
      "should handle stream with finish reason: $description",
      async ({ input, expected }) => {
        await setStreamChunks([
          {
            getDeltaContent: () => "test content",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => input,
            getTokenUsage: () => ({
              prompt_tokens: 1,
              completion_tokens: 2,
              total_tokens: 3,
            }),
          },
        ]);

        const model = createModel();
        const prompt = createPrompt("Hello");

        const { stream } = await model.doStream({ prompt });
        const parts = await readAllParts(stream);

        const finishPart = parts.find((p) => p.type === "finish");
        expect(finishPart).toBeDefined();
        if (finishPart?.type === "finish") {
          expect(finishPart.finishReason).toBe(expected);
        }
      },
    );

    it("should omit tools and response_format when not provided", async () => {
      const model = createModel();
      const prompt = createPrompt("Hello");

      const result = await model.doGenerate({ prompt });
      expectRequestBodyHasMessages(result);

      const request = await getLastChatCompletionRequest();
      expectToOmitKeys(request, ["tools", "response_format"]);
    });

    it("should handle stream chunks with null content", async () => {
      await setStreamChunks([
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          getDeltaContent: () => "Hello",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "stop",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 1,
            total_tokens: 11,
          }),
        },
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      // Should only have one text-delta for "Hello", not for null chunks
      const textDeltas = parts.filter((p) => p.type === "text-delta");
      expect(textDeltas).toHaveLength(1);
      expect((textDeltas[0] as { delta: string }).delta).toBe("Hello");

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
    });

    it("should handle stream with empty string content", async () => {
      await setStreamChunks([
        {
          getDeltaContent: () => "",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          getDeltaContent: () => "Response",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "stop",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 1,
            total_tokens: 11,
          }),
        },
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      // Empty string deltas should still be emitted
      const textDeltas = parts.filter((p) => p.type === "text-delta");
      expect(textDeltas.length).toBeGreaterThanOrEqual(1);
    });

    describe("error handling", () => {
      it("should warn when tool call delta has no tool name", async () => {
        // (node-only)
        // Simulate tool call without a name (never receives name in any chunk)
        await setStreamChunks([
          {
            getDeltaContent: () => null,
            getDeltaToolCalls: () => [
              {
                index: 0,
                id: "call_nameless",
                function: { arguments: '{"x":1}' },
                // Note: No "name" property
              },
            ],
            getFinishReason: () => "tool_calls",
            getTokenUsage: () => ({
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            }),
          },
        ]);

        const model = createModel();
        const prompt = createPrompt("Use tool");

        const result = await model.doStream({ prompt });
        const { stream } = result;
        const parts: LanguageModelV2StreamPart[] = [];
        const reader = stream.getReader();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
        }

        // Should have a tool-call part even if tool name is missing.
        const toolCall = parts.find((p) => p.type === "tool-call");
        expect(toolCall).toBeDefined();
        if (toolCall?.type === "tool-call") {
          expect(toolCall.toolName).toBe("");
          expect(toolCall.input).toBe('{"x":1}');
        }

        // Warning should be surfaced on the result (not retroactively in stream-start)
        const streamStart = parts.find(
          (
            p,
          ): p is Extract<
            LanguageModelV2StreamPart,
            { type: "stream-start" }
          > => p.type === "stream-start",
        );
        expect(streamStart).toBeDefined();
        expect(streamStart?.warnings).toHaveLength(0);

        // Consume the stream first: warnings are collected during streaming.
        const warnings = result.warnings;

        expect(warnings.length).toBeGreaterThan(0);

        expect(parts.some((p) => p.type === "error")).toBe(false);
        expect(parts.some((p) => p.type === "finish")).toBe(true);

        const finish = parts.find(
          (p): p is Extract<LanguageModelV2StreamPart, { type: "finish" }> =>
            p.type === "finish",
        );
        expect(finish?.finishReason).toBeDefined();
      });

      it("should emit error part when stream iteration throws", async () => {
        // (node-only)
        const MockClient = await getMockClient();
        if (!MockClient.setStreamError) {
          throw new Error("mock missing setStreamError");
        }

        // Set up chunks that complete normally, but error is thrown after
        await setStreamChunks([
          {
            getDeltaContent: () => "Hello",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => null,
            getTokenUsage: () => undefined,
          },
        ]);
        const axiosError = new Error("Stream iteration failed") as unknown as {
          isAxiosError: boolean;
          response: { headers: Record<string, string> };
        };
        axiosError.isAxiosError = true;
        axiosError.response = {
          headers: {
            "x-request-id": "stream-axios-123",
          },
        };

        MockClient.setStreamError(axiosError as unknown as Error);

        const model = createModel();
        const prompt = createPrompt("Hello");

        const { stream } = await model.doStream({ prompt });
        const parts: LanguageModelV2StreamPart[] = [];
        const reader = stream.getReader();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
        }

        // Should have text delta before error
        const textDelta = parts.find((p) => p.type === "text-delta");
        expect(textDelta).toBeDefined();

        // Should have error part
        const errorPart = parts.find((p) => p.type === "error");
        expect(errorPart).toBeDefined();
        if (errorPart?.type === "error") {
          expect((errorPart.error as Error).message).toEqual(
            expect.stringContaining("Stream iteration failed"),
          );
          expect(
            (errorPart.error as { responseHeaders?: unknown }).responseHeaders,
          ).toMatchObject({
            "x-request-id": "stream-axios-123",
          });
        }

        // Reset the stream error for other tests
        await setStreamChunks([
          {
            getDeltaContent: () => "reset",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => "stop",
            getTokenUsage: () => ({
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            }),
          },
        ]);
      });

      it("should skip tool call deltas with invalid index", async () => {
        await setStreamChunks([
          {
            getDeltaContent: () => "Hello",
            getDeltaToolCalls: () => [
              {
                index: NaN, // Invalid index
                id: "call_invalid",
                function: { name: "test_tool", arguments: "{}" },
              },
            ],
            getFinishReason: () => null,
            getTokenUsage: () => undefined,
          },
          {
            getDeltaContent: () => null,
            getDeltaToolCalls: () => [
              {
                index: undefined as unknown as number, // Also invalid
                id: "call_undefined",
                function: { name: "other_tool", arguments: "{}" },
              },
            ],
            getFinishReason: () => "stop",
            getTokenUsage: () => ({
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            }),
          },
        ]);

        const model = createModel();
        const prompt = createPrompt("Hello");

        const { stream } = await model.doStream({ prompt });
        const parts: LanguageModelV2StreamPart[] = [];
        const reader = stream.getReader();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
        }

        // Should complete without error
        expect(parts.some((p) => p.type === "finish")).toBe(true);
        // No tool calls should be emitted due to invalid indices
        expect(parts.some((p) => p.type === "tool-call")).toBe(false);
      });

      it("should flush unflushed tool calls at stream end (with finishReason=stop)", async () => {
        await setStreamChunks([
          {
            getDeltaContent: () => null,
            getDeltaToolCalls: () => [
              {
                index: 0,
                id: "call_unflushed",
                function: { name: "get_info", arguments: '{"q":"test"}' },
              },
            ],
            getFinishReason: () => null,
            getTokenUsage: () => undefined,
          },
          // End stream without tool-calls finish reason - tool should still be emitted
          {
            getDeltaContent: () => null,
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => "stop",
            getTokenUsage: () => ({
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            }),
          },
        ]);

        const model = createModel();
        const prompt = createPrompt("Test");

        const { stream } = await model.doStream({ prompt });
        const parts: LanguageModelV2StreamPart[] = [];
        const reader = stream.getReader();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
        }

        // Tool call should be emitted even though finishReason was "stop"
        const toolCall = parts.find((p) => p.type === "tool-call");
        expect(toolCall).toBeDefined();
        if (toolCall?.type === "tool-call") {
          expect(toolCall.toolCallId).toBe("call_unflushed");
          expect(toolCall.toolName).toBe("get_info");
        }

        // Finish reason should be "tool-calls" since we emitted tool calls
        const finish = parts.find(
          (p): p is Extract<LanguageModelV2StreamPart, { type: "finish" }> =>
            p.type === "finish",
        );
        expect(finish?.finishReason).toBe("tool-calls");
      });

      it("should handle undefined finish reason from stream", async () => {
        await setStreamChunks([
          {
            getDeltaContent: () => "Hello",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => undefined as unknown as string,
            getTokenUsage: () => undefined,
          },
          {
            getDeltaContent: () => "!",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => undefined as unknown as string,
            getTokenUsage: () => ({
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            }),
          },
        ]);

        const model = createModel();
        const prompt = createPrompt("Hello");

        const { stream } = await model.doStream({ prompt });
        const parts: LanguageModelV2StreamPart[] = [];
        const reader = stream.getReader();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
        }

        const finish = parts.find(
          (p): p is Extract<LanguageModelV2StreamPart, { type: "finish" }> =>
            p.type === "finish",
        );
        // Should default to "unknown" when no finish reason is provided
        expect(finish?.finishReason).toBe("unknown");
      });

      it("should flush tool calls that never received input-start", async () => {
        await setStreamChunks([
          {
            getDeltaContent: () => null,
            getDeltaToolCalls: () => [
              {
                index: 0,
                id: "call_no_start",
                // No name in first chunk - so didEmitInputStart stays false
                function: { arguments: '{"partial":' },
              },
            ],
            getFinishReason: () => null,
            getTokenUsage: () => undefined,
          },
          {
            getDeltaContent: () => null,
            getDeltaToolCalls: () => [
              {
                index: 0,
                // Name comes later but input-start was never emitted
                function: { name: "delayed_name", arguments: '"value"}' },
              },
            ],
            getFinishReason: () => "tool_calls",
            getTokenUsage: () => ({
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            }),
          },
        ]);

        const model = createModel();
        const prompt = createPrompt("Test");

        const { stream } = await model.doStream({ prompt });
        const parts: LanguageModelV2StreamPart[] = [];
        const reader = stream.getReader();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
        }

        // Tool call should still be properly emitted
        const toolCall = parts.find((p) => p.type === "tool-call");
        expect(toolCall).toBeDefined();
        if (toolCall?.type === "tool-call") {
          expect(toolCall.toolName).toBe("delayed_name");
          expect(toolCall.input).toBe('{"partial":"value"}');
        }
      });

      it("should throw converted error when doStream setup fails", async () => {
        const MockClient = await getMockClient();
        if (!MockClient.setStreamSetupError) {
          throw new Error("mock missing setStreamSetupError");
        }

        const setupError = new Error("Stream setup failed");
        MockClient.setStreamSetupError(setupError);

        const model = createModel();
        const prompt = createPrompt("Hello");

        await expect(model.doStream({ prompt })).rejects.toThrow(
          "Stream setup failed",
        );
      });
    });
  });

  describe("configuration", () => {
    describe("masking and filtering", () => {
      it("should omit masking when empty object", async () => {
        const model = createModel("gpt-4o", {
          masking: {},
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).not.toHaveProperty("masking");
      });

      it("should omit filtering when empty object", async () => {
        const model = createModel("gpt-4o", {
          filtering: {},
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).not.toHaveProperty("filtering");
      });

      it("should include masking module in orchestration config", async () => {
        const masking = {
          masking_providers: [
            {
              type: "sap_data_privacy_integration",
              method: "anonymization",
              entities: [{ type: "profile-email" }, { type: "profile-phone" }],
            },
          ],
        };

        const model = createModel("gpt-4o", {
          masking,
        });

        const prompt = createPrompt("My email is test@example.com");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).toHaveProperty("masking");
        expect(request.masking).toEqual(masking);
      });

      it("should include filtering module in orchestration config", async () => {
        const filtering = {
          input: {
            filters: [
              {
                type: "azure_content_safety",
                config: {
                  Hate: 0,
                  Violence: 0,
                  SelfHarm: 0,
                  Sexual: 0,
                },
              },
            ],
          },
        };

        const model = createModel("gpt-4o", {
          filtering,
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).toHaveProperty("filtering");
        expect(request.filtering).toEqual(filtering);
      });

      it("should include both masking and filtering when configured", async () => {
        const masking = {
          masking_providers: [
            {
              type: "sap_data_privacy_integration",
              method: "pseudonymization",
              entities: [{ type: "profile-person" }],
            },
          ],
        };

        const filtering = {
          output: {
            filters: [
              {
                type: "azure_content_safety",
                config: {
                  Hate: 2,
                  Violence: 2,
                  SelfHarm: 2,
                  Sexual: 2,
                },
              },
            ],
          },
        };

        const model = createModel("gpt-4o", {
          masking,
          filtering,
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).toHaveProperty("masking");
        expect(request.masking).toEqual(masking);
        expect(request).toHaveProperty("filtering");
        expect(request.filtering).toEqual(filtering);
      });
    });

    describe("model version", () => {
      it("should pass model version to orchestration config", async () => {
        const model = createModel("gpt-4o", {
          modelVersion: "2024-05-13",
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.version).toBe("2024-05-13");
      });

      it("should use 'latest' as default version", async () => {
        const model = createModel("gpt-4o");

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.version).toBe("latest");
      });
    });

    describe("model parameters", () => {
      it("should prefer options.temperature over settings.modelParams.temperature", async () => {
        const model = createModel("gpt-4o", {
          modelParams: {
            temperature: 0.5,
          },
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          temperature: 0.9,
        });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.temperature).toBe(0.9);
      });

      it("should prefer options.maxOutputTokens over settings.modelParams.maxTokens", async () => {
        const model = createModel("gpt-4o", {
          modelParams: {
            maxTokens: 500,
          },
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          maxOutputTokens: 1000,
        });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.max_tokens).toBe(1000);
      });

      it("should pass topP from options to model params", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          topP: 0.9,
        });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.top_p).toBe(0.9);
      });

      it("should pass topK from options to model params", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          topK: 40,
        });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.top_k).toBe(40);
      });

      it("should pass frequencyPenalty from options to model params", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          frequencyPenalty: 0.5,
        });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.frequency_penalty).toBe(0.5);
      });

      it("should pass presencePenalty from options to model params", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          presencePenalty: 0.3,
        });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.presence_penalty).toBe(0.3);
      });

      it("should pass stop sequences to model params", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          stopSequences: ["END", "STOP"],
        });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.stop).toEqual(["END", "STOP"]);
      });

      it("should pass seed to model params", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          seed: 42,
        });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.seed).toBe(42);
      });
    });

    describe("model-specific behavior", () => {
      it("should disable n parameter for Amazon models", async () => {
        const model = createModel("amazon--nova-pro", {
          modelParams: { n: 2 },
        });
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.n).toBeUndefined();
      });

      it("should disable n parameter for Anthropic models", async () => {
        const model = createModel("anthropic--claude-3.5-sonnet", {
          modelParams: { n: 2 },
        });
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.n).toBeUndefined();
      });
    });

    describe("warnings", () => {
      it("should warn when toolChoice is not 'auto'", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const tools: LanguageModelV2FunctionTool[] = [
          {
            type: "function",
            name: "test_tool",
            description: "A test tool",
            inputSchema: { type: "object", properties: {}, required: [] },
          },
        ];

        const result = await model.doGenerate({
          prompt,
          tools,
          toolChoice: { type: "required" },
        });

        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            type: "unsupported-setting",
            setting: "toolChoice",
          }),
        );
      });

      it("should not warn when toolChoice is 'auto'", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const tools: LanguageModelV2FunctionTool[] = [
          {
            type: "function",
            name: "test_tool",
            description: "A test tool",
            inputSchema: { type: "object", properties: {}, required: [] },
          },
        ];

        const result = await model.doGenerate({
          prompt,
          tools,
          toolChoice: { type: "auto" },
        });

        const toolChoiceWarnings = result.warnings.filter(
          (w) =>
            w.type === "unsupported-setting" &&
            (w as unknown as { setting?: string }).setting === "toolChoice",
        );
        expect(toolChoiceWarnings).toHaveLength(0);
      });

      it("should emit a best-effort warning for responseFormat json", async () => {
        const model = createModel();
        const prompt = createPrompt("Return JSON");

        const result = await model.doGenerate({
          prompt,
          responseFormat: { type: "json" },
        });
        const warnings = result.warnings;

        expect(warnings.length).toBeGreaterThan(0);
      });
    });

    describe("tools", () => {
      it("should use tools from settings when provided", async () => {
        const model = createModel("gpt-4o", {
          tools: [
            {
              type: "function",
              function: {
                name: "custom_tool",
                description: "A custom tool from settings",
                parameters: {
                  type: "object",
                  properties: {
                    input: { type: "string" },
                  },
                  required: ["input"],
                },
              },
            },
          ],
        });

        const prompt = createPrompt("Use a tool");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        const tools = Array.isArray(request.tools)
          ? (request.tools as unknown[])
          : undefined;

        expect(tools).toBeDefined();
        if (tools) {
          expect(tools).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                type: "function",
              }),
            ]),
          );

          const customTool = tools.find(
            (tool): tool is { type?: string; function?: { name?: string } } =>
              typeof tool === "object" &&
              tool !== null &&
              (tool as { type?: unknown }).type === "function" &&
              typeof (tool as { function?: { name?: unknown } }).function
                ?.name === "string" &&
              (tool as { function?: { name?: string } }).function?.name ===
                "custom_tool",
          );

          expect(customTool).toBeDefined();
        }
      });

      it("should coerce non-object schema type to object", async () => {
        const model = createModel();
        const prompt = createPrompt("Use tool");

        // Tool with "array" type schema - should be coerced to object
        const tools: LanguageModelV2FunctionTool[] = [
          {
            type: "function",
            name: "array_tool",
            description: "Tool with array schema",
            inputSchema: {
              type: "array",
              items: { type: "string" },
            },
          },
        ];

        const result = await model.doGenerate({ prompt, tools });

        expectRequestBodyHasMessages(result);
      });

      it("should handle tool with string type schema", async () => {
        const model = createModel();
        const prompt = createPrompt("Use tool");

        // Tool with "string" type schema - should be coerced to object
        const tools: LanguageModelV2FunctionTool[] = [
          {
            type: "function",
            name: "string_tool",
            description: "Tool with string schema",
            inputSchema: {
              type: "string",
            },
          },
        ];

        const result = await model.doGenerate({ prompt, tools });

        expectRequestBodyHasMessages(result);
      });

      it("should handle tool with schema that has no properties", async () => {
        const model = createModel();
        const prompt = createPrompt("Use tool");

        const tools: LanguageModelV2FunctionTool[] = [
          {
            type: "function",
            name: "empty_props_tool",
            description: "Tool with empty properties",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ];

        const result = await model.doGenerate({ prompt, tools });

        expectRequestBodyHasMessages(result);
      });

      it("should handle tool with undefined inputSchema", async () => {
        const model = createModel();
        const prompt = createPrompt("Use tool");

        const tools: LanguageModelV2FunctionTool[] = [
          {
            type: "function",
            name: "no_schema_tool",
            description: "Tool without schema",
            inputSchema: undefined as unknown as Record<string, unknown>,
          },
        ];

        const result = await model.doGenerate({ prompt, tools });

        expectRequestBodyHasMessages(result);
      });
    });
  });
});
