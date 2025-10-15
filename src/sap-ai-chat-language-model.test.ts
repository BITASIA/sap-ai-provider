import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LanguageModelV2Prompt } from "@ai-sdk/provider";
import { SAPAIChatLanguageModel } from "./sap-ai-chat-language-model";

const mockFetch = vi.fn();

describe("SAPAIChatLanguageModel", () => {
  let model: SAPAIChatLanguageModel;

  beforeEach(() => {
    vi.clearAllMocks();
    model = new SAPAIChatLanguageModel(
      "gpt-4o",
      {},
      {
        provider: "sap-ai",
        baseURL:
          "https://api.ai.test.com/v2/inference/deployments/test-deployment/completion",
        headers: () => ({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
          "ai-resource-group": "default",
        }),
        fetch: mockFetch,
      },
    );
  });

  describe("constructor", () => {
    it("should create instance with correct properties", () => {
      expect(model.modelId).toBe("gpt-4o");
      expect(model.specificationVersion).toBe("v2");
      expect(model.provider).toBe("sap-ai");
    });
  });

  describe("supportsUrl", () => {
    it("should support https URLs", () => {
      expect(model.supportsUrl(new URL("https://example.com/image.jpg"))).toBe(
        true,
      );
    });

    it("should not support http URLs", () => {
      expect(model.supportsUrl(new URL("http://example.com/image.jpg"))).toBe(
        false,
      );
    });
  });

  describe("doGenerate", () => {
    it("should generate text successfully", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "application/json",
        }),
        json: async () => ({
          request_id: "test-request-id",
          module_results: {
            llm: {
              id: "chatcmpl-1",
              object: "chat.completion",
              created: 1722510700,
              model: "gpt-4o",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "Hello, world!",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
              },
            },
            templating: [],
          },
        }),
        text: async () =>
          JSON.stringify({
            request_id: "test-request-id",
            module_results: {
              llm: {
                id: "chatcmpl-1",
                object: "chat.completion",
                created: 1722510700,
                model: "gpt-4o",
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: "Hello, world!",
                    },
                    finish_reason: "stop",
                  },
                ],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 20,
                  total_tokens: 30,
                },
              },
              templating: [],
            },
          }),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        clone: function () {
          return this;
        },
        body: null,
        bodyUsed: false,
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({
        prompt,
      });

      expect(result.content).toEqual([{ type: "text", text: "Hello, world!" }]);
      expect(result.finishReason).toBe("stop");
      expect(result.usage).toEqual({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      });
    });

    it("should handle JSON content parsing", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "application/json",
        }),
        json: async () => ({
          request_id: "test-request-id",
          module_results: {
            llm: {
              id: "chatcmpl-2",
              object: "chat.completion",
              created: 1722510700,
              model: "gpt-4o",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: '{"content": "Parsed JSON content"}',
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 5,
                completion_tokens: 10,
                total_tokens: 15,
              },
            },
            templating: [],
          },
        }),
        text: async () =>
          JSON.stringify({
            request_id: "test-request-id",
            module_results: {
              llm: {
                id: "chatcmpl-2",
                object: "chat.completion",
                created: 1722510700,
                model: "gpt-4o",
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: '{"content": "Parsed JSON content"}',
                    },
                    finish_reason: "stop",
                  },
                ],
                usage: {
                  prompt_tokens: 5,
                  completion_tokens: 10,
                  total_tokens: 15,
                },
              },
              templating: [],
            },
          }),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        clone: function () {
          return this;
        },
        body: null,
        bodyUsed: false,
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doGenerate({
        prompt,
      });

      expect(result.content).toEqual([
        { type: "text", text: "Parsed JSON content" },
      ]);
    });

    it("should handle tool calls", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "application/json",
        }),
        json: async () => ({
          request_id: "test-request-id",
          module_results: {
            llm: {
              id: "chatcmpl-3",
              object: "chat.completion",
              created: 1722510700,
              model: "gpt-4o",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "tool-call-1",
                        type: "function",
                        function: {
                          name: "get_weather",
                          arguments: '{"location": "New York"}',
                        },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
              usage: {
                prompt_tokens: 15,
                completion_tokens: 25,
                total_tokens: 40,
              },
            },
            templating: [],
          },
        }),
        text: async () =>
          JSON.stringify({
            request_id: "test-request-id",
            module_results: {
              llm: {
                id: "chatcmpl-3",
                object: "chat.completion",
                created: 1722510700,
                model: "gpt-4o",
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "tool-call-1",
                          type: "function",
                          function: {
                            name: "get_weather",
                            arguments: '{"location": "New York"}',
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
                usage: {
                  prompt_tokens: 15,
                  completion_tokens: 25,
                  total_tokens: 40,
                },
              },
              templating: [],
            },
          }),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        clone: function () {
          return this;
        },
        body: null,
        bodyUsed: false,
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const prompt: LanguageModelV2Prompt = [
        {
          role: "user",
          content: [{ type: "text", text: "What's the weather like?" }],
        },
      ];

      const result = await model.doGenerate({
        prompt,
        tools: [
          {
            type: "function" as const,
            name: "get_weather",
            description: "Get current weather",
            inputSchema: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
              required: ["location"],
            },
          },
        ],
      });

      expect(result.content).toEqual([
        {
          type: "tool-call",
          toolCallId: "tool-call-1",
          toolName: "get_weather",
          input: '{"location": "New York"}',
        },
      ]);
      expect(result.finishReason).toBe("tool_calls");
    });
  });

  describe("doStream", () => {
    it("should handle successful streaming response", async () => {
      const mockSSEData = [
        'data: {"request_id":"test-123","module_results":{"llm":{"choices":[{"index":0,"delta":{"content":"Hello"}}]}}}\n',
        'data: {"request_id":"test-123","module_results":{"llm":{"choices":[{"index":0,"delta":{"content":" world"}}]}}}\n',
        'data: {"request_id":"test-123","module_results":{"llm":{"choices":[{"index":0,"finish_reason":"stop"}]}}}\n',
      ];

      const mockStreamResponse = {
        ok: true,
        status: 200,
        headers: new Headers([["content-type", "text/event-stream"]]),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(mockSSEData[0]));
            controller.enqueue(new TextEncoder().encode(mockSSEData[1]));
            controller.enqueue(new TextEncoder().encode(mockSSEData[2]));
            controller.close();
          },
        }),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        json: async () => ({}),
        text: async () => "",
        clone: function () {
          return this;
        },
        bodyUsed: false,
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
      };

      mockFetch.mockResolvedValueOnce(mockStreamResponse);

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const result = await model.doStream({
        prompt,
      });

      expect(result.stream).toBeInstanceOf(ReadableStream);
      expect(result.rawCall).toBeDefined();
    });

    it("should handle streaming errors gracefully", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        headers: new Headers([["content-type", "application/json"]]),
        text: async () =>
          JSON.stringify({
            error: {
              request_id: "err-123",
              code: 400,
              message: "Invalid request",
              location: "LLM Module",
            },
          }),
        json: async () => ({
          error: {
            request_id: "err-123",
            code: 400,
            message: "Invalid request",
            location: "LLM Module",
          },
        }),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        clone: function () {
          return this;
        },
        body: null,
        bodyUsed: false,
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
      };

      mockFetch.mockResolvedValueOnce(mockErrorResponse);

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      await expect(model.doStream({ prompt })).rejects.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      await expect(
        model.doGenerate({
          prompt,
        }),
      ).rejects.toThrow();
    });

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers(),
        text: async () => "Unauthorized access",
      });

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      await expect(
        model.doGenerate({
          prompt,
        }),
      ).rejects.toThrow();
    });
  });

  describe("request format", () => {
    it("should include parallel_tool_calls when set (snake_case)", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "application/json",
        }),
        json: async () => ({
          request_id: "test-request-id",
          module_results: {
            llm: {
              id: "chatcmpl-x",
              object: "chat.completion",
              created: 1722510700,
              model: "gpt-4o",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "ok",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            },
            templating: [],
          },
        }),
        text: async () =>
          JSON.stringify({
            request_id: "test-request-id",
            module_results: {
              llm: {
                id: "chatcmpl-x",
                object: "chat.completion",
                created: 1722510700,
                model: "gpt-4o",
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: "ok",
                    },
                    finish_reason: "stop",
                  },
                ],
                usage: {
                  prompt_tokens: 1,
                  completion_tokens: 1,
                  total_tokens: 2,
                },
              },
              templating: [],
            },
          }),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        clone: function () {
          return this;
        },
        body: null,
        bodyUsed: false,
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      // Recreate model with snake_case param false
      model = new SAPAIChatLanguageModel(
        "gpt-4o",
        { modelParams: { parallel_tool_calls: false } as { parallel_tool_calls: boolean } },
        {
          provider: "sap-ai",
          baseURL:
            "https://api.ai.test.com/v2/inference/deployments/test-deployment/completion",
          headers: () => ({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
            "ai-resource-group": "default",
          }),
          fetch: mockFetch,
        },
      );

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      await model.doGenerate({ prompt });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(
        requestBody.config.modules.prompt_templating.model.params
          .parallel_tool_calls,
      ).toBe(false);
    });

    it("should include parallel_tool_calls when true (snake_case)", async () => {
      const mockBody = {
        request_id: "test-request-id",
        module_results: {
          llm: {
            id: "chatcmpl-x",
            object: "chat.completion",
            created: 1722510700,
            model: "gpt-4o",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "ok" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          },
          templating: [],
        },
      };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "application/json",
        }),
        json: async () => mockBody,
        text: async () => JSON.stringify(mockBody),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        clone: function () {
          return this;
        },
        body: null,
        bodyUsed: false,
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      model = new SAPAIChatLanguageModel(
        "gpt-4o",
        { modelParams: { parallel_tool_calls: true } as { parallel_tool_calls: boolean } },
        {
          provider: "sap-ai",
          baseURL:
            "https://api.ai.test.com/v2/inference/deployments/test-deployment/completion",
          headers: () => ({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
            "ai-resource-group": "default",
          }),
          fetch: mockFetch,
        },
      );

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      await model.doGenerate({ prompt });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(
        requestBody.config.modules.prompt_templating.model.params
          .parallel_tool_calls,
      ).toBe(true);
    });
    it("should create correct v2 config structure", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "application/json",
        }),
        json: async () => ({
          request_id: "test-request-id",
          module_results: {
            llm: {
              id: "chatcmpl-4",
              object: "chat.completion",
              created: 1722510700,
              model: "gpt-4o",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "Test response",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 5,
                completion_tokens: 10,
                total_tokens: 15,
              },
            },
            templating: [],
          },
        }),
        text: async () =>
          JSON.stringify({
            request_id: "test-request-id",
            module_results: {
              llm: {
                id: "chatcmpl-4",
                object: "chat.completion",
                created: 1722510700,
                model: "gpt-4o",
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: "Test response",
                    },
                    finish_reason: "stop",
                  },
                ],
                usage: {
                  prompt_tokens: 5,
                  completion_tokens: 10,
                  total_tokens: 15,
                },
              },
              templating: [],
            },
          }),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        clone: function () {
          return this;
        },
        body: null,
        bodyUsed: false,
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      await model.doGenerate({
        prompt,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.ai.test.com/v2/inference/deployments/test-deployment/completion",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
            "ai-resource-group": "default",
          }),
          body: expect.stringContaining('"config"'),
        }),
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody).toHaveProperty("config");
      expect(requestBody.config).toHaveProperty("modules");
      expect(requestBody.config.modules).toHaveProperty("prompt_templating");
      expect(requestBody.config.modules.prompt_templating).toHaveProperty(
        "prompt",
      );
      expect(requestBody.config.modules.prompt_templating).toHaveProperty(
        "model",
      );
    });

    it("should include masking module when masking settings are provided", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "application/json",
        }),
        json: async () => ({
          request_id: "test-request-id",
          module_results: {
            llm: {
              id: "chatcmpl-5",
              object: "chat.completion",
              created: 1722510700,
              model: "gpt-4o",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "Test response",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 5,
                completion_tokens: 10,
                total_tokens: 15,
              },
            },
            templating: [],
          },
        }),
        text: async () =>
          JSON.stringify({
            request_id: "test-request-id",
            module_results: {
              llm: {
                id: "chatcmpl-5",
                object: "chat.completion",
                created: 1722510700,
                model: "gpt-4o",
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: "Test response",
                    },
                    finish_reason: "stop",
                  },
                ],
                usage: {
                  prompt_tokens: 5,
                  completion_tokens: 10,
                  total_tokens: 15,
                },
              },
              templating: [],
            },
          }),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        clone: function () {
          return this;
        },
        body: null,
        bodyUsed: false,
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      // Recreate model with masking default in settings
      model = new SAPAIChatLanguageModel(
        "gpt-4o",
        {
          masking: {
            masking_providers: [
              {
                type: "sap_data_privacy_integration",
                method: "anonymization",
                entities: [{ type: "profile-email" }],
                allowlist: ["SAP"],
                mask_grounding_input: { enabled: true },
              },
            ],
          },
        },
        {
          provider: "sap-ai",
          baseURL:
            "https://api.ai.test.com/v2/inference/deployments/test-deployment/completion",
          headers: () => ({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
            "ai-resource-group": "default",
          }),
          fetch: mockFetch,
        },
      );

      const prompt: LanguageModelV2Prompt = [
        { role: "user", content: [{ type: "text", text: "Email me" }] },
      ];

      await model.doGenerate({ prompt });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.config.modules).toHaveProperty("masking");
      expect(requestBody.config.modules.masking).toEqual({
        masking_providers: [
          {
            type: "sap_data_privacy_integration",
            method: "anonymization",
            entities: [{ type: "profile-email" }],
            allowlist: ["SAP"],
            mask_grounding_input: { enabled: true },
          },
        ],
      });
    });
  });
});
