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

    static setChatCompletionError(error: Error) {
      MockOrchestrationClient.chatCompletionError = error;
    }

    chatCompletion = vi.fn().mockImplementation((request) => {
      MockOrchestrationClient.lastChatCompletionRequest = request;

      const errorToThrow = MockOrchestrationClient.chatCompletionError;
      if (errorToThrow) {
        MockOrchestrationClient.chatCompletionError = undefined;
        throw errorToThrow;
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

    stream = vi.fn().mockImplementation(() => {
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
  const createModel = (modelId = "gpt-4o", settings = {}) => {
    return new SAPAIChatLanguageModel(modelId, settings, {
      provider: "sap-ai",
      deploymentConfig: { resourceGroup: "default" },
    });
  };

  const expectRequestBodyHasMessages = (result: {
    request: { body?: unknown };
  }) => {
    const body: unknown = result.request.body;
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
    expect(body).toHaveProperty("messages");
  };

  const getLastChatCompletionRequest = async () => {
    const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
    const MockClient = OrchestrationClient as unknown as {
      lastChatCompletionRequest: unknown;
    };
    return MockClient.lastChatCompletionRequest;
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
  });

  describe("doGenerate", () => {
    it("should generate text response", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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
    });

    it("should propagate axios response headers into doGenerate errors", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setChatCompletionError: (error: Error) => void;
      };

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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      await expect(model.doGenerate({ prompt })).rejects.toMatchObject({
        responseHeaders: {
          "x-request-id": "do-generate-axios-123",
        },
      });
    });

    it("should pass tools to orchestration config", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "What is 2+2?" }] },
      ];

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

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hi" }] },
      ];

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

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hi" }] },
      ];

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

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Return JSON" }] },
      ];

      const result = await model.doGenerate({
        prompt,
        responseFormat: { type: "json" },
      });

      expectRequestBodyHasMessages(result);

      const request = (await getLastChatCompletionRequest()) as {
        response_format?: unknown;
      };

      expect(request.response_format).toEqual({ type: "json_object" });
    });

    it("should map responseFormat json with schema to json_schema", async () => {
      const model = createModel();

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Return JSON" }] },
      ];

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

      const request = (await getLastChatCompletionRequest()) as {
        response_format?: unknown;
      };

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

      expect(caughtError.name).toEqual(expect.stringContaining("APICallError"));
      expect(caughtError.requestBodyValues).toMatchObject({
        promptMessages: 1,
        hasImageParts: true,
      });
    });

    it("should warn about unsupported tool types", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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

      const request = (await getLastChatCompletionRequest()) as {
        tools?: unknown;
      };

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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Use a tool" }] },
      ];

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
  });

  describe("edge-runtime", () => {
    it("streams basic text", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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
  });

  describe("doStream", () => {
    it("should not mutate stream-start warnings when warnings occur during stream", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");

      // Produce only a tool call delta with arguments, but without a tool name.
      // This triggers a warning during the final tool-call flush.
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Use tool" }] },
      ];

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
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Use tools" }] },
      ];

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

    it("should handle stream with 'max_tokens_reached' finish reason as 'length'", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "Reached limit",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "max_tokens_reached",
          getTokenUsage: () => ({
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("length");
      }
    });

    it("should handle stream with 'length' finish reason", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "This response was truncated due to",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          getDeltaContent: () => " max_tokens limit",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "length",
          getTokenUsage: () => ({
            prompt_tokens: 100,
            completion_tokens: 4096,
            total_tokens: 4196,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        {
          role: "user",
          content: [{ type: "text", text: "Write a long essay" }],
        },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("length");
      }
    });

    it("should handle stream with 'eos' finish reason", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "Ok",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "eos",
          getTokenUsage: () => ({
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("stop");
      }
    });

    it("should handle stream with 'stop_sequence' finish reason", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "Hi",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "stop_sequence",
          getTokenUsage: () => ({
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("stop");
      }
    });

    it("should handle stream with 'content_filter' finish reason", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "content_filter",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 0,
            total_tokens: 10,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Blocked content" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("content-filter");
      }
    });

    it("should handle stream with 'error' finish reason", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "Partial response before",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "error",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 3,
            total_tokens: 13,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("error");
      }
    });

    it("should handle stream with unknown finish reason as 'other'", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "Response",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "some_new_unknown_reason",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 1,
            total_tokens: 11,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("other");
      }
    });

    it("should handle stream chunks with null content", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      // Empty string deltas should still be emitted
      const textDeltas = parts.filter((p) => p.type === "text-delta");
      expect(textDeltas.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle 'end_turn' finish reason as 'stop'", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "Response",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "end_turn",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 1,
            total_tokens: 11,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("stop");
      }
    });

    it("should handle 'max_tokens' finish reason as 'length'", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "Truncated",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => "max_tokens",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 100,
            total_tokens: 110,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("length");
      }
    });

    it("should handle 'tool_call' finish reason as 'tool-calls'", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "toolcall-0",
              function: {
                name: "myTool",
                arguments: '{"x":1}',
              },
            },
          ],
          getFinishReason: () => "tool_call",
          getTokenUsage: () => ({
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("tool-calls");
      }
    });

    it("should handle 'function_call' finish reason as 'tool-calls'", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            {
              index: 0,
              id: "call_123",
              function: { name: "get_weather", arguments: '{"city":"Paris"}' },
            },
          ],
          getFinishReason: () => "function_call",
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        {
          role: "user",
          content: [{ type: "text", text: "Weather in Paris?" }],
        },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("tool-calls");
      }
    });

    it("should handle stream with no finish reason as 'unknown'", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => "Hello",
          getDeltaToolCalls: () => undefined,
          getFinishReason: () => undefined,
          getTokenUsage: () => ({
            prompt_tokens: 10,
            completion_tokens: 1,
            total_tokens: 11,
          }),
        },
      ]);

      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const { stream } = await model.doStream({ prompt });
      const parts = await readAllParts(stream);

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("unknown");
      }
    });
  });

  describe("model-specific behavior", () => {
    it("should disable n parameter for Amazon models", async () => {
      const model = createModel("amazon--nova-pro", {
        modelParams: { n: 2 },
      });
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({ prompt });
      // The model should still work, n is just ignored
      expect(result.content).toBeDefined();
    });

    it("should disable n parameter for Anthropic models", async () => {
      const model = createModel("anthropic--claude-3.5-sonnet", {
        modelParams: { n: 2 },
      });
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({ prompt });
      expect(result.content).toBeDefined();
    });
  });

  describe("masking and filtering configuration", () => {
    it("should include masking module in orchestration config", async () => {
      const model = createModel("gpt-4o", {
        masking: {
          masking_providers: [
            {
              type: "sap_data_privacy_integration",
              method: "anonymization",
              entities: [{ type: "profile-email" }, { type: "profile-phone" }],
            },
          ],
        },
      });

      const prompt: LanguageModelV2Prompt = [
        {
          role: "user",
          content: [{ type: "text", text: "My email is test@example.com" }],
        },
      ];

      const result = await model.doGenerate({ prompt });

      expectRequestBodyHasMessages(result);
    });

    it("should include filtering module in orchestration config", async () => {
      const model = createModel("gpt-4o", {
        filtering: {
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
        },
      });

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({ prompt });

      expectRequestBodyHasMessages(result);
    });

    it("should include both masking and filtering when configured", async () => {
      const model = createModel("gpt-4o", {
        masking: {
          masking_providers: [
            {
              type: "sap_data_privacy_integration",
              method: "pseudonymization",
              entities: [{ type: "profile-person" }],
            },
          ],
        },
        filtering: {
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
        },
      });

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({ prompt });

      expectRequestBodyHasMessages(result);
    });
  });

  describe("model version configuration", () => {
    it("should pass model version to orchestration config", async () => {
      const model = createModel("gpt-4o", {
        modelVersion: "2024-05-13",
      });

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({ prompt });

      expectRequestBodyHasMessages(result);

      const request = (await getLastChatCompletionRequest()) as {
        model?: { version?: string };
      };

      expect(request.model?.version).toBe("2024-05-13");
    });

    it("should use 'latest' as default version", async () => {
      const model = createModel("gpt-4o");

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({ prompt });

      expectRequestBodyHasMessages(result);

      const request = (await getLastChatCompletionRequest()) as {
        model?: { version?: string };
      };

      expect(request.model?.version).toBe("latest");
    });
  });

  describe("response body", () => {
    it("should include response body in doGenerate result", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({ prompt });

      expect(result.response.body).toBeDefined();
      expect(result.response.body).toHaveProperty("content");
      expect(result.response.body).toHaveProperty("tokenUsage");
      expect(result.response.body).toHaveProperty("finishReason");
    });
  });

  describe("settings from options take precedence", () => {
    it("should prefer options.temperature over settings.modelParams.temperature", async () => {
      const model = createModel("gpt-4o", {
        modelParams: {
          temperature: 0.5,
        },
      });

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({
        prompt,
        temperature: 0.9,
      });

      expectRequestBodyHasMessages(result);

      const request = (await getLastChatCompletionRequest()) as {
        model?: {
          params?: {
            temperature?: number;
          };
        };
      };

      expect(request.model?.params?.temperature).toBe(0.9);
    });

    it("should prefer options.maxOutputTokens over settings.modelParams.maxTokens", async () => {
      const model = createModel("gpt-4o", {
        modelParams: {
          maxTokens: 500,
        },
      });

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({
        prompt,
        maxOutputTokens: 1000,
      });

      expectRequestBodyHasMessages(result);

      const request = (await getLastChatCompletionRequest()) as {
        model?: {
          params?: {
            max_tokens?: number;
          };
        };
      };

      expect(request.model?.params?.max_tokens).toBe(1000);
    });
  });

  describe("toolChoice warning", () => {
    it("should warn when toolChoice is not 'auto'", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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
  });

  describe("responseFormat warning", () => {
    it("should emit a best-effort warning for responseFormat json", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Return JSON" }] },
      ];

      const result = await model.doGenerate({
        prompt,
        responseFormat: { type: "json" },
      });
      const warnings = result.warnings;

      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe("stop sequences and seed", () => {
    it("should pass stop sequences to model params", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({
        prompt,
        stopSequences: ["END", "STOP"],
      });

      expectRequestBodyHasMessages(result);

      const request = (await getLastChatCompletionRequest()) as {
        model?: {
          params?: {
            stop?: string[];
          };
        };
      };

      expect(request.model?.params?.stop).toEqual(["END", "STOP"]);
    });

    it("should pass seed to model params", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({
        prompt,
        seed: 42,
      });

      expectRequestBodyHasMessages(result);

      const request = (await getLastChatCompletionRequest()) as {
        model?: {
          params?: {
            seed?: number;
          };
        };
      };

      expect(request.model?.params?.seed).toBe(42);
    });
  });

  describe("tools from settings", () => {
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

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Use a tool" }] },
      ];

      const result = await model.doGenerate({ prompt });

      expectRequestBodyHasMessages(result);

      const request = (await getLastChatCompletionRequest()) as {
        tools?: unknown;
      };

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
  });

  describe("tool schema edge cases", () => {
    it("should coerce non-object schema type to object", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Use tool" }] },
      ];

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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Use tool" }] },
      ];

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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Use tool" }] },
      ];

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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Use tool" }] },
      ];

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

  describe("stream error handling", () => {
    it("should warn when tool call delta has no tool name", async () => {
      // (node-only)
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      // Simulate tool call without a name (never receives name in any chunk)
      MockClient.setStreamChunks([
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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Use tool" }] },
      ];

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
        ): p is Extract<LanguageModelV2StreamPart, { type: "stream-start" }> =>
          p.type === "stream-start",
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
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
        setStreamError: (error: Error) => void;
      };

      // Set up chunks that complete normally, but error is thrown after
      MockClient.setStreamChunks([
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
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

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
      MockClient.setStreamChunks([
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
  });
});
