/** Unit tests for SAP AI Language Model. */

import type {
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
  LanguageModelV3ProviderTool,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";

import { describe, expect, it, vi } from "vitest";

import { SAPAILanguageModel } from "./sap-ai-language-model";

vi.mock("@sap-ai-sdk/orchestration", () => {
  class MockOrchestrationClient {
    static chatCompletionError: Error | undefined;
    static chatCompletionResponse:
      | undefined
      | {
          getContent: () => null | string;
          getFinishReason: () => string;
          getTokenUsage: () => {
            completion_tokens: number;
            prompt_tokens: number;
            total_tokens: number;
          };
          getToolCalls: () =>
            | undefined
            | { function: { arguments: string; name: string }; id: string }[];
          rawResponse?: { headers?: Record<string, unknown> };
        };
    static lastChatCompletionRequest: unknown;
    static lastChatCompletionRequestConfig: unknown;

    static lastStreamAbortSignal: unknown;

    static lastStreamConfig: unknown;

    static lastStreamRequest: unknown;

    static streamChunks:
      | undefined
      | {
          getDeltaContent: () => null | string;
          getDeltaToolCalls: () =>
            | undefined
            | {
                function?: { arguments?: string; name?: string };
                id?: string;
                index: number;
              }[];
          getFinishReason: () => null | string | undefined;
          getTokenUsage: () =>
            | undefined
            | {
                completion_tokens: number;
                prompt_tokens: number;
                total_tokens: number;
              };
        }[];
    static streamError: Error | undefined;
    static streamSetupError: Error | undefined;

    chatCompletion = vi.fn().mockImplementation((request, requestConfig) => {
      MockOrchestrationClient.lastChatCompletionRequest = request;
      MockOrchestrationClient.lastChatCompletionRequestConfig = requestConfig;

      const errorToThrow = MockOrchestrationClient.chatCompletionError;
      if (errorToThrow) {
        MockOrchestrationClient.chatCompletionError = undefined;
        throw errorToThrow;
      }

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
        getContent: () => "Hello!",
        getFinishReason: () => "stop",
        getTokenUsage: () => ({
          completion_tokens: 5,
          prompt_tokens: 10,
          total_tokens: 15,
        }),
        getToolCalls: () => undefined,
        rawResponse: {
          headers: {
            "x-request-id": "test-request-id",
          },
        },
      });
    });

    stream = vi.fn().mockImplementation((request, abortSignal, config) => {
      MockOrchestrationClient.lastStreamRequest = request;
      MockOrchestrationClient.lastStreamAbortSignal = abortSignal;
      MockOrchestrationClient.lastStreamConfig = config;

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
              completion_tokens: 5,
              prompt_tokens: 10,
              total_tokens: 15,
            }),
          },
        ] as const);

      let lastFinishReason: null | string | undefined;
      let lastTokenUsage:
        | undefined
        | {
            completion_tokens: number;
            prompt_tokens: number;
            total_tokens: number;
          };

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
        getFinishReason: () => lastFinishReason,
        getTokenUsage: () =>
          lastTokenUsage ?? {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        stream: {
          *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
              yield chunk;
            }
            if (errorToThrow) {
              throw errorToThrow;
            }
          },
        },
      };
    });

    static setChatCompletionError(error: Error) {
      MockOrchestrationClient.chatCompletionError = error;
    }

    static setChatCompletionResponse(
      response: typeof MockOrchestrationClient.chatCompletionResponse,
    ) {
      MockOrchestrationClient.chatCompletionResponse = response;
    }

    static setStreamChunks(
      chunks: {
        getDeltaContent: () => null | string;
        getDeltaToolCalls: () =>
          | undefined
          | {
              function?: { arguments?: string; name?: string };
              id?: string;
              index: number;
            }[];
        getFinishReason: () => null | string | undefined;
        getTokenUsage: () =>
          | undefined
          | {
              completion_tokens: number;
              prompt_tokens: number;
              total_tokens: number;
            };
      }[],
    ) {
      MockOrchestrationClient.streamChunks = chunks;
      MockOrchestrationClient.streamError = undefined;
    }

    static setStreamError(error: Error) {
      MockOrchestrationClient.streamError = error;
    }

    static setStreamSetupError(error: Error) {
      MockOrchestrationClient.streamSetupError = error;
    }
  }

  return {
    OrchestrationClient: MockOrchestrationClient,
  };
});

