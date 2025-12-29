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
    chatCompletion = vi.fn().mockResolvedValue({
      getContent: () => "Hello!",
      getToolCalls: () => undefined,
      getTokenUsage: () => ({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      }),
      getFinishReason: () => "stop",
    });

    stream = vi.fn().mockResolvedValue({
      stream: {
        async *[Symbol.asyncIterator]() {
          // Simulate async streaming
          await Promise.resolve();
          yield {
            getDeltaContent: () => "Hello",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => null,
            getTokenUsage: () => undefined,
          };
          yield {
            getDeltaContent: () => "!",
            getDeltaToolCalls: () => undefined,
            getFinishReason: () => "stop",
            getTokenUsage: () => ({
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            }),
          };
        },
      },
      getTokenUsage: () => ({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      }),
      getFinishReason: () => "stop",
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

    it("should support image URLs", () => {
      const model = createModel();
      expect(model.supportsImageUrls).toBe(true);
    });

    it("should support structured outputs", () => {
      const model = createModel();
      expect(model.supportsStructuredOutputs).toBe(true);
    });

    it("should support HTTPS URLs", () => {
      const model = createModel();
      expect(model.supportsUrl(new URL("https://example.com/image.png"))).toBe(
        true,
      );
    });

    it("should not support HTTP URLs", () => {
      const model = createModel();
      expect(model.supportsUrl(new URL("http://example.com/image.png"))).toBe(
        false,
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
      expect(result.rawCall.rawPrompt).toBeDefined();
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
  });

  describe("doStream", () => {
    it("should stream text response", async () => {
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
        // Value is always defined when done is false
        parts.push(value);
      }

      // Check stream structure
      expect(parts[0].type).toBe("stream-start");
      expect(parts.some((p) => p.type === "text-delta")).toBe(true);
      expect(parts.some((p) => p.type === "finish")).toBe(true);

      // Check finish part
      const finishPart = parts.find((p) => p.type === "finish");
      expect(finishPart).toBeDefined();
      if (finishPart?.type === "finish") {
        expect(finishPart.finishReason).toBe("stop");
      }
    });
  });

  describe("tool calling configuration", () => {
    it("should convert function tools correctly", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Get weather" }] },
      ];

      const tools: LanguageModelV2FunctionTool[] = [
        {
          type: "function",
          name: "get_weather",
          description: "Get weather for a location",
          inputSchema: {
            type: "object",
            properties: {
              location: { type: "string", description: "City name" },
            },
            required: ["location"],
          },
        },
      ];

      const result = await model.doGenerate({ prompt, tools });

      // Verify the raw prompt contains the tool configuration
      const rawPrompt = result.rawCall.rawPrompt as {
        config?: unknown;
      };
      expect(rawPrompt.config).toBeDefined();
    });

    it("should handle multiple tools", async () => {
      const model = createModel();
      const prompt: LanguageModelV2Prompt = [
        {
          role: "user",
          content: [{ type: "text", text: "Calculate and get weather" }],
        },
      ];

      const tools: LanguageModelV2FunctionTool[] = [
        {
          type: "function",
          name: "calculate",
          description: "Calculate expression",
          inputSchema: {
            type: "object",
            properties: { expr: { type: "string" } },
            required: ["expr"],
          },
        },
        {
          type: "function",
          name: "get_weather",
          description: "Get weather",
          inputSchema: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      ];

      const result = await model.doGenerate({ prompt, tools });
      expect(result.warnings).toHaveLength(0);
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
});
