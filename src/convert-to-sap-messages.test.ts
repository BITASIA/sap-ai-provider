import { describe, it, expect } from "vitest";
import { convertToSAPMessages } from "./convert-to-sap-messages";
import type { LanguageModelV2Prompt } from "@ai-sdk/provider";

describe("convertToSAPMessages", () => {
  it("should convert system message", () => {
    const prompt: LanguageModelV2Prompt = [
      { role: "system", content: "You are a helpful assistant." },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
  });

  it("should convert simple user message", () => {
    const prompt: LanguageModelV2Prompt = [
      { role: "user", content: [{ type: "text", text: "Hello!" }] },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "user",
      content: "Hello!",
    });
  });

  it("should convert user message with image", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          {
            type: "file",
            mediaType: "image/png",
            data: "base64data",
          },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "What is this?" },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,base64data" },
        },
      ],
    });
  });

  it("should convert assistant message with text", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "assistant",
        content: [{ type: "text", text: "Hello there!" }],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "Hello there!",
      tool_calls: undefined,
    });
  });

  it("should drop assistant reasoning by default", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Hidden chain of thought" },
          { type: "text", text: "Final answer" },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "Final answer",
      tool_calls: undefined,
    });
  });

  it("should include assistant reasoning when enabled", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Hidden chain of thought" },
          { type: "text", text: "Final answer" },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt, { includeReasoning: true });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "<reasoning>Hidden chain of thought</reasoning>Final answer",
      tool_calls: undefined,
    });
  });

  it("should convert assistant message with tool calls", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_123",
            toolName: "get_weather",
            input: { location: "Tokyo" },
          },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "get_weather",
            arguments: '{"location":"Tokyo"}',
          },
        },
      ],
    });
  });

  it("should not double-encode tool-call input when already a JSON string", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_123",
            toolName: "get_weather",
            input: '{"location":"Tokyo"}',
          },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "get_weather",
            arguments: '{"location":"Tokyo"}',
          },
        },
      ],
    });
  });

  it("should convert tool result message", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_123",
            toolName: "get_weather",
            output: { type: "json" as const, value: { weather: "sunny" } },
          },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "tool",
      tool_call_id: "call_123",
      content: '{"type":"json","value":{"weather":"sunny"}}',
    });
  });

  it("should convert full conversation", () => {
    const prompt: LanguageModelV2Prompt = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: [{ type: "text", text: "Hi" }] },
      { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
      { role: "user", content: [{ type: "text", text: "Thanks" }] },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(4);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
    expect(result[2].role).toBe("assistant");
    expect(result[3].role).toBe("user");
  });

  it("should convert user message with image URL (not base64)", () => {
    const imageUrl = new URL("https://example.com/image.jpg");
    const prompt: LanguageModelV2Prompt = [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image" },
          {
            type: "file",
            mediaType: "image/jpeg",
            data: imageUrl,
          },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Describe this image" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/image.jpg" },
        },
      ],
    });
  });

  it("should convert multiple tool results into separate messages", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "get_weather",
            output: { type: "json" as const, value: { weather: "sunny" } },
          },
          {
            type: "tool-result",
            toolCallId: "call_2",
            toolName: "get_time",
            output: { type: "json" as const, value: { time: "12:00" } },
          },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: '{"type":"json","value":{"weather":"sunny"}}',
    });
    expect(result[1]).toEqual({
      role: "tool",
      tool_call_id: "call_2",
      content: '{"type":"json","value":{"time":"12:00"}}',
    });
  });

  it("should throw error for unsupported file types", () => {
    const unsupportedTypes = [
      { mediaType: "audio/mp3", description: "audio" },
      { mediaType: "application/pdf", description: "pdf" },
      { mediaType: "video/mp4", description: "video" },
    ];

    for (const { mediaType, description } of unsupportedTypes) {
      const prompt: LanguageModelV2Prompt = [
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType,
              data: "base64data",
            },
          ],
        },
      ];

      expect(
        () => convertToSAPMessages(prompt),
        `should throw for ${description}`,
      ).toThrow("Only image files are supported");
    }
  });

  it("should convert multiple tool calls in single assistant message", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "get_weather",
            input: { location: "Tokyo" },
          },
          {
            type: "tool-call",
            toolCallId: "call_2",
            toolName: "get_time",
            input: { timezone: "JST" },
          },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "get_weather",
            arguments: '{"location":"Tokyo"}',
          },
        },
        {
          id: "call_2",
          type: "function",
          function: {
            name: "get_time",
            arguments: '{"timezone":"JST"}',
          },
        },
      ],
    });
  });

  it("should handle assistant message with both text and tool calls", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check the weather for you." },
          {
            type: "tool-call",
            toolCallId: "call_123",
            toolName: "get_weather",
            input: { location: "Paris" },
          },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "Let me check the weather for you.",
      tool_calls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "get_weather",
            arguments: '{"location":"Paris"}',
          },
        },
      ],
    });
  });

  it("should handle user message with multiple text parts", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "user",
        content: [
          { type: "text", text: "First part." },
          { type: "text", text: "Second part." },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "First part." },
        { type: "text", text: "Second part." },
      ],
    });
  });

  it("should handle reasoning-only assistant message by dropping content", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "assistant",
        content: [{ type: "reasoning", text: "Thinking about this..." }],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: undefined,
    });
  });

  it("should handle empty reasoning text", () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "" },
          { type: "text", text: "Answer" },
        ],
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "assistant",
      content: "Answer",
      tool_calls: undefined,
    });
  });
});