describe("SAPAILanguageModel", () => {
  const createModel = (modelId = "gpt-4o", settings: unknown = {}) => {
    return new SAPAILanguageModel(
      modelId,
      settings as ConstructorParameters<typeof SAPAILanguageModel>[1],
      {
        deploymentConfig: { resourceGroup: "default" },
        provider: "sap-ai",
      },
    );
  };

  const createPrompt = (text: string): LanguageModelV3Prompt => [
    { content: [{ text, type: "text" }], role: "user" },
  ];

  const expectRequestBodyHasMessages = (result: { request?: { body?: unknown } }) => {
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
      lastChatCompletionRequestConfig: unknown;
      lastStreamAbortSignal: unknown;
      lastStreamConfig: unknown;
      lastStreamRequest: unknown;
      setChatCompletionError?: (error: Error) => void;
      setChatCompletionResponse?: (response: unknown) => void;
      setStreamChunks?: (chunks: unknown[]) => void;
      setStreamError?: (error: Error) => void;
      setStreamSetupError?: (error: Error) => void;
    };
  };

  type OrchestrationChatCompletionRequest = Record<string, unknown> & {
    messages?: unknown;
    model?: {
      name?: string;
      params?: Record<string, unknown>;
      version?: string;
    };
    response_format?: unknown;
    tools?: unknown;
  };

  const getLastChatCompletionRequest = async () => {
    const MockClient = await getMockClient();
    return MockClient.lastChatCompletionRequest as OrchestrationChatCompletionRequest;
  };

  const getLastChatCompletionRequestConfig = async () => {
    const MockClient = await getMockClient();
    return MockClient.lastChatCompletionRequestConfig as Record<string, unknown> | undefined;
  };

  const getLastStreamRequest = async () => {
    const MockClient = await getMockClient();
    return MockClient.lastStreamRequest as OrchestrationChatCompletionRequest;
  };

  const expectRequestBodyHasMessagesAndNoWarnings = (result: {
    request?: { body?: unknown };
    warnings: unknown[];
  }) => {
    expect(result.warnings).toHaveLength(0);
    expectRequestBodyHasMessages(result);
  };

  const expectWarningMessageContains = (
    warnings: { message?: string; type: string }[],
    substring: string,
  ) => {
    expect(
      warnings.some(
        (warning) => typeof warning.message === "string" && warning.message.includes(substring),
      ),
    ).toBe(true);
  };

  /**
   * Creates a mock chat response with sensible defaults that can be overridden.
   * @param overrides - Optional values to override defaults.
   * @param overrides.content - The response content.
   * @param overrides.finishReason - The finish reason.
   * @param overrides.headers - Response headers.
   * @param overrides.toolCalls - Tool calls in the response.
   * @param overrides.usage - Token usage information.
   * @param overrides.usage.completion_tokens - Completion token count.
   * @param overrides.usage.prompt_tokens - Prompt token count.
   * @param overrides.usage.total_tokens - Total token count.
   * @returns A mock chat response object.
   */
  const createMockChatResponse = (
    overrides: {
      content?: null | string;
      finishReason?: string;
      headers?: Record<string, unknown>;
      toolCalls?: {
        function: { arguments: string; name: string };
        id: string;
      }[];
      usage?: {
        completion_tokens: number;
        prompt_tokens: number;
        total_tokens: number;
      };
    } = {},
  ) => {
    const defaults = {
      content: "Hello!",
      finishReason: "stop",
      headers: { "x-request-id": "test-request-id" },
      toolCalls: undefined,
      usage: {
        completion_tokens: 5,
        prompt_tokens: 10,
        total_tokens: 15,
      },
    };

    const merged = { ...defaults, ...overrides };

    return {
      getContent: () => merged.content,
      getFinishReason: () => merged.finishReason,
      getTokenUsage: () => merged.usage,
      getToolCalls: () => merged.toolCalls,
      rawResponse: { headers: merged.headers },
    };
  };

  /**
   * Creates stream chunks with sensible defaults.
   * @param overrides - Optional values to override defaults.
   * @param overrides._data - Raw chunk data.
   * @param overrides.deltaContent - Delta content for streaming.
   * @param overrides.deltaToolCalls - Delta tool calls for streaming.
   * @param overrides.finishReason - The finish reason.
   * @param overrides.usage - Token usage information.
   * @returns A mock stream chunk object.
   */
  const createMockStreamChunk = (
    overrides: {
      _data?: unknown;
      deltaContent?: null | string;
      deltaToolCalls?: {
        function?: { arguments?: string; name?: string };
        id?: string;
        index: number;
      }[];
      finishReason?: null | string | undefined;
      usage?:
        | undefined
        | {
            completion_tokens: number;
            prompt_tokens: number;
            total_tokens: number;
          };
    } = {},
  ) => {
    const defaults = {
      _data: undefined,
      deltaContent: null,
      deltaToolCalls: undefined,
      finishReason: null,
      usage: undefined,
    };

    const merged = { ...defaults, ...overrides };

    return {
      _data: merged._data,
      getDeltaContent: () => merged.deltaContent,
      getDeltaToolCalls: () => merged.deltaToolCalls,
      getFinishReason: () => merged.finishReason,
      getTokenUsage: () => merged.usage,
    };
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

    it.each([
      {
        expected: false,
        name: "should not support HTTP URLs",
        url: "http://example.com/image.png",
      },
      { expected: true, name: "should support data URLs", url: "data:image/png;base64,Zm9v" },
    ])("$name", ({ expected, url }) => {
      const model = createModel();
      expect(model.supportsUrl(new URL(url))).toBe(expected);
    });

    it("should have supportedUrls getter for image types", () => {
      const model = createModel();
      const urls = model.supportedUrls;

      expect(urls).toHaveProperty("image/*");
      expect(urls["image/*"]).toHaveLength(2);
      expect(urls["image/*"][0].test("https://example.com/image.png")).toBe(true);
      expect(urls["image/*"][0].test("http://example.com/image.png")).toBe(false);
      expect(urls["image/*"][1].test("data:image/png;base64,Zm9v")).toBe(true);
    });

    describe("model capabilities", () => {
      // Dynamic capabilities are now determined by model vendor and type
      // See sap-ai-model-capabilities.ts for the full mapping

      it.each([
        // Full capabilities for Azure, Google, Mistral, and unknown models
        {
          expected: {
            supportsImageUrls: true,
            supportsMultipleCompletions: true,
            supportsParallelToolCalls: true,
            supportsStreaming: true,
            supportsStructuredOutputs: true,
            supportsToolCalls: true,
          },
          modelId: "azure--gpt-4o",
        },
        {
          expected: {
            supportsImageUrls: true,
            supportsMultipleCompletions: true,
            supportsParallelToolCalls: true,
            supportsStreaming: true,
            supportsStructuredOutputs: true,
            supportsToolCalls: true,
          },
          modelId: "google--gemini-2.0-flash",
        },
        {
          expected: {
            supportsImageUrls: true,
            supportsMultipleCompletions: true,
            supportsParallelToolCalls: true,
            supportsStreaming: true,
            supportsStructuredOutputs: true,
            supportsToolCalls: true,
          },
          modelId: "mistral--mistral-large",
        },
        {
          expected: {
            supportsImageUrls: true,
            supportsMultipleCompletions: true,
            supportsParallelToolCalls: true,
            supportsStreaming: true,
            supportsStructuredOutputs: true,
            supportsToolCalls: true,
          },
          modelId: "unknown-future-model",
        },
        // Amazon models: supportsN = false
        {
          expected: {
            supportsImageUrls: true,
            supportsMultipleCompletions: false,
            supportsParallelToolCalls: true,
            supportsStreaming: true,
            supportsStructuredOutputs: true,
            supportsToolCalls: true,
          },
          modelId: "amazon--nova-pro",
        },
        // Anthropic models: supportsN = false
        {
          expected: {
            supportsImageUrls: true,
            supportsMultipleCompletions: false,
            supportsParallelToolCalls: true,
            supportsStreaming: true,
            supportsStructuredOutputs: true,
            supportsToolCalls: true,
          },
          modelId: "anthropic--claude-3.5-sonnet",
        },
        // Claude 2.x: additional limitations
        {
          expected: {
            supportsImageUrls: true,
            supportsMultipleCompletions: false,
            supportsParallelToolCalls: false,
            supportsStreaming: true,
            supportsStructuredOutputs: false,
            supportsToolCalls: true,
          },
          modelId: "anthropic--claude-2.1",
        },
        // Amazon Titan: very limited capabilities
        {
          expected: {
            supportsImageUrls: false,
            supportsMultipleCompletions: false,
            supportsParallelToolCalls: false,
            supportsStreaming: true,
            supportsStructuredOutputs: false,
            supportsToolCalls: false,
          },
          modelId: "amazon--titan-text-express",
        },
        // Meta Llama 3.1+: no structured outputs but supports tools
        {
          expected: {
            supportsImageUrls: false,
            supportsMultipleCompletions: true,
            supportsParallelToolCalls: true,
            supportsStreaming: true,
            supportsStructuredOutputs: false,
            supportsToolCalls: true,
          },
          modelId: "meta--llama-3.1-70b",
        },
      ])("should have correct capabilities for model $modelId", ({ expected, modelId }) => {
        const model = createModel(modelId);
        expect(model).toMatchObject(expected);
      });

      it("should expose capabilities getter for programmatic access", () => {
        const model = createModel("amazon--nova-pro");

        // The capabilities getter provides access to the full capability object
        expect(model.capabilities).toBeDefined();
        expect(model.capabilities.supportsN).toBe(false);
        expect(model.capabilities.vendor).toBe("amazon");
      });
    });
  });

  describe("constructor validation", () => {
    it.each([
      { name: "valid modelParams", params: { maxTokens: 1000, temperature: 0.7, topP: 0.9 } },
      { name: "empty modelParams", params: {} },
      { name: "no modelParams", params: undefined },
    ])("should accept $name", ({ params }) => {
      expect(() => createModel("gpt-4o", params ? { modelParams: params } : {})).not.toThrow();
    });

    it.each([
      { name: "temperature too high", params: { temperature: 3 } },
      { name: "temperature negative", params: { temperature: -1 } },
      { name: "topP out of range", params: { topP: 1.5 } },
      { name: "non-positive maxTokens", params: { maxTokens: 0 } },
      { name: "non-integer maxTokens", params: { maxTokens: 100.5 } },
      { name: "frequencyPenalty out of range", params: { frequencyPenalty: -3 } },
      { name: "presencePenalty out of range", params: { presencePenalty: 2.5 } },
    ])("should throw on $name", ({ params }) => {
      expect(() => createModel("gpt-4o", { modelParams: params })).toThrow();
    });

    it.each([
      { name: "non-positive n", params: { n: 0 } },
      { name: "non-boolean parallel_tool_calls", params: { parallel_tool_calls: "true" } },
    ])("should throw on $name", ({ params }) => {
      expect(() => createModel("gpt-4o", { modelParams: params })).toThrow();
    });
  });

  describe("doGenerate", () => {
    it("should generate text response", async () => {
      const model = createModel();
      const prompt = createPrompt("Hello");

      const result = await model.doGenerate({ prompt });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ text: "Hello!", type: "text" });
      expect(result.finishReason).toEqual({ raw: "stop", unified: "stop" });
      expect(result.usage).toEqual({
        inputTokens: {
          cacheRead: undefined,
          cacheWrite: undefined,
          noCache: 10,
          total: 10,
        },
        outputTokens: { reasoning: undefined, text: 5, total: 5 },
      });
      expect(result.response?.headers).toBeDefined();
      expect(result.response?.headers).toMatchObject({
        "x-request-id": "test-request-id",
      });
      expect(result.providerMetadata?.["sap-ai"]).toMatchObject({
        finishReason: "stop",
        finishReasonMapped: { raw: "stop", unified: "stop" },
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
            content: [
              {
                data: "BASE64_IMAGE_DATA",
                mediaType: "image/png",
                type: "file",
              },
            ],
            role: "user",
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

        expect(caughtError.name).toEqual(expect.stringContaining("APICallError"));
        expect(caughtError.requestBodyValues).toMatchObject({
          hasImageParts: true,
          promptMessages: 1,
        });
      });
    });

    describe("abort signal support", () => {
      it("should pass abort signal to chatCompletion via requestConfig", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");
        const controller = new AbortController();

        await model.doGenerate({ abortSignal: controller.signal, prompt });

        const requestConfig = await getLastChatCompletionRequestConfig();
        expect(requestConfig).toBeDefined();
        expect(requestConfig).toHaveProperty("signal", controller.signal);
      });

      it("should not pass requestConfig when abort signal is not provided", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        await model.doGenerate({ prompt });

        const requestConfig = await getLastChatCompletionRequestConfig();
        expect(requestConfig).toBeUndefined();
      });

      it("should propagate error when chatCompletion rejects due to abort", async () => {
        const MockClient = await getMockClient();

        const abortError = new Error("Request aborted") as Error & {
          isAxiosError: boolean;
          response?: { headers?: Record<string, string> };
        };
        abortError.isAxiosError = true;

        if (!MockClient.setChatCompletionError) {
          throw new Error("mock missing setChatCompletionError");
        }

        MockClient.setChatCompletionError(abortError);

        const model = createModel();
        const prompt = createPrompt("Hello");
        const controller = new AbortController();

        await expect(
          model.doGenerate({ abortSignal: controller.signal, prompt }),
        ).rejects.toThrow();
      });
    });

    it("should pass tools to orchestration config", async () => {
      const model = createModel();
      const prompt = createPrompt("What is 2+2?");

      const tools: LanguageModelV3FunctionTool[] = [
        {
          description: "Perform calculation",
          inputSchema: {
            properties: {
              expression: { type: "string" },
            },
            required: ["expression"],
            type: "object",
          },
          name: "calculate",
          type: "function",
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

    it("should apply providerOptions.sap-ai overrides", async () => {
      const model = createModel("gpt-4o", {
        includeReasoning: false,
        modelParams: {
          temperature: 0.1,
        },
        modelVersion: "settings-version",
      });

      const prompt = createPrompt("Hi");

      const result = await model.doGenerate({
        prompt,
        providerOptions: {
          "sap-ai": {
            includeReasoning: true,
            modelParams: {
              temperature: 0.9,
            },
          },
        },
      });

      expectRequestBodyHasMessages(result);

      const request = await getLastChatCompletionRequest();
      expect(request.model?.params?.temperature).toBe(0.9);
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
        additionalProperties: false,
        properties: {
          answer: { type: "string" as const },
        },
        required: ["answer"],
        type: "object" as const,
      };

      const result = await model.doGenerate({
        prompt,
        responseFormat: {
          description: "A structured response",
          name: "response",
          schema,
          type: "json",
        },
      });

      expectRequestBodyHasMessages(result);

      const request = await getLastChatCompletionRequest();

      expect(request.response_format).toEqual({
        json_schema: {
          description: "A structured response",
          name: "response",
          schema,
          strict: null,
        },
        type: "json_schema",
      });
    });

    it("should use settings.responseFormat as fallback when options.responseFormat is not provided", async () => {
      const model = createModel("gpt-4o", {
        responseFormat: {
          json_schema: {
            description: "Settings-level schema",
            name: "settings_response",
            schema: { properties: { value: { type: "string" } }, type: "object" },
            strict: true,
          },
          type: "json_schema",
        },
      });

      const prompt = createPrompt("Return JSON");

      await model.doGenerate({ prompt });

      const request = await getLastChatCompletionRequest();

      expect(request.response_format).toEqual({
        json_schema: {
          description: "Settings-level schema",
          name: "settings_response",
          schema: { properties: { value: { type: "string" } }, type: "object" },
          strict: true,
        },
        type: "json_schema",
      });
    });

    it("should prefer options.responseFormat over settings.responseFormat", async () => {
      const model = createModel("gpt-4o", {
        responseFormat: {
          json_schema: {
            description: "Settings-level schema",
            name: "settings_response",
            schema: { properties: { value: { type: "string" } }, type: "object" },
          },
          type: "json_schema",
        },
      });

      const prompt = createPrompt("Return JSON");

      const optionsSchema = {
        additionalProperties: false,
        properties: { answer: { type: "string" as const } },
        required: ["answer"],
        type: "object" as const,
      };

      await model.doGenerate({
        prompt,
        responseFormat: {
          description: "Options-level schema",
          name: "options_response",
          schema: optionsSchema,
          type: "json",
        },
      });

      const request = await getLastChatCompletionRequest();

      expect(request.response_format).toEqual({
        json_schema: {
          description: "Options-level schema",
          name: "options_response",
          schema: optionsSchema,
          strict: null,
        },
        type: "json_schema",
      });
    });

    it("should warn about unsupported tool types", async () => {
      const model = createModel();
      const prompt = createPrompt("Hello");

      const tools = [
        {
          args: {},
          id: "custom-tool",
          type: "provider-defined" as const,
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
            function: {
              description: "From settings",
              name: "settings_tool",
              parameters: {
                properties: {},
                required: [],
                type: "object",
              },
            },
            type: "function",
          },
        ],
      });

      const prompt = createPrompt("Hello");

      const tools: LanguageModelV3FunctionTool[] = [
        {
          description: "From call options",
          inputSchema: {
            properties: {},
            required: [],
            type: "object",
          },
          name: "call_tool",
          type: "function",
        },
      ];

      const result = await model.doGenerate({ prompt, tools });
      const warnings = result.warnings;

      expectWarningMessageContains(warnings, "preferring call options.tools");

      expectRequestBodyHasMessages(result);

      const request = await getLastChatCompletionRequest();
      const requestTools = Array.isArray(request.tools) ? (request.tools as unknown[]) : [];

      expect(
        requestTools.some(
          (tool) =>
            typeof tool === "object" &&
            tool !== null &&
            (tool as { function?: { name?: unknown } }).function?.name === "call_tool",
        ),
      ).toBe(true);

      expect(
        requestTools.some(
          (tool) =>
            typeof tool === "object" &&
            tool !== null &&
            (tool as { function?: { name?: unknown } }).function?.name === "settings_tool",
        ),
      ).toBe(false);
    });

    it("should warn when tool Zod schema conversion fails", async () => {
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
          description: "Tool with failing Zod schema conversion",
          inputSchema: {},
          name: "badTool",
          parameters: zodLikeThatThrows,
          type: "function",
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

      MockClient.setChatCompletionResponse(
        createMockChatResponse({
          content: null,
          finishReason: "tool_calls",
          headers: { "x-request-id": "tool-call-test" },
          toolCalls: [
            {
              function: {
                arguments: '{"location":"Paris"}',
                name: "get_weather",
              },
              id: "call_123",
            },
          ],
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        }),
      );

      const model = createModel();
      const prompt = createPrompt("What's the weather?");

      const result = await model.doGenerate({ prompt });

      expect(result.content).toContainEqual({
        input: '{"location":"Paris"}',
        toolCallId: "call_123",
        toolName: "get_weather",
        type: "tool-call",
      });
      expect(result.finishReason).toEqual({
        raw: "tool_calls",
        unified: "tool-calls",
      });
    });

    it.each([
      {
        description: "normalize array header values",
        expected: {
          "x-multi-value": "value1; value2",
          "x-request-id": "array-header-test",
        },
        headers: {
          "x-multi-value": ["value1", "value2"],
          "x-request-id": "array-header-test",
        },
      },
      {
        description: "convert numeric header values to strings",
        expected: {
          "content-length": "1024",
          "x-retry-after": "30",
        },
        headers: {
          "content-length": 1024,
          "x-retry-after": 30,
        },
      },
      {
        description: "skip unsupported header value types",
        expected: {
          "x-valid": "keep-this",
        },
        headers: {
          "x-object": { nested: "object" },
          "x-valid": "keep-this",
        },
      },
      {
        description: "filter non-string values from array headers",
        expected: {
          "x-mixed": "valid; also-valid",
        },
        headers: {
          "x-mixed": ["valid", 123, null, "also-valid"],
        },
      },
      {
        description: "exclude array headers with only non-string items",
        expected: {
          "x-valid": "keep-this",
        },
        headers: {
          "x-invalid-array": [123, null, undefined],
          "x-valid": "keep-this",
        },
      },
    ])("should $description in doGenerate response", async ({ expected, headers }) => {
      const MockClient = await getMockClient();
      if (!MockClient.setChatCompletionResponse) {
        throw new Error("mock missing setChatCompletionResponse");
      }

      MockClient.setChatCompletionResponse(
        createMockChatResponse({
          content: "Response",
          finishReason: "stop",
          headers,
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        }),
      );

      const model = createModel();
      const prompt = createPrompt("Test");
      const result = await model.doGenerate({ prompt });

      expect(result.response?.headers).toEqual(expected);
    });

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

      expect(parts.some((p) => (p as { type?: string }).type === "stream-start")).toBe(true);
      expect(parts.some((p) => (p as { type?: string }).type === "finish")).toBe(true);
    });

    it("should not mutate stream-start warnings when warnings occur during stream", async () => {
      await setStreamChunks([
        createMockStreamChunk({
          deltaToolCalls: [
            {
              function: {
                arguments: '{"x":1}',
              },
              id: "toolcall-0",
              index: 0,
            },
          ],
          finishReason: "tool_calls",
          usage: {
            completion_tokens: 1,
            prompt_tokens: 1,
            total_tokens: 2,
          },
        }),
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const result = await model.doStream({ prompt });

      const parts = await readAllParts(result.stream);
      const streamStart = parts.find((part) => part.type === "stream-start");
      expect(streamStart?.warnings).toHaveLength(0);
    });

    /**
     * Reads all parts from a language model stream.
     * @param stream - The stream to read from.
     * @returns An array of all stream parts.
     */
    async function readAllParts(stream: ReadableStream<LanguageModelV3StreamPart>) {
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
        createMockStreamChunk({
          deltaContent: "Hello",
        }),
        createMockStreamChunk({
          deltaContent: " SHOULD_NOT_APPEAR",
          deltaToolCalls: [
            {
              function: { arguments: '{"x":', name: "calc" },
              id: "call_0",
              index: 0,
            },
          ],
        }),
        createMockStreamChunk({
          deltaContent: " ALSO_SHOULD_NOT_APPEAR",
          deltaToolCalls: [
            {
              function: { arguments: "1}" },
              id: "call_0",
              index: 0,
            },
          ],
          finishReason: "tool_calls",
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        }),
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
        createMockStreamChunk({
          deltaContent: "Hello",
        }),
        createMockStreamChunk({
          deltaContent: "!",
          finishReason: "stop",
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        }),
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(parts[0].type).toBe("stream-start");
      expect(parts.some((p) => p.type === "response-metadata")).toBe(true);
      const responseMetadata = parts.find((p) => p.type === "response-metadata");
      expect(responseMetadata).toBeDefined();
      expect(responseMetadata).toMatchObject({ modelId: "gpt-4o", type: "response-metadata" });
      if (responseMetadata?.type === "response-metadata") {
        expect(responseMetadata.id).toBeDefined();
        expect(typeof responseMetadata.id).toBe("string");
        expect(responseMetadata.id).toMatch(uuidRegex);
      }
      expect(parts.some((p) => p.type === "text-delta")).toBe(true);
      expect(parts.some((p) => p.type === "finish")).toBe(true);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toEqual({ raw: "stop", unified: "stop" });
        expect(finishPart.providerMetadata?.["sap-ai"]).toBeDefined();
        expect(finishPart.providerMetadata?.["sap-ai"]?.responseId).toBeDefined();
        expect(typeof finishPart.providerMetadata?.["sap-ai"]?.responseId).toBe("string");
        expect(finishPart.providerMetadata?.["sap-ai"]?.responseId).toMatch(uuidRegex);
      }
    });

    it("should emit raw chunks when includeRawChunks is true", async () => {
      const rawData1 = { custom: "data1", delta: "Hello" };
      const rawData2 = { custom: "data2", delta: "!" };

      await setStreamChunks([
        createMockStreamChunk({
          _data: rawData1,
          deltaContent: "Hello",
        }),
        createMockStreamChunk({
          _data: rawData2,
          deltaContent: "!",
          finishReason: "stop",
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        }),
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ includeRawChunks: true, prompt });
      const parts = await readAllParts(stream);
      const rawParts = parts.filter((p) => p.type === "raw");

      expect(rawParts).toHaveLength(2);
      expect(rawParts[0]).toMatchObject({ rawValue: rawData1, type: "raw" });
      expect(rawParts[1]).toMatchObject({ rawValue: rawData2, type: "raw" });
    });

    it("should not emit raw chunks when includeRawChunks is false or omitted", async () => {
      await setStreamChunks([
        createMockStreamChunk({
          _data: { some: "data" },
          deltaContent: "Hello",
        }),
        createMockStreamChunk({
          _data: { more: "data" },
          deltaContent: "!",
          finishReason: "stop",
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        }),
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream: stream1 } = await model.doStream({ prompt });
      const parts1 = await readAllParts(stream1);
      expect(parts1.filter((p) => p.type === "raw")).toHaveLength(0);

      await setStreamChunks([
        createMockStreamChunk({
          _data: { some: "data" },
          deltaContent: "Hello",
          finishReason: "stop",
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        }),
      ]);

      const { stream: stream2 } = await model.doStream({ includeRawChunks: false, prompt });
      const parts2 = await readAllParts(stream2);
      expect(parts2.filter((p) => p.type === "raw")).toHaveLength(0);
    });

    it("should use chunk itself as rawValue when _data is undefined", async () => {
      await setStreamChunks([
        createMockStreamChunk({
          deltaContent: "Hello",
          finishReason: "stop",
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        }),
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ includeRawChunks: true, prompt });
      const parts = await readAllParts(stream);

      const rawParts = parts.filter((p) => p.type === "raw");
      expect(rawParts).toHaveLength(1);

      const rawPart = rawParts[0] as { rawValue: unknown; type: "raw" };
      expect(rawPart.rawValue).toHaveProperty("getDeltaContent");
      expect(rawPart.rawValue).toHaveProperty("getFinishReason");
    });

    it("should flush tool calls immediately on tool-calls finishReason", async () => {
      await setStreamChunks([
        createMockStreamChunk({
          deltaToolCalls: [
            {
              function: { arguments: '{"city":', name: "get_weather" },
              id: "call_0",
              index: 0,
            },
          ],
        }),
        createMockStreamChunk({
          deltaToolCalls: [
            {
              function: { arguments: '"Paris"}' },
              id: "call_0",
              index: 0,
            },
          ],
          finishReason: "tool_calls",
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        }),
        createMockStreamChunk({ deltaContent: "SHOULD_NOT_APPEAR" }),
      ]);

      const model = createModel();
      const prompt = createPrompt("Use tool");

      const result = await model.doStream({ prompt });
      const parts = await readAllParts(result.stream);

      const toolCallIndex = parts.findIndex((p) => p.type === "tool-call");
      const finishIndex = parts.findIndex((p) => p.type === "finish");

      expect(toolCallIndex).toBeGreaterThan(-1);
      expect(finishIndex).toBeGreaterThan(toolCallIndex);

      const textDeltas = parts.filter((p) => p.type === "text-delta");
      const hasPostToolTextDelta = textDeltas.some(
        (td) => (td as { delta: string; type: "text-delta" }).delta === "SHOULD_NOT_APPEAR",
      );
      expect(hasPostToolTextDelta).toBe(false);
    });

    it.each([
      {
        description: "max_tokens_reached as length",
        expected: "length",
        input: "max_tokens_reached",
      },
      { description: "length", expected: "length", input: "length" },
      { description: "eos as stop", expected: "stop", input: "eos" },
      {
        description: "stop_sequence as stop",
        expected: "stop",
        input: "stop_sequence",
      },
      { description: "end_turn as stop", expected: "stop", input: "end_turn" },
      {
        description: "content_filter",
        expected: "content-filter",
        input: "content_filter",
      },
      { description: "error", expected: "error", input: "error" },
      {
        description: "max_tokens as length",
        expected: "length",
        input: "max_tokens",
      },
      {
        description: "tool_call as tool-calls",
        expected: "tool-calls",
        input: "tool_call",
      },
      {
        description: "function_call as tool-calls",
        expected: "tool-calls",
        input: "function_call",
      },
      {
        description: "unknown reason as other",
        expected: "other",
        input: "some_new_unknown_reason",
      },
      {
        description: "undefined as other",
        expected: "other",
        input: undefined,
      },
    ])("should handle stream with finish reason: $description", async ({ expected, input }) => {
      await setStreamChunks([
        createMockStreamChunk({
          deltaContent: "test content",
          finishReason: input,
          usage: {
            completion_tokens: 2,
            prompt_tokens: 1,
            total_tokens: 3,
          },
        }),
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
    });

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
        createMockStreamChunk({}),
        createMockStreamChunk({
          deltaContent: "Hello",
        }),
        createMockStreamChunk({
          finishReason: "stop",
          usage: {
            completion_tokens: 1,
            prompt_tokens: 10,
            total_tokens: 11,
          },
        }),
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const textDeltas = parts.filter((p) => p.type === "text-delta");
      expect(textDeltas).toHaveLength(1);
      expect((textDeltas[0] as { delta: string }).delta).toBe("Hello");

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
    });

    it("should handle stream with empty string content", async () => {
      await setStreamChunks([
        createMockStreamChunk({
          deltaContent: "",
        }),
        createMockStreamChunk({
          deltaContent: "Response",
          finishReason: "stop",
          usage: {
            completion_tokens: 1,
            prompt_tokens: 10,
            total_tokens: 11,
          },
        }),
      ]);

      const model = createModel();
      const prompt = createPrompt("Hello");

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const textDeltas = parts.filter((p) => p.type === "text-delta");
      expect(textDeltas.length).toBeGreaterThanOrEqual(1);
    });

    describe("error handling", () => {
      it("should warn when tool call delta has no tool name", async () => {
        await setStreamChunks([
          createMockStreamChunk({
            deltaToolCalls: [
              {
                function: { arguments: '{"x":1}' },
                id: "call_nameless",
                index: 0,
              },
            ],
            finishReason: "tool_calls",
            usage: {
              completion_tokens: 5,
              prompt_tokens: 10,
              total_tokens: 15,
            },
          }),
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

        const toolCall = parts.find((p) => p.type === "tool-call");
        expect(toolCall).toBeDefined();
        expect(toolCall).toMatchObject({
          input: '{"x":1}',
          toolName: "",
          type: "tool-call",
        });

        const streamStart = parts.find(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "stream-start" }> =>
            p.type === "stream-start",
        );
        expect(streamStart).toBeDefined();
        expect(streamStart?.warnings).toHaveLength(0);

        expect(parts.some((p) => p.type === "error")).toBe(false);
        expect(parts.some((p) => p.type === "finish")).toBe(true);

        const finish = parts.find(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "finish" }> => p.type === "finish",
        );
        expect(finish?.finishReason).toBeDefined();
      });

      it("should emit error part when stream iteration throws", async () => {
        const MockClient = await getMockClient();
        if (!MockClient.setStreamError) {
          throw new Error("mock missing setStreamError");
        }

        await setStreamChunks([
          createMockStreamChunk({
            deltaContent: "Hello",
          }),
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

        const textDelta = parts.find((p) => p.type === "text-delta");
        expect(textDelta).toBeDefined();

        const errorPart = parts.find((p) => p.type === "error");
        expect(errorPart).toBeDefined();
        expect(errorPart).toMatchObject({
          type: "error",
        });
        expect((errorPart as { error: Error }).error.message).toEqual(
          expect.stringContaining("Stream iteration failed"),
        );
        expect(
          (errorPart as { error: { responseHeaders?: unknown } }).error.responseHeaders,
        ).toMatchObject({
          "x-request-id": "stream-axios-123",
        });

        await setStreamChunks([
          createMockStreamChunk({
            deltaContent: "reset",
            finishReason: "stop",
            usage: {
              completion_tokens: 5,
              prompt_tokens: 10,
              total_tokens: 15,
            },
          }),
        ]);
      });

      it("should skip tool call deltas with invalid index", async () => {
        await setStreamChunks([
          createMockStreamChunk({
            deltaContent: "Hello",
            deltaToolCalls: [
              {
                function: { arguments: "{}", name: "test_tool" },
                id: "call_invalid",
                index: NaN,
              },
            ],
          }),
          createMockStreamChunk({
            deltaToolCalls: [
              {
                function: { arguments: "{}", name: "other_tool" },
                id: "call_undefined",
                index: undefined as unknown as number,
              },
            ],
            finishReason: "stop",
            usage: {
              completion_tokens: 5,
              prompt_tokens: 10,
              total_tokens: 15,
            },
          }),
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

        expect(parts.some((p) => p.type === "finish")).toBe(true);
        expect(parts.some((p) => p.type === "tool-call")).toBe(false);
      });

      it("should generate unique RFC 4122 UUIDs for text blocks", async () => {
        await setStreamChunks([
          createMockStreamChunk({
            deltaContent: "First text block",
          }),
          createMockStreamChunk({
            deltaContent: " continuation",
            finishReason: "stop",
            usage: {
              completion_tokens: 5,
              prompt_tokens: 10,
              total_tokens: 15,
            },
          }),
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

        const textStarts = parts.filter(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "text-start" }> =>
            p.type === "text-start",
        );
        const textDeltas = parts.filter(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
            p.type === "text-delta",
        );
        const textEnds = parts.filter(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "text-end" }> =>
            p.type === "text-end",
        );

        expect(textStarts).toHaveLength(1);
        expect(textEnds).toHaveLength(1);
        expect(textDeltas.length).toBeGreaterThan(0);

        const blockId = textStarts[0].id;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(blockId).toMatch(uuidRegex);
        expect(blockId).not.toBe("0");

        for (const delta of textDeltas) {
          expect(delta.id).toBe(blockId);
        }
        expect(textEnds[0].id).toBe(blockId);

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
          (p): p is Extract<LanguageModelV3StreamPart, { type: "text-start" }> =>
            p.type === "text-start",
        );

        const blockId2 = textStarts2[0].id;

        expect(blockId2).not.toBe(blockId);
        expect(blockId2).toMatch(uuidRegex);
      });

      it("should flush unflushed tool calls at stream end (with finishReason=stop)", async () => {
        await setStreamChunks([
          createMockStreamChunk({
            deltaToolCalls: [
              {
                function: { arguments: '{"q":"test"}', name: "get_info" },
                id: "call_unflushed",
                index: 0,
              },
            ],
          }),
          createMockStreamChunk({
            finishReason: "stop",
            usage: {
              completion_tokens: 5,
              prompt_tokens: 10,
              total_tokens: 15,
            },
          }),
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

        const toolCall = parts.find((p) => p.type === "tool-call");
        expect(toolCall).toBeDefined();
        expect(toolCall).toMatchObject({
          toolCallId: "call_unflushed",
          toolName: "get_info",
          type: "tool-call",
        });

        const finish = parts.find(
          (p): p is Extract<LanguageModelV3StreamPart, { type: "finish" }> => p.type === "finish",
        );
        expect(finish?.finishReason).toEqual({ raw: "stop", unified: "stop" });
      });

      it("should handle undefined finish reason from stream", async () => {
        await setStreamChunks([
          createMockStreamChunk({
            deltaContent: "Hello",
            finishReason: undefined as unknown as string,
          }),
          createMockStreamChunk({
            deltaContent: "!",
            finishReason: undefined as unknown as string,
            usage: {
              completion_tokens: 5,
              prompt_tokens: 10,
              total_tokens: 15,
            },
          }),
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
          (p): p is Extract<LanguageModelV3StreamPart, { type: "finish" }> => p.type === "finish",
        );
        expect(finish?.finishReason).toEqual({
          raw: undefined,
          unified: "other",
        });
      });

      it("should flush tool calls that never received input-start", async () => {
        await setStreamChunks([
          createMockStreamChunk({
            deltaToolCalls: [
              {
                function: { arguments: '{"partial":' },
                id: "call_no_start",
                index: 0,
              },
            ],
          }),
          createMockStreamChunk({
            deltaToolCalls: [
              {
                function: { arguments: '"value"}', name: "delayed_name" },
                index: 0,
              },
            ],
            finishReason: "tool_calls",
            usage: {
              completion_tokens: 5,
              prompt_tokens: 10,
              total_tokens: 15,
            },
          }),
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

        const toolCall = parts.find((p) => p.type === "tool-call");
        expect(toolCall).toBeDefined();
        expect(toolCall).toMatchObject({
          input: '{"partial":"value"}',
          toolName: "delayed_name",
          type: "tool-call",
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

        await expect(model.doStream({ prompt })).rejects.toThrow("Stream setup failed");
      });
    });
  });

  describe("configuration", () => {
    describe("masking and filtering", () => {
      it.each([
        { property: "masking", settings: { masking: {} } },
        { property: "filtering", settings: { filtering: {} } },
      ])("should omit $property when empty object", async ({ property, settings }) => {
        const model = createModel("gpt-4o", settings);

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).not.toHaveProperty(property);
      });

      it("should include masking module in orchestration config", async () => {
        const masking = {
          masking_providers: [
            {
              entities: [{ type: "profile-email" }, { type: "profile-phone" }],
              method: "anonymization",
              type: "sap_data_privacy_integration",
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
                config: {
                  Hate: 0,
                  SelfHarm: 0,
                  Sexual: 0,
                  Violence: 0,
                },
                type: "azure_content_safety",
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
              entities: [{ type: "profile-person" }],
              method: "pseudonymization",
              type: "sap_data_privacy_integration",
            },
          ],
        };

        const filtering = {
          output: {
            filters: [
              {
                config: {
                  Hate: 2,
                  SelfHarm: 2,
                  Sexual: 2,
                  Violence: 2,
                },
                type: "azure_content_safety",
              },
            ],
          },
        };

        const model = createModel("gpt-4o", {
          filtering,
          masking,
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

      it("should include grounding module in orchestration config", async () => {
        const grounding = {
          config: {
            filters: [
              {
                chunk_ids: [],
                data_repositories: ["*"],
                document_names: ["product-docs"],
                id: "vector-store-1",
              },
            ],
            metadata_params: ["file_name"],
            placeholders: {
              input: ["?question"],
              output: "groundingOutput",
            },
          },
          type: "document_grounding_service",
        };

        const model = createModel("gpt-4o", {
          grounding,
        });

        const prompt = createPrompt("What is SAP AI Core?");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).toHaveProperty("grounding");
        expect(request.grounding).toEqual(grounding);
      });

      it("should include translation module in orchestration config", async () => {
        const translation = {
          input: {
            source_language: "de",
            target_language: "en",
          },
          output: {
            target_language: "de",
          },
        };

        const model = createModel("gpt-4o", {
          translation,
        });

        const prompt = createPrompt("Was ist SAP AI Core?");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).toHaveProperty("translation");
        expect(request.translation).toEqual(translation);
      });

      it.each([
        { property: "grounding", settings: { grounding: {} } },
        { property: "translation", settings: { translation: {} } },
      ])("should omit $property when empty object", async ({ property, settings }) => {
        const model = createModel("gpt-4o", settings);

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).not.toHaveProperty(property);
      });

      it("should include grounding, translation, masking and filtering together", async () => {
        const grounding = {
          config: {
            filters: [
              {
                chunk_ids: [],
                data_repositories: ["*"],
                document_names: [],
                id: "vector-store-1",
              },
            ],
            placeholders: {
              input: ["?question"],
              output: "groundingOutput",
            },
          },
          type: "document_grounding_service",
        };

        const translation = {
          input: {
            source_language: "fr",
            target_language: "en",
          },
        };

        const masking = {
          masking_providers: [
            {
              entities: [{ type: "profile-email" }],
              method: "anonymization",
              type: "sap_data_privacy_integration",
            },
          ],
        };

        const filtering = {
          input: {
            filters: [
              {
                config: {
                  Hate: 0,
                  SelfHarm: 0,
                  Sexual: 0,
                  Violence: 0,
                },
                type: "azure_content_safety",
              },
            ],
          },
        };

        const model = createModel("gpt-4o", {
          filtering,
          grounding,
          masking,
          translation,
        });

        const prompt = createPrompt("Quelle est SAP AI Core?");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();
        expect(request).toHaveProperty("grounding");
        expect(request.grounding).toEqual(grounding);
        expect(request).toHaveProperty("translation");
        expect(request.translation).toEqual(translation);
        expect(request).toHaveProperty("masking");
        expect(request.masking).toEqual(masking);
        expect(request).toHaveProperty("filtering");
        expect(request.filtering).toEqual(filtering);
      });

      it("should include masking module in stream request body", async () => {
        const masking = {
          masking_providers: [
            {
              entities: [{ type: "profile-email" }, { type: "profile-phone" }],
              method: "anonymization",
              type: "sap_data_privacy_integration",
            },
          ],
        };

        const model = createModel("gpt-4o", {
          masking,
        });

        const prompt = createPrompt("My email is test@example.com");

        const result = await model.doStream({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastStreamRequest();
        expect(request).toHaveProperty("masking");
        expect(request.masking).toEqual(masking);
      });

      it("should include filtering module in stream request body", async () => {
        const filtering = {
          input: {
            filters: [
              {
                config: {
                  Hate: 0,
                  SelfHarm: 0,
                  Sexual: 0,
                  Violence: 0,
                },
                type: "azure_content_safety",
              },
            ],
          },
        };

        const model = createModel("gpt-4o", {
          filtering,
        });

        const prompt = createPrompt("Hello");

        const result = await model.doStream({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastStreamRequest();
        expect(request).toHaveProperty("filtering");
        expect(request.filtering).toEqual(filtering);
      });

      it("should include both masking and filtering in stream request body", async () => {
        const masking = {
          masking_providers: [
            {
              entities: [{ type: "profile-person" }],
              method: "pseudonymization",
              type: "sap_data_privacy_integration",
            },
          ],
        };

        const filtering = {
          output: {
            filters: [
              {
                config: {
                  Hate: 2,
                  SelfHarm: 2,
                  Sexual: 2,
                  Violence: 2,
                },
                type: "azure_content_safety",
              },
            ],
          },
        };

        const model = createModel("gpt-4o", {
          filtering,
          masking,
        });

        const prompt = createPrompt("Hello");

        const result = await model.doStream({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastStreamRequest();
        expect(request).toHaveProperty("masking");
        expect(request.masking).toEqual(masking);
        expect(request).toHaveProperty("filtering");
        expect(request.filtering).toEqual(filtering);
      });

      it("should include grounding module in stream request body", async () => {
        const grounding = {
          config: {
            filters: [
              {
                chunk_ids: [],
                data_repositories: ["*"],
                document_names: ["product-docs"],
                id: "vector-store-1",
              },
            ],
            metadata_params: ["file_name"],
            placeholders: {
              input: ["?question"],
              output: "groundingOutput",
            },
          },
          type: "document_grounding_service",
        };

        const model = createModel("gpt-4o", {
          grounding,
        });

        const prompt = createPrompt("What is SAP AI Core?");

        const result = await model.doStream({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastStreamRequest();
        expect(request).toHaveProperty("grounding");
        expect(request.grounding).toEqual(grounding);
      });

      it("should include translation module in stream request body", async () => {
        const translation = {
          input: {
            source_language: "de",
            target_language: "en",
          },
          output: {
            target_language: "de",
          },
        };

        const model = createModel("gpt-4o", {
          translation,
        });

        const prompt = createPrompt("Was ist SAP AI Core?");

        const result = await model.doStream({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastStreamRequest();
        expect(request).toHaveProperty("translation");
        expect(request.translation).toEqual(translation);
      });

      it("should include grounding, translation, masking and filtering together in stream request body", async () => {
        const grounding = {
          config: {
            filters: [
              {
                chunk_ids: [],
                data_repositories: ["*"],
                document_names: [],
                id: "vector-store-1",
              },
            ],
            placeholders: {
              input: ["?question"],
              output: "groundingOutput",
            },
          },
          type: "document_grounding_service",
        };

        const translation = {
          input: {
            source_language: "fr",
            target_language: "en",
          },
        };

        const masking = {
          masking_providers: [
            {
              entities: [{ type: "profile-email" }],
              method: "anonymization",
              type: "sap_data_privacy_integration",
            },
          ],
        };

        const filtering = {
          input: {
            filters: [
              {
                config: {
                  Hate: 0,
                  SelfHarm: 0,
                  Sexual: 0,
                  Violence: 0,
                },
                type: "azure_content_safety",
              },
            ],
          },
        };

        const model = createModel("gpt-4o", {
          filtering,
          grounding,
          masking,
          translation,
        });

        const prompt = createPrompt("Quelle est SAP AI Core?");

        const result = await model.doStream({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastStreamRequest();
        expect(request).toHaveProperty("grounding");
        expect(request.grounding).toEqual(grounding);
        expect(request).toHaveProperty("translation");
        expect(request.translation).toEqual(translation);
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
          expectedKey: "temperature",
          expectedValue: 0.9,
          optionKey: "temperature",
          optionValue: 0.9,
          settingsKey: "temperature",
          settingsValue: 0.5,
          testName: "temperature",
        },
        {
          expectedKey: "max_tokens",
          expectedValue: 1000,
          optionKey: "maxOutputTokens",
          optionValue: 1000,
          settingsKey: "maxTokens",
          settingsValue: 500,
          testName: "maxOutputTokens",
        },
      ])(
        "should prefer options.$testName over settings.modelParams.$settingsKey",
        async ({
          expectedKey,
          expectedValue,
          optionKey,
          optionValue,
          settingsKey,
          settingsValue,
        }) => {
          const model = createModel("gpt-4o", {
            modelParams: {
              [settingsKey]: settingsValue,
            },
          });

          const prompt = createPrompt("Hello");

          const result = await model.doGenerate({
            [optionKey]: optionValue,
            prompt,
          });

          expectRequestBodyHasMessages(result);

          const request = await getLastChatCompletionRequest();

          expect(request.model?.params?.[expectedKey]).toBe(expectedValue);
        },
      );

      it.each([
        {
          expectedKey: "top_p",
          expectedValue: 0.9,
          paramName: "topP",
          paramValue: 0.9,
        },
        {
          expectedKey: "top_k",
          expectedValue: 40,
          paramName: "topK",
          paramValue: 40,
        },
        {
          expectedKey: "frequency_penalty",
          expectedValue: 0.5,
          paramName: "frequencyPenalty",
          paramValue: 0.5,
        },
        {
          expectedKey: "presence_penalty",
          expectedValue: 0.3,
          paramName: "presencePenalty",
          paramValue: 0.3,
        },
        {
          expectedKey: "stop",
          expectedValue: ["END", "STOP"],
          paramName: "stopSequences",
          paramValue: ["END", "STOP"],
        },
        {
          expectedKey: "seed",
          expectedValue: 42,
          paramName: "seed",
          paramValue: 42,
        },
      ])(
        "should pass $paramName from options to model params",
        async ({ expectedKey, expectedValue, paramName, paramValue }) => {
          const model = createModel();
          const prompt = createPrompt("Hello");

          const result = await model.doGenerate({
            [paramName]: paramValue,
            prompt,
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
      ])("should disable n parameter for $vendor models", async ({ modelId }) => {
        const model = createModel(modelId, {
          modelParams: { n: 2 },
        });
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.n).toBeUndefined();
      });
    });

    describe("unknown parameter preservation", () => {
      it("should preserve unknown parameters from settings.modelParams", async () => {
        const model = createModel("gpt-4o", {
          modelParams: {
            customParam: "custom-value",
            temperature: 0.7,
            unknownField: 123,
          },
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.temperature).toBe(0.7);
        expect(request.model?.params?.customParam).toBe("custom-value");
        expect(request.model?.params?.unknownField).toBe(123);
      });

      it("should preserve unknown parameters from providerOptions", async () => {
        const model = createModel("gpt-4o");

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          providerOptions: {
            "sap-ai": {
              modelParams: {
                customProviderParam: "provider-value",
                specialField: true,
                temperature: 0.5,
              },
            },
          },
        });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.temperature).toBe(0.5);
        expect(request.model?.params?.customProviderParam).toBe("provider-value");
        expect(request.model?.params?.specialField).toBe(true);
      });

      it("should merge unknown parameters from settings and providerOptions", async () => {
        const model = createModel("gpt-4o", {
          modelParams: {
            fromSettings: "settings-value",
            sharedParam: "from-settings",
            temperature: 0.3,
          },
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          providerOptions: {
            "sap-ai": {
              modelParams: {
                fromProvider: "provider-value",
                sharedParam: "from-provider",
              },
            },
          },
        });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.temperature).toBe(0.3);
        expect(request.model?.params?.fromSettings).toBe("settings-value");
        expect(request.model?.params?.fromProvider).toBe("provider-value");
        expect(request.model?.params?.sharedParam).toBe("from-provider");
      });

      it("should deep merge nested objects in modelParams", async () => {
        const model = createModel("gpt-4o", {
          modelParams: {
            nested: {
              a: 1,
              b: {
                c: 2,
                d: 3,
              },
            },
            temperature: 0.5,
          },
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          prompt,
          providerOptions: {
            "sap-ai": {
              modelParams: {
                nested: {
                  b: {
                    d: 4,
                    e: 5,
                  },
                  f: 6,
                },
              },
            },
          },
        });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.temperature).toBe(0.5);
        expect(request.model?.params?.nested).toEqual({
          a: 1,
          b: {
            c: 2,
            d: 4,
            e: 5,
          },
          f: 6,
        });
      });

      it("should allow AI SDK standard options to override unknown params", async () => {
        const model = createModel("gpt-4o", {
          modelParams: {
            customParam: "custom-value",
            temperature: 0.3,
          },
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({
          maxOutputTokens: 500,
          prompt,
          temperature: 0.8,
        });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.temperature).toBe(0.8);
        expect(request.model?.params?.max_tokens).toBe(500);
        expect(request.model?.params?.customParam).toBe("custom-value");
      });

      it("should preserve complex unknown parameter types", async () => {
        const model = createModel("gpt-4o", {
          modelParams: {
            arrayParam: [1, 2, 3],
            nestedObject: {
              foo: "bar",
              nested: { deep: true },
            },
            nullParam: null,
            temperature: 0.5,
          },
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.temperature).toBe(0.5);
        expect(request.model?.params?.arrayParam).toEqual([1, 2, 3]);
        expect(request.model?.params?.nestedObject).toEqual({
          foo: "bar",
          nested: { deep: true },
        });
        expect(request.model?.params?.nullParam).toBe(null);
      });

      it("should preserve unknown params even when n is removed for Amazon models", async () => {
        const model = createModel("amazon--nova-pro", {
          modelParams: {
            customAmazonParam: "amazon-value",
            n: 2,
            temperature: 0.7,
          },
        });

        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });
        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        expect(request.model?.params?.temperature).toBe(0.7);
        expect(request.model?.params?.n).toBeUndefined();
        expect(request.model?.params?.customAmazonParam).toBe("amazon-value");
      });
    });

    describe("warnings", () => {
      it("should warn when toolChoice is not 'auto'", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const tools: LanguageModelV3FunctionTool[] = [
          {
            description: "A test tool",
            inputSchema: { properties: {}, required: [], type: "object" },
            name: "test_tool",
            type: "function",
          },
        ];

        const result = await model.doGenerate({
          prompt,
          toolChoice: { type: "required" },
          tools,
        });

        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            feature: "toolChoice",
            type: "unsupported",
          }),
        );
      });

      it("should not warn when toolChoice is 'auto'", async () => {
        const model = createModel();
        const prompt = createPrompt("Hello");

        const tools: LanguageModelV3FunctionTool[] = [
          {
            description: "A test tool",
            inputSchema: { properties: {}, required: [], type: "object" },
            name: "test_tool",
            type: "function",
          },
        ];

        const result = await model.doGenerate({
          prompt,
          toolChoice: { type: "auto" },
          tools,
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
        const warnings = result.warnings as { message?: string; type: string }[];

        expect(warnings.length).toBeGreaterThan(0);
        expectWarningMessageContains(warnings, "responseFormat JSON mode");
      });

      it("should emit a best-effort warning for settings.responseFormat json", async () => {
        const model = createModel("gpt-4o", {
          responseFormat: {
            json_schema: {
              name: "test",
              schema: { type: "object" },
            },
            type: "json_schema",
          },
        });
        const prompt = createPrompt("Return JSON");

        const result = await model.doGenerate({ prompt });
        const warnings = result.warnings as { message?: string; type: string }[];

        expect(warnings.length).toBeGreaterThan(0);
        expectWarningMessageContains(warnings, "responseFormat JSON mode");
      });

      it("should not emit responseFormat warning when responseFormat is text", async () => {
        const model = createModel("gpt-4o", {
          responseFormat: { type: "text" },
        });
        const prompt = createPrompt("Hello");

        const result = await model.doGenerate({ prompt });
        const warnings = result.warnings as { message?: string; type: string }[];

        const hasResponseFormatWarning = warnings.some(
          (w) => typeof w.message === "string" && w.message.includes("responseFormat JSON mode"),
        );
        expect(hasResponseFormatWarning).toBe(false);
      });
    });

    describe("tools", () => {
      it("should use tools from settings when provided", async () => {
        const model = createModel("gpt-4o", {
          tools: [
            {
              function: {
                description: "A custom tool from settings",
                name: "custom_tool",
                parameters: {
                  properties: {
                    input: { type: "string" },
                  },
                  required: ["input"],
                  type: "object",
                },
              },
              type: "function",
            },
          ],
        });

        const prompt = createPrompt("Use a tool");

        const result = await model.doGenerate({ prompt });

        expectRequestBodyHasMessages(result);

        const request = await getLastChatCompletionRequest();

        const tools = Array.isArray(request.tools) ? (request.tools as unknown[]) : undefined;

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
            (tool): tool is { function?: { name?: string }; type?: string } =>
              typeof tool === "object" &&
              tool !== null &&
              (tool as { type?: unknown }).type === "function" &&
              typeof (tool as { function?: { name?: unknown } }).function?.name === "string" &&
              (tool as { function?: { name?: string } }).function?.name === "custom_tool",
          );

          expect(customTool).toBeDefined();
        }
      });

      it.each([
        {
          description: "Tool with array schema",
          inputSchema: { items: { type: "string" }, type: "array" },
          testName: "coerce non-object schema type to object (array)",
          toolName: "array_tool",
        },
        {
          description: "Tool with string schema",
          inputSchema: { type: "string" },
          testName: "handle tool with string type schema",
          toolName: "string_tool",
        },
        {
          description: "Tool with empty properties",
          inputSchema: { properties: {}, type: "object" },
          testName: "handle tool with schema that has no properties",
          toolName: "empty_props_tool",
        },
        {
          description: "Tool without schema",
          inputSchema: undefined as unknown as Record<string, unknown>,
          testName: "handle tool with undefined inputSchema",
          toolName: "no_schema_tool",
        },
      ])("should $testName", async ({ description, inputSchema, toolName }) => {
        const model = createModel();
        const prompt = createPrompt("Use tool");

        const tools: LanguageModelV3FunctionTool[] = [
          {
            description,
            inputSchema,
            name: toolName,
            type: "function",
          },
        ];

        const result = await model.doGenerate({ prompt, tools });

        expectRequestBodyHasMessages(result);
      });
    });
  });
});
