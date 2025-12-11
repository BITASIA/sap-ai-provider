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
});
