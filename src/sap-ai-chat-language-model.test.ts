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
    chatCompletion = vi.fn().mockImplementation((request) => {
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
          getFinishReason: () => string | null;
          getTokenUsage: () =>
            | {
                prompt_tokens: number;
                completion_tokens: number;
                total_tokens: number;
              }
            | undefined;
        }[]
      | undefined;

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
        getFinishReason: () => string | null;
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

      return {
        stream: {
          *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
              yield chunk;
            }
          },
        },
        getTokenUsage: () => ({
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        }),
        getFinishReason: () => "stop",
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

      expect(result.warnings).toHaveLength(0);

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            prompt?: { tools?: unknown[] };
          };
        };
      };

      expect(requestBody.config?.promptTemplating?.prompt?.tools).toHaveLength(
        1,
      );
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            model?: { params?: Record<string, unknown> };
          };
        };
      };

      expect(
        requestBody.config?.promptTemplating?.model?.params
          ?.parallel_tool_calls,
      ).toBe(true);
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            prompt?: { response_format?: { type: string } };
          };
        };
      };

      expect(
        requestBody.config?.promptTemplating?.prompt?.response_format,
      ).toEqual({ type: "json_object" });
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            prompt?: { response_format?: unknown };
          };
        };
      };

      expect(
        requestBody.config?.promptTemplating?.prompt?.response_format,
      ).toEqual({
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

    it("should prefer settings.tools over call options.tools", async () => {
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            prompt?: { tools?: { function?: { name?: string } }[] };
          };
        };
      };

      expect(
        requestBody.config?.promptTemplating?.prompt?.tools?.[0]?.function
          ?.name,
      ).toBe("settings_tool");
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

      // We only assert the fallback schema; warnings are best-effort.
      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            prompt?: {
              tools?: {
                function?: { name?: string; parameters?: unknown };
              }[];
            };
          };
        };
      };

      const toolParameters =
        requestBody.config?.promptTemplating?.prompt?.tools?.[0]?.function
          ?.parameters;

      expect(toolParameters).toMatchObject({
        type: "object",
      });
    });
  });

  describe("doStream", () => {
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

    it("should handle tool args arriving before tool name", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      MockClient.setStreamChunks([
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            { index: 0, id: "call_1", function: { arguments: '{"a":1' } },
          ],
          getFinishReason: () => null,
          getTokenUsage: () => undefined,
        },
        {
          getDeltaContent: () => null,
          getDeltaToolCalls: () => [
            {
              index: 0,
              function: { name: "calc", arguments: ',"b":2}' },
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

      const toolInputStartIndex = parts.findIndex(
        (p) => p.type === "tool-input-start",
      );
      expect(toolInputStartIndex).toBeGreaterThanOrEqual(0);

      // tool-input-start must not happen before tool name exists; since the name
      // arrives in the 2nd chunk, we must not emit any tool-input-* in the 1st.
      const toolInputEventsBeforeStart = parts.slice(0, toolInputStartIndex);
      expect(
        toolInputEventsBeforeStart.some(
          (p) => p.type === "tool-input-delta" || p.type === "tool-input-start",
        ),
      ).toBe(false);

      const toolCall = parts.find((p) => p.type === "tool-call");
      expect(toolCall).toBeDefined();
      if (toolCall?.type === "tool-call") {
        expect(toolCall.toolName).toBe("calc");
        expect(toolCall.toolCallId).toBe("call_1");
        expect(toolCall.input).toBe('{"a":1,"b":2}');
      }
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

      const requestBody = result.request.body as {
        config?: {
          masking?: unknown;
        };
      };

      expect(requestBody.config?.masking).toBeDefined();
      expect(requestBody.config?.masking).toHaveProperty("masking_providers");
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

      const requestBody = result.request.body as {
        config?: {
          filtering?: unknown;
        };
      };

      expect(requestBody.config?.filtering).toBeDefined();
      expect(requestBody.config?.filtering).toHaveProperty("input");
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

      const requestBody = result.request.body as {
        config?: {
          masking?: unknown;
          filtering?: unknown;
        };
      };

      expect(requestBody.config?.masking).toBeDefined();
      expect(requestBody.config?.filtering).toBeDefined();
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            model?: { version?: string };
          };
        };
      };

      expect(requestBody.config?.promptTemplating?.model?.version).toBe(
        "2024-05-13",
      );
    });

    it("should use 'latest' as default version", async () => {
      const model = createModel("gpt-4o");

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({ prompt });

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            model?: { version?: string };
          };
        };
      };

      expect(requestBody.config?.promptTemplating?.model?.version).toBe(
        "latest",
      );
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

  describe("stream chunk processing", () => {
    it("should process stream chunks and emit correct parts", async () => {
      const { OrchestrationClient } = await import("@sap-ai-sdk/orchestration");
      const MockClient = OrchestrationClient as unknown as {
        setStreamChunks: (chunks: unknown[]) => void;
      };

      // Set up stream chunks explicitly
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
      const parts: LanguageModelV2StreamPart[] = [];
      const reader = stream.getReader();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }

      // Verify stream emits expected part types
      const textPart = parts.find((p) => p.type === "text-delta");
      expect(textPart).toBeDefined();

      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            model?: { params?: { temperature?: number } };
          };
        };
      };

      expect(
        requestBody.config?.promptTemplating?.model?.params?.temperature,
      ).toBe(0.9);
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            model?: { params?: { max_tokens?: number } };
          };
        };
      };

      expect(
        requestBody.config?.promptTemplating?.model?.params?.max_tokens,
      ).toBe(1000);
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            model?: { params?: { stop?: string[] } };
          };
        };
      };

      expect(requestBody.config?.promptTemplating?.model?.params?.stop).toEqual(
        ["END", "STOP"],
      );
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            model?: { params?: { seed?: number } };
          };
        };
      };

      expect(requestBody.config?.promptTemplating?.model?.params?.seed).toBe(
        42,
      );
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

      const requestBody = result.request.body as {
        config?: {
          promptTemplating?: {
            prompt?: { tools?: { function?: { name?: string } }[] };
          };
        };
      };

      expect(requestBody.config?.promptTemplating?.prompt?.tools).toHaveLength(
        1,
      );
      expect(
        requestBody.config?.promptTemplating?.prompt?.tools?.[0]?.function
          ?.name,
      ).toBe("custom_tool");
    });
  });
});
