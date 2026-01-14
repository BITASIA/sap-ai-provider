import { describe, it, expect, vi } from "vitest";
import { SAPAIChatLanguageModel } from "./sap-ai-chat-language-model";
import type {
  LanguageModelV3Prompt,
  LanguageModelV3FunctionTool,
  LanguageModelV3ProviderTool,
  LanguageModelV3StreamPart,
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

  const createPrompt = (text: string): LanguageModelV3Prompt => [
    { role: "user", content: [{ type: "text", text }] },
  ];

  const expectRequestBodyHasMessages = (result: {
    request?: { body?: unknown };
  }) => {
    const body: unknown = result.request?.body;
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
    request?: { body?: unknown };
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
      expect(model.specificationVersion).toBe("v3");
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
        expect(model).toMatchObject({
          supportsImageUrls: true,
          supportsStructuredOutputs: true,
          supportsToolCalls: true,
          supportsStreaming: true,
          supportsMultipleCompletions: true,
          supportsParallelToolCalls: true,
        });
      });

      it.each([
        "gpt-4o",
        "anthropic--claude-3.5-sonnet",
        "gemini-2.0-flash",
        "amazon--nova-pro",
        "mistralai--mistral-large-instruct",
        "unknown-future-model",
      ])("should have consistent capabilities for model %s", (modelId) => {
        // Capabilities are static defaults, not model-dependent
        const model = createModel(modelId);
        expect(model).toMatchObject({
          supportsImageUrls: true,
          supportsStructuredOutputs: true,
          supportsToolCalls: true,
          supportsStreaming: true,
          supportsMultipleCompletions: true,
          supportsParallelToolCalls: true,
        });
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
      expect(result.finishReason).toEqual({ unified: "stop", raw: "stop" });
      expect(result.usage).toEqual({
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      });
      expect(result.response?.headers).toBeDefined();
      expect(result.response?.headers).toMatchObject({
        "x-request-id": "test-request-id",
      });
      expect(result.providerMetadata?.["sap-ai"]).toMatchObject({
        finishReason: "stop",
        finishReasonMapped: { unified: "stop", raw: "stop" },
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

        const prompt: LanguageModelV3Prompt = [
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

      const tools: LanguageModelV3FunctionTool[] = [
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
        tools: tools as unknown as LanguageModelV3ProviderTool[],
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe("unsupported");
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

      const tools: LanguageModelV3FunctionTool[] = [
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

      const tools: LanguageModelV3FunctionTool[] = [
        {
          type: "function",
          name: "badTool",
          description: "Tool with failing Zod schema conversion",
          inputSchema: {},
          parameters: zodLikeThatThrows,
        } as unknown as LanguageModelV3FunctionTool,
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
      expect(result.finishReason).toEqual({
        unified: "tool-calls",
        raw: "tool_calls",
      });
    });

    it.each([
      {
        description: "normalize array header values",
        headers: {
          "x-request-id": "array-header-test",
          "x-multi-value": ["value1", "value2"],
        },
        expected: {
          "x-request-id": "array-header-test",
          "x-multi-value": "value1; value2",
        },
      },
      {
        description: "convert numeric header values to strings",
        headers: {
          "content-length": 1024,
          "x-retry-after": 30,
        },
        expected: {
          "content-length": "1024",
          "x-retry-after": "30",
        },
      },
      {
        description: "skip unsupported header value types",
        headers: {
          "x-valid": "keep-this",
          "x-object": { nested: "object" },
        },
        expected: {
          "x-valid": "keep-this",
        },
      },
      {
        description: "filter non-string values from array headers",
        headers: {
          "x-mixed": ["valid", 123, null, "also-valid"],
        },
        expected: {
          "x-mixed": "valid; also-valid",
        },
      },
      {
        description: "exclude array headers with only non-string items",
        headers: {
          "x-valid": "keep-this",
          "x-invalid-array": [123, null, undefined],
        },
        expected: {
          "x-valid": "keep-this",
        },
      },
    ])(
      "should $description in doGenerate response",
      async ({ headers, expected }) => {
        const MockClient = await getMockClient();
        if (!MockClient.setChatCompletionResponse) {
          throw new Error("mock missing setChatCompletionResponse");
        }

        MockClient.setChatCompletionResponse({
          rawResponse: { headers },
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

        expect(result.response?.headers).toEqual(expected);
      },
    );

    it("should include response body in doGenerate result", async () => {
      const model = createModel();
      const prompt = createPrompt("Hello");

      const result = await model.doGenerate({ prompt });

      expect(result.response?.body).toBeDefined();
      expect(result.response?.body).toHaveProperty("content");
      expect(result.response?.body).toHaveProperty("tokenUsage");
      expect(result.response?.body).toHaveProperty("finishReason");
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

      const parts = await readAllParts(result.stream);

      // Warnings are emitted in stream-start event
      // should not be mutated during the stream. Our implementation correctly takes a snapshot
      // of warnings at stream-start time.
      const streamStart = parts.find((part) => part.type === "stream-start");
      expect(streamStart?.warnings).toHaveLength(0);
    });
    async function readAllParts(
      stream: ReadableStream<LanguageModelV3StreamPart>,
    ) {
      const parts: LanguageModelV3StreamPart[] = [];
      const reader = stream.getReader();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }

      return parts;
    }

    it("should not emit text deltas after tool-call deltas", async () => {
      await setStreamChunks([
        {
          getDeltaContent: () => "Hello",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          // Tool call deltas appear before a finish reason is reported.
          // Any text content after this point must not be emitted.
          getDeltaContent: () => " SHOULD_NOT_APPEAR",
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "call_0",
              function: { name: "calc", arguments: '{"x":' },
            },
          ],
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          getDeltaContent: () => " ALSO_SHOULD_NOT_APPEAR",
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "call_0",
              function: { arguments: "1}" },
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
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const textDeltas = parts.filter((p) => p.type === "text-delta");
      expect(textDeltas).toHaveLength(1);
      expect((textDeltas[0] as { delta: string }).delta).toBe("Hello");
    });

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
      expect(responseMetadata).toMatchObject({
        type: "response-metadata",
        modelId: "gpt-4o",
      });
      expect(parts.some((p) => p.type === "text-delta")).toBe(true);
      expect(parts.some((p) => p.type === "finish")).toBe(true);

      // Check finish part
      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toEqual({
          unified: "stop",
          raw: "stop",
        });
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
        expect(finishPart.finishReason).toEqual({
          unified: "tool-calls",
          raw: "tool_calls",
        });
      }

      // Ensure we stop emitting text deltas after tool-calls is detected.
      const textDeltas = parts
        .filter(
          (
            p,
          ): p is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
            p.type === "text-delta",
        )
        .map((p) => p.delta);
      expect(textDeltas.join("")).not.toContain("SHOULD_NOT_APPEAR");
    });

    it("should handle interleaved tool call deltas across multiple indices", async () => {
      await setStreamChunks([
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "call_0",
              function: { name: "first", arguments: '{"a":' },
            },
            {
              index: 1,
              id: "call_1",
              function: { name: "second", arguments: '{"b":' },
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
              id: "call_0",
              function: { arguments: "1}" },
            },
            {
              index: 1,
              id: "call_1",
              function: { arguments: "2}" },
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

      const toolCalls = parts.filter((p) => p.type === "tool-call");
      expect(toolCalls).toHaveLength(2);

      const firstCall = toolCalls.find((call) => call.toolName === "first");
      expect(firstCall).toMatchObject({
        type: "tool-call",
        toolName: "first",
        input: '{"a":1}',
      });

      const secondCall = toolCalls.find((call) => call.toolName === "second");
      expect(secondCall).toMatchObject({
        type: "tool-call",
        toolName: "second",
        input: '{"b":2}',
      });
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
      expect(toolCall).toMatchObject({
        type: "tool-call",
        toolCallId: "call_new",
        toolName: "calc",
        input: '{"x":1}',
      });

      const toolInputEnd = parts.find((p) => p.type === "tool-input-end");
      expect(toolInputEnd).toBeDefined();
      expect(toolInputEnd).toMatchObject({
        type: "tool-input-end",
        id: "call_new",
      });
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
        expected: "other",
        description: "undefined as other",
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
          expect(finishPart.finishReason.unified).toBe(expected);
          expect(finishPart.finishReason.raw).toBe(input);
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
        const parts: LanguageModelV3StreamPart[] = [];
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
        expect(toolCall).toMatchObject({
          type: "tool-call",
          toolName: "",
          input: '{"x":1}',
        });

        // Warnings are emitted at stream-start time
        // during streaming (not before), it won't appear in stream-start.
        const streamStart = parts.find(
          (
            p,
          ): p is Extract<
            LanguageModelV3StreamPart,
            { type: "stream-start" }
          > => p.type === "stream-start",
        );
        expect(streamStart).toBeDefined();
        expect(streamStart?.warnings).toHaveLength(0);

        // Warnings only appear in stream-start event
        // This test verifies that the warning doesn't crash the stream.

        expect(parts.some((p) => p.type === "error")).toBe(false);
        expect(parts.some((p) => p.type === "finish")).toBe(true);

        const finish = parts.find(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "finish" }> =>
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
        const parts: LanguageModelV3StreamPart[] = [];
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
        expect(errorPart).toMatchObject({
          type: "error",
        });
        expect((errorPart as { error: Error }).error.message).toEqual(
          expect.stringContaining("Stream iteration failed"),
        );
        expect(
          (errorPart as { error: { responseHeaders?: unknown } }).error
            .responseHeaders,
        ).toMatchObject({
          "x-request-id": "stream-axios-123",
        });

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
        const parts: LanguageModelV3StreamPart[] = [];
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

      it("should generate unique RFC 4122 UUIDs for text blocks", async () => {
        // Regression test for StreamIdGenerator bug (commit 3ca38c6)
        // Ensures text blocks get truly unique UUIDs instead of hardcoded "0"
        await setStreamChunks([
          {
            getDeltaContent: () => "First text block",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => null,
            getTokenUsage: () => undefined,
          },
          {
            getDeltaContent: () => " continuation",
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
        const parts: LanguageModelV3StreamPart[] = [];
        const reader = stream.getReader();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
        }

        // Extract text lifecycle events
        const textStarts = parts.filter(
          (
            p,
          ): p is Extract<LanguageModelV3StreamPart, { type: "text-start" }> =>
            p.type === "text-start",
        );
        const textDeltas = parts.filter(
          (
            p,
          ): p is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
            p.type === "text-delta",
        );
        const textEnds = parts.filter(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "text-end" }> =>
            p.type === "text-end",
        );

        // Should have exactly one text block
        expect(textStarts).toHaveLength(1);
        expect(textEnds).toHaveLength(1);
        expect(textDeltas.length).toBeGreaterThan(0);

        const blockId = textStarts[0]!.id;

        // ID must be a valid RFC 4122 UUID v4 (format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(blockId).toMatch(uuidRegex);

        // Must NOT be hardcoded "0" (the bug we fixed in commit 3ca38c6)
        expect(blockId).not.toBe("0");

        // Verify all text-delta and text-end use the same UUID as text-start
        for (const delta of textDeltas) {
          expect(delta.id).toBe(blockId);
        }
        expect(textEnds[0]!.id).toBe(blockId);

        // Additional verification: test multiple streams to ensure different UUIDs
        const { stream: stream2 } = await model.doStream({ prompt });
        const parts2: LanguageModelV3StreamPart[] = [];
        const reader2 = stream2.getReader();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader2.read();
          if (done) break;
          parts2.push(value);
        }

        const textStarts2 = parts2.filter(
          (
            p,
          ): p is Extract<LanguageModelV3StreamPart, { type: "text-start" }> =>
            p.type === "text-start",
        );

        const blockId2 = textStarts2[0]!.id;

        // Different stream should have different UUID (proves randomness)
        expect(blockId2).not.toBe(blockId);
        expect(blockId2).toMatch(uuidRegex);
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
        const parts: LanguageModelV3StreamPart[] = [];
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
        expect(toolCall).toMatchObject({
          type: "tool-call",
          toolCallId: "call_unflushed",
          toolName: "get_info",
        });

        // Finish reason should be "stop" from server (we respect server's decision)
        const finish = parts.find(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "finish" }> =>
            p.type === "finish",
        );
        expect(finish?.finishReason).toEqual({ unified: "stop", raw: "stop" });
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
        const parts: LanguageModelV3StreamPart[] = [];
        const reader = stream.getReader();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
        }

        const finish = parts.find(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "finish" }> =>
            p.type === "finish",
        );
        // Undefined finish reason maps to "other"
        expect(finish?.finishReason).toEqual({
          unified: "other",
          raw: undefined,
        });
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
        const parts: LanguageModelV3StreamPart[] = [];
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
        expect(toolCall).toMatchObject({
          type: "tool-call",
          toolName: "delayed_name",
          input: '{"partial":"value"}',
        });
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
      it.each([
        { property: "masking", settings: { masking: {} } },
        { property: "filtering", settings: { filtering: {} } },
      ])(
        "should omit $property when empty object",
        async ({ property, settings }) => {
          const model = createModel("gpt-4o", settings);

          const prompt = createPrompt("Hello");

          const result = await model.doGenerate({ prompt });

          expectRequestBodyHasMessages(result);

          const request = await getLastChatCompletionRequest();
          expect(request).not.toHaveProperty(property);
        },
      );

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
      it.each([
        {
          testName: "temperature",
          settingsKey: "temperature",
          settingsValue: 0.5,
          optionKey: "temperature",
          optionValue: 0.9,
          expectedKey: "temperature",
          expectedValue: 0.9,
        },
        {
          testName: "maxOutputTokens",
          settingsKey: "maxTokens",
          settingsValue: 500,
          optionKey: "maxOutputTokens",
          optionValue: 1000,
          expectedKey: "max_tokens",
          expectedValue: 1000,
        },
      ])(
        "should prefer options.$testName over settings.modelParams.$settingsKey",
        async ({
          settingsKey,
          settingsValue,
          optionKey,
          optionValue,
          expectedKey,
          expectedValue,
        }) => {
          const model = createModel("gpt-4o", {
            modelParams: {
              [settingsKey]: settingsValue,
            },
          });

          const prompt = createPrompt("Hello");

          const result = await model.doGenerate({
            prompt,
            [optionKey]: optionValue,
          });

          expectRequestBodyHasMessages(result);

          const request = await getLastChatCompletionRequest();

          expect(request.model?.params?.[expectedKey]).toBe(expectedValue);
        },
      );

      it.each([
        {
          paramName: "topP",
          paramValue: 0.9,
          expectedKey: "top_p",
          expectedValue: 0.9,
        },
        {
          paramName: "topK",
          paramValue: 40,
          expectedKey: "top_k",
          expectedValue: 40,
        },
        {
          paramName: "frequencyPenalty",
          paramValue: 0.5,
          expectedKey: "frequency_penalty",
          expectedValue: 0.5,
        },
        {
          paramName: "presencePenalty",
          paramValue: 0.3,
          expectedKey: "presence_penalty",
          expectedValue: 0.3,
        },
        {
          paramName: "stopSequences",
          paramValue: ["END", "STOP"],
          expectedKey: "stop",
          expectedValue: ["END", "STOP"],
        },
        {
          paramName: "seed",
          paramValue: 42,
          expectedKey: "seed",
          expectedValue: 42,
        },
      ])(
        "should pass $paramName from options to model params",
        async ({ paramName, paramValue, expectedKey, expectedValue }) => {
          const model = createModel();
          const prompt = createPrompt("Hello");

          const result = await model.doGenerate({
            prompt,
            [paramName]: paramValue,
          });

          expectRequestBodyHasMessages(result);

          const request = await getLastChatCompletionRequest();

          expect(request.model?.params?.[expectedKey]).toEqual(expectedValue);
        },
      );
    });

    describe("model-specific behavior", () => {
      it.each([
        { modelId: "amazon--nova-pro", vendor: "Amazon" },
        { modelId: "anthropic--claude-3.5-sonnet", vendor: "Anthropic" },
      ])(
        "should disable n parameter for $vendor models",
        async ({ modelId }) => {
          const model = createModel(modelId, {
            modelParams: { n: 2 },
          });
          const prompt = createPrompt("Hello");

          const result = await model.doGenerate({ prompt });
          expectRequestBodyHasMessages(result);

          const request = await getLastChatCompletionRequest();

          expect(request.model?.params?.n).toBeUndefined();
        },
      );
    });

    describe("warnings", () => {
      it("should warn when toolChoice is not 'auto'", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const tools: LanguageModelV3FunctionTool[] = [
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
            type: "unsupported",
            feature: "toolChoice",
          }),
        );
      });

      it("should not warn when toolChoice is 'auto'", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const tools: LanguageModelV3FunctionTool[] = [
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
            w.type === "unsupported" &&
            (w as unknown as { feature?: string }).feature === "toolChoice",
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

      it.each([
        {
          testName: "coerce non-object schema type to object (array)",
          toolName: "array_tool",
          description: "Tool with array schema",
          inputSchema: { type: "array", items: { type: "string" } },
        },
        {
          testName: "handle tool with string type schema",
          toolName: "string_tool",
          description: "Tool with string schema",
          inputSchema: { type: "string" },
        },
        {
          testName: "handle tool with schema that has no properties",
          toolName: "empty_props_tool",
          description: "Tool with empty properties",
          inputSchema: { type: "object", properties: {} },
        },
        {
          testName: "handle tool with undefined inputSchema",
          toolName: "no_schema_tool",
          description: "Tool without schema",
          inputSchema: undefined as unknown as Record<string, unknown>,
        },
      ])("should $testName", async ({ toolName, description, inputSchema }) => {
        const model = createModel();
        const prompt = createPrompt("Use tool");

        const tools: LanguageModelV3FunctionTool[] = [
          {
            type: "function",
            name: toolName,
            description,
            inputSchema,
          },
        ];

        const result = await model.doGenerate({ prompt, tools });

        expectRequestBodyHasMessages(result);
      });
    });
  });
});
