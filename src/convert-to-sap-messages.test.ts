/**
 * Unit tests for Message Conversion
 *
 * Tests conversion from Vercel AI SDK prompt format to SAP AI SDK ChatMessage format,
 * including system/user/assistant messages, tool calls, multi-modal content, and reasoning parts.
 */

import type { LanguageModelV3Prompt } from "@ai-sdk/provider";

import { describe, expect, it } from "vitest";

import { convertToSAPMessages } from "./convert-to-sap-messages";

const createUserPrompt = (text: string): LanguageModelV3Prompt => [
  { content: [{ text, type: "text" }], role: "user" },
];

const createSystemPrompt = (content: string): LanguageModelV3Prompt => [
  { content, role: "system" },
];

describe("convertToSAPMessages", () => {
  it("should convert system message", () => {
    const prompt = createSystemPrompt("You are a helpful assistant.");

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "You are a helpful assistant.",
      role: "system",
    });
  });

  it("should convert simple user message", () => {
    const prompt = createUserPrompt("Hello!");

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "Hello!",
      role: "user",
    });
  });

  it("should convert user message with image", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          { text: "What is this?", type: "text" },
          {
            data: "base64data",
            mediaType: "image/png",
            type: "file",
          },
        ],
        role: "user",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: [
        { text: "What is this?", type: "text" },
        {
          image_url: { url: "data:image/png;base64,base64data" },
          type: "image_url",
        },
      ],
      role: "user",
    });
  });

  it("should convert assistant message with text", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [{ text: "Hello there!", type: "text" }],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "Hello there!",
      role: "assistant",
      tool_calls: undefined,
    });
  });

  it("should drop assistant reasoning by default", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          { text: "Hidden chain of thought", type: "reasoning" },
          { text: "Final answer", type: "text" },
        ],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "Final answer",
      role: "assistant",
      tool_calls: undefined,
    });
  });

  it("should include assistant reasoning when enabled", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          { text: "Hidden chain of thought", type: "reasoning" },
          { text: "Final answer", type: "text" },
        ],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt, { includeReasoning: true });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "<reasoning>Hidden chain of thought</reasoning>Final answer",
      role: "assistant",
      tool_calls: undefined,
    });
  });

  it("should convert assistant message with tool calls", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          {
            input: { location: "Tokyo" },
            toolCallId: "call_123",
            toolName: "get_weather",
            type: "tool-call",
          },
        ],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "",
      role: "assistant",
      tool_calls: [
        {
          function: {
            arguments: '{"location":"Tokyo"}',
            name: "get_weather",
          },
          id: "call_123",
          type: "function",
        },
      ],
    });
  });

  it("should not double-encode tool-call input when already a JSON string", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          {
            input: '{"location":"Tokyo"}',
            toolCallId: "call_123",
            toolName: "get_weather",
            type: "tool-call",
          },
        ],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "",
      role: "assistant",
      tool_calls: [
        {
          function: {
            arguments: '{"location":"Tokyo"}',
            name: "get_weather",
          },
          id: "call_123",
          type: "function",
        },
      ],
    });
  });

  it("should convert tool result message", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          {
            output: { type: "json" as const, value: { weather: "sunny" } },
            toolCallId: "call_123",
            toolName: "get_weather",
            type: "tool-result",
          },
        ],
        role: "tool",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: '{"type":"json","value":{"weather":"sunny"}}',
      role: "tool",
      tool_call_id: "call_123",
    });
  });

  it("should convert full conversation", () => {
    const prompt: LanguageModelV3Prompt = [
      { content: "You are helpful.", role: "system" },
      { content: [{ text: "Hi", type: "text" }], role: "user" },
      { content: [{ text: "Hello!", type: "text" }], role: "assistant" },
      { content: [{ text: "Thanks", type: "text" }], role: "user" },
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
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          { text: "Describe this image", type: "text" },
          {
            data: imageUrl,
            mediaType: "image/jpeg",
            type: "file",
          },
        ],
        role: "user",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: [
        { text: "Describe this image", type: "text" },
        {
          image_url: { url: "https://example.com/image.jpg" },
          type: "image_url",
        },
      ],
      role: "user",
    });
  });

  it("should convert multiple tool results into separate messages", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          {
            output: { type: "json" as const, value: { weather: "sunny" } },
            toolCallId: "call_1",
            toolName: "get_weather",
            type: "tool-result",
          },
          {
            output: { type: "json" as const, value: { time: "12:00" } },
            toolCallId: "call_2",
            toolName: "get_time",
            type: "tool-result",
          },
        ],
        role: "tool",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      content: '{"type":"json","value":{"weather":"sunny"}}',
      role: "tool",
      tool_call_id: "call_1",
    });
    expect(result[1]).toEqual({
      content: '{"type":"json","value":{"time":"12:00"}}',
      role: "tool",
      tool_call_id: "call_2",
    });
  });

  it.each([
    { description: "audio", mediaType: "audio/mp3" },
    { description: "pdf", mediaType: "application/pdf" },
    { description: "video", mediaType: "video/mp4" },
  ])("should throw error for unsupported file type: $description", ({ mediaType }) => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          {
            data: "base64data",
            mediaType,
            type: "file",
          },
        ],
        role: "user",
      },
    ];

    expect(() => convertToSAPMessages(prompt)).toThrow("Only image files are supported");
  });

  it("should convert multiple tool calls in single assistant message", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          {
            input: { location: "Tokyo" },
            toolCallId: "call_1",
            toolName: "get_weather",
            type: "tool-call",
          },
          {
            input: { timezone: "JST" },
            toolCallId: "call_2",
            toolName: "get_time",
            type: "tool-call",
          },
        ],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "",
      role: "assistant",
      tool_calls: [
        {
          function: {
            arguments: '{"location":"Tokyo"}',
            name: "get_weather",
          },
          id: "call_1",
          type: "function",
        },
        {
          function: {
            arguments: '{"timezone":"JST"}',
            name: "get_time",
          },
          id: "call_2",
          type: "function",
        },
      ],
    });
  });

  it("should handle assistant message with both text and tool calls", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          { text: "Let me check the weather for you.", type: "text" },
          {
            input: { location: "Paris" },
            toolCallId: "call_123",
            toolName: "get_weather",
            type: "tool-call",
          },
        ],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "Let me check the weather for you.",
      role: "assistant",
      tool_calls: [
        {
          function: {
            arguments: '{"location":"Paris"}',
            name: "get_weather",
          },
          id: "call_123",
          type: "function",
        },
      ],
    });
  });

  it("should handle user message with multiple text parts", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          { text: "First part.", type: "text" },
          { text: "Second part.", type: "text" },
        ],
        role: "user",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: [
        { text: "First part.", type: "text" },
        { text: "Second part.", type: "text" },
      ],
      role: "user",
    });
  });

  it("should handle reasoning-only assistant message by dropping content", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [{ text: "Thinking about this...", type: "reasoning" }],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "",
      role: "assistant",
      tool_calls: undefined,
    });
  });

  it("should handle empty reasoning text", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          { text: "", type: "reasoning" },
          { text: "Answer", type: "text" },
        ],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "Answer",
      role: "assistant",
      tool_calls: undefined,
    });
  });

  it("should handle empty user content array as array format", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [],
        role: "user",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    // Empty content array stays as array (not simplified to string)
    expect(result[0]).toEqual({
      content: [],
      role: "user",
    });
  });

  it("should handle empty assistant content array", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "",
      role: "assistant",
      tool_calls: undefined,
    });
  });

  it("should handle empty tool content array", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [],
        role: "tool",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(0);
  });

  it("should handle system message with empty string", () => {
    const prompt: LanguageModelV3Prompt = [{ content: "", role: "system" }];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "",
      role: "system",
    });
  });

  it("should handle multiple images in user message", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          { text: "Compare these images", type: "text" },
          {
            data: "base64data1",
            mediaType: "image/png",
            type: "file",
          },
          {
            data: "base64data2",
            mediaType: "image/jpeg",
            type: "file",
          },
        ],
        role: "user",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: [
        { text: "Compare these images", type: "text" },
        {
          image_url: { url: "data:image/png;base64,base64data1" },
          type: "image_url",
        },
        {
          image_url: { url: "data:image/jpeg;base64,base64data2" },
          type: "image_url",
        },
      ],
      role: "user",
    });
  });

  it("should handle reasoning with includeReasoning but empty text", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          { text: "", type: "reasoning" },
          { text: "Final", type: "text" },
        ],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt, { includeReasoning: true });

    expect(result).toHaveLength(1);
    // Empty reasoning should not produce <reasoning></reasoning> tags
    expect(result[0]).toEqual({
      content: "Final",
      role: "assistant",
      tool_calls: undefined,
    });
  });

  it("should handle tool-call with object input containing special characters", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          {
            input: { query: 'test "quotes" and \\ backslash' },
            toolCallId: "call_special",
            toolName: "search",
            type: "tool-call",
          },
        ],
        role: "assistant",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "",
      role: "assistant",
      tool_calls: [
        {
          function: {
            arguments: '{"query":"test \\"quotes\\" and \\\\ backslash"}',
            name: "search",
          },
          id: "call_special",
          type: "function",
        },
      ],
    });
  });

  it("should handle tool result with complex nested output", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        content: [
          {
            output: {
              type: "json" as const,
              value: {
                nested: {
                  array: [1, 2, { deep: true }],
                  null_value: null,
                },
              },
            },
            toolCallId: "call_nested",
            toolName: "get_data",
            type: "tool-result",
          },
        ],
        role: "tool",
      },
    ];

    const result = convertToSAPMessages(prompt);

    expect(result).toHaveLength(1);
    const content = (result[0] as { content: string }).content;
    const parsed = JSON.parse(content) as unknown;
    expect(parsed).toEqual({
      type: "json",
      value: {
        nested: {
          array: [1, 2, { deep: true }],
          null_value: null,
        },
      },
    });
  });

  it("should throw UnsupportedFunctionalityError for unknown user content type", () => {
    // Force an unknown content type to trigger the default case
    const prompt = [
      {
        content: [
          { data: "some data", type: "unknown_type" } as unknown as {
            text: string;
            type: "text";
          },
        ],
        role: "user",
      },
    ] as LanguageModelV3Prompt;

    expect(() => convertToSAPMessages(prompt)).toThrow("Content type unknown_type");
  });

  describe("Image data conversion edge cases", () => {
    it("should convert Uint8Array image data to base64", () => {
      const imageData = new Uint8Array([137, 80, 78, 71]); // PNG header bytes
      const prompt: LanguageModelV3Prompt = [
        {
          content: [
            { text: "What is this?", type: "text" },
            {
              data: imageData,
              mediaType: "image/png",
              type: "file",
            },
          ],
          role: "user",
        },
      ];

      const result = convertToSAPMessages(prompt);

      expect(result).toHaveLength(1);
      const userMessage = result[0] as {
        content: { image_url?: { url: string }; type: string }[];
        role: string;
      };
      expect(userMessage.content).toHaveLength(2);
      const imageContent = userMessage.content[1];
      expect(imageContent.type).toBe("image_url");
      expect(imageContent.image_url?.url).toMatch(/^data:image\/png;base64,iVBORw==/); // Base64 of PNG header
    });

    it("should convert Buffer image data to base64", () => {
      const imageData = Buffer.from([137, 80, 78, 71]); // PNG header bytes
      const prompt: LanguageModelV3Prompt = [
        {
          content: [
            { text: "What is this?", type: "text" },
            {
              data: imageData,
              mediaType: "image/png",
              type: "file",
            },
          ],
          role: "user",
        },
      ];

      const result = convertToSAPMessages(prompt);

      expect(result).toHaveLength(1);
      const userMessage = result[0] as {
        content: { image_url?: { url: string }; type: string }[];
        role: string;
      };
      expect(userMessage.content).toHaveLength(2);
      const imageContent = userMessage.content[1];
      expect(imageContent.type).toBe("image_url");
      expect(imageContent.image_url?.url).toMatch(/^data:image\/png;base64,iVBORw==/);
    });

    it("should convert buffer-like object with toString to base64", () => {
      // Simulate a buffer-like object that has toString method
      const bufferLike = {
        toString: (encoding?: string) => {
          if (encoding === "base64") {
            return "aGVsbG8="; // "hello" in base64
          }
          return "hello";
        },
      };

      const prompt: LanguageModelV3Prompt = [
        {
          content: [
            {
              data: bufferLike as unknown as Uint8Array,
              mediaType: "image/png",
              type: "file",
            },
          ],
          role: "user",
        },
      ];

      const result = convertToSAPMessages(prompt);

      expect(result).toHaveLength(1);
      const userMessage = result[0] as {
        content: { image_url?: { url: string }; type: string }[];
        role: string;
      };
      expect(userMessage.content[0].image_url?.url).toBe("data:image/png;base64,aGVsbG8=");
    });

    it("should throw UnsupportedFunctionalityError for unsupported image data type", () => {
      const unsupportedData = null; // null doesn't have toString and isn't handled by earlier checks

      const prompt: LanguageModelV3Prompt = [
        {
          content: [
            {
              data: unsupportedData as unknown as Uint8Array,
              mediaType: "image/png",
              type: "file",
            },
          ],
          role: "user",
        },
      ];

      expect(() => convertToSAPMessages(prompt)).toThrow("Unsupported file data type for image");
    });
  });

  it("should throw error for unsupported message role", () => {
    // Force an unsupported role to trigger the exhaustive check
    const prompt = [
      {
        content: "Test content",
        role: "unsupported_role",
      },
    ] as unknown as LanguageModelV3Prompt;

    expect(() => convertToSAPMessages(prompt)).toThrow("Unsupported role: unsupported_role");
  });
});
