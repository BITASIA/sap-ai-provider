import {
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import type {
  ChatMessage,
  SystemChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  ToolChatMessage,
} from "@sap-ai-sdk/orchestration";

/**
 * User chat message content item for multi-modal messages.
 */
interface UserContentItem {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

/**
 * Converts Vercel AI SDK prompt format to SAP AI SDK ChatMessage format.
 *
 * This function transforms the standardized LanguageModelV2Prompt format
 * used by the Vercel AI SDK into the ChatMessage format expected
 * by SAP AI SDK's OrchestrationClient.
 *
 * **Supported Features:**
 * - Text messages (system, user, assistant)
 * - Multi-modal messages (text + images)
 * - Tool calls and tool results
 * - Reasoning parts (converted to text content)
 * - Conversation history
 *
 * **Limitations:**
 * - Images must be in data URL format or accessible HTTPS URLs
 * - Audio messages are not supported
 * - File attachments (non-image) are not supported
 * - Reasoning parts are included in assistant text as `<reasoning>...</reasoning>` markers
 *
 * @param prompt - The Vercel AI SDK prompt to convert
 * @returns Array of SAP AI SDK compatible ChatMessage objects
 *
 * @throws {UnsupportedFunctionalityError} When unsupported message types are encountered
 *
 * @example
 * ```typescript
 * const prompt = [
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: [{ type: 'text', text: 'Hello!' }] }
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
 *       { type: 'file', mediaType: 'image/jpeg', data: 'base64...' }
 *     ]
 *   }
 * ];
 *
 * const sapMessages = convertToSAPMessages(prompt);
 * ```
 */
export interface ConvertToSAPMessagesOptions {
  /**
   * Include assistant reasoning parts in the serialized SAP messages.
   *
   * Reasoning parts can contain chain-of-thought. Default is false to avoid
   * leaking it into downstream systems.
   */
  includeReasoning?: boolean;
}

export function convertToSAPMessages(
  prompt: LanguageModelV2Prompt,
  options: ConvertToSAPMessagesOptions = {},
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const includeReasoning = options.includeReasoning ?? false;

  for (const message of prompt) {
    switch (message.role) {
      case "system": {
        const systemMessage: SystemChatMessage = {
          role: "system",
          content: message.content,
        };
        messages.push(systemMessage);
        break;
      }

      case "user": {
        // Build content parts for user messages
        const contentParts: UserContentItem[] = [];

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
              // SAP AI Core only supports image files
              if (!part.mediaType.startsWith("image/")) {
                throw new UnsupportedFunctionalityError({
                  functionality: "Only image files are supported",
                });
              }

              const imageUrl =
                part.data instanceof URL
                  ? part.data.toString()
                  : `data:${part.mediaType};base64,${String(part.data)}`;

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
                functionality: `Content type ${(part as { type: string }).type}`,
              });
            }
          }
        }

        // If only text content, use simple string format
        // Otherwise use array format for multi-modal
        const userMessage: UserChatMessage =
          contentParts.length === 1 && contentParts[0].type === "text"
            ? {
                role: "user",
                content: contentParts[0].text ?? "",
              }
            : {
                role: "user",
                content: contentParts as UserChatMessage["content"],
              };

        messages.push(userMessage);
        break;
      }

      case "assistant": {
        let text = "";
        const toolCalls: {
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }[] = [];

        for (const part of message.content) {
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "reasoning": {
              // SAP AI SDK doesn't support reasoning parts natively.
              // By default, drop them to avoid leaking chain-of-thought.
              // If explicitly enabled, preserve it as an XML marker.
              if (includeReasoning && part.text) {
                text += `<reasoning>${part.text}</reasoning>`;
              }
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  // AI SDK tool-call input can be either a JSON string or an object.
                  // SAP expects arguments as a JSON string.
                  arguments:
                    typeof part.input === "string"
                      ? part.input
                      : JSON.stringify(part.input),
                },
              });
              break;
            }
          }
        }

        const assistantMessage: AssistantChatMessage = {
          role: "assistant",
          content: text || "",
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        };
        messages.push(assistantMessage);
        break;
      }

      case "tool": {
        // Convert tool results to tool messages
        for (const part of message.content) {
          const toolMessage: ToolChatMessage = {
            role: "tool",
            tool_call_id: part.toolCallId,
            content: JSON.stringify(part.output),
          };
          messages.push(toolMessage);
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = message;
        throw new Error(
          `Unsupported role: ${(_exhaustiveCheck as { role: string }).role}`,
        );
      }
    }
  }

  return messages;
}
