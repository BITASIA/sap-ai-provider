import {
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";

/**
 * Content types supported by SAP AI Core messages.
 * Can be either a simple text string or an array of structured content parts
 * for multi-modal interactions (text + images).
 */
type SAPMessageContent =
  | string
  | Array<{
      /** Type of content part */
      type: "text" | "image_url";
      /** Text content (for text type) */
      text?: string;
      /** Image URL configuration (for image_url type) */
      image_url?: {
        /** URL of the image (data URL or HTTP URL) */
        url: string;
      };
    }>;

/**
 * Message format expected by SAP AI Core API.
 * This represents a single message in a conversation thread.
 */
type SAPMessage = {
  /** Message role indicating the sender */
  role: "system" | "user" | "assistant" | "tool";
  /** Message content (text or multi-modal) */
  content: SAPMessageContent | string;
  /** Tool calls made by the assistant (for function calling) */
  tool_calls?: Array<{
    /** Unique identifier for the tool call */
    id: string;
    /** Type of tool call (currently only "function" is supported) */
    type: "function";
    /** Function call details */
    function: { 
      /** Name of the function to call */
      name: string; 
      /** JSON string of function arguments */
      arguments: string 
    };
  }>;
  /** ID linking tool result to original tool call */
  tool_call_id?: string;
};

/**
 * Converts Vercel AI SDK prompt format to SAP AI Core message format.
 * 
 * This function transforms the standardized LanguageModelV2Prompt format
 * used by the Vercel AI SDK into the specific message format expected
 * by SAP AI Core's completion API.
 * 
 * **Supported Features:**
 * - Text messages (system, user, assistant)
 * - Multi-modal messages (text + images)
 * - Tool calls and tool results
 * - Conversation history
 * 
 * **Limitations:**
 * - Images must be in data URL format or accessible HTTP URLs
 * - Audio messages are not supported
 * - File attachments are not supported
 * 
 * @param prompt - The Vercel AI SDK prompt to convert
 * @returns Array of SAP AI Core compatible messages
 * 
 * @throws {UnsupportedFunctionalityError} When unsupported message types are encountered
 * 
 * @example
 * ```typescript
 * const prompt = [
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello!' }
 * ];
 * 
 * const sapMessages = convertToSAPMessages(prompt);
 * // Result: [
 * //   { role: 'system', content: 'You are a helpful assistant.' },
 * //   { role: 'user', content: 'Hello!' }
 * // ]
 * ```
 * 
 * @example
 * **Multi-modal with Image**
 * ```typescript
 * const prompt = [
 *   { 
 *     role: 'user', 
 *     content: [
 *       { type: 'text', text: 'What do you see in this image?' },
 *       { type: 'image', image: new URL('data:image/jpeg;base64,...') }
 *     ]
 *   }
 * ];
 * 
 * const sapMessages = convertToSAPMessages(prompt);
 * ```
 */
export function convertToSAPMessages(
  prompt: LanguageModelV2Prompt,
): SAPMessage[] {
  const messages: SAPMessage[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case "system": {
        messages.push({
          role: "system",
          content: message.content,
        });
        break;
      }

      case "user": {
        // Use SAP AI Core's structured content format for user messages
        const contentParts: Array<{
          type: "text" | "image_url";
          text?: string;
          image_url?: {
            url: string;
          };
        }> = [];

        for (const part of message.content) {
          switch (part.type) {
            case "text": {
              contentParts.push({
                type: "text",
                text: part.text,
              });
              break;
            }
            case "file": {
              // Convert image to base64 data URL or use URL directly, SAP AI Core only supports image files
              if (!part.mediaType.startsWith("image/")) {
                throw new UnsupportedFunctionalityError({
                  functionality: "Only image files are supported",
                });
              }

              const imageUrl =
                part.data instanceof URL
                  ? part.data.toString()
                  : `data:${part.mediaType};base64,${part.data}`;

              // Use SAP AI Core's exact format
              contentParts.push({
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              });
              break;
            }
            default: {
              throw new UnsupportedFunctionalityError({
                functionality: `Content type ${(part as any).type}`,
              });
            }
          }
        }

        // If only text content, use simple string format, otherwise use structured format
        if (contentParts.length === 1 && contentParts[0].type === "text") {
          messages.push({
            role: "user",
            content: contentParts[0].text!,
          });
        } else {
          messages.push({
            role: "user",
            content: contentParts,
          });
        }
        break;
      }

      case "assistant": {
        let text = "";
        const toolCalls: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }> = [];

        for (const part of message.content) {
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                },
              });
              break;
            }
          }
        }

        messages.push({
          role: "assistant",
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });
        break;
      }

      case "tool": {
        // SAP AI Core expects tool responses to follow tool calls
        // Convert tool results to a format that SAP AI Core can understand
        for (const part of message.content) {
          if (part.type === "tool-result") {
            messages.push({
              role: "tool",
              tool_call_id: part.toolCallId,
              content: JSON.stringify(part.output),
            });
          }
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = message;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
