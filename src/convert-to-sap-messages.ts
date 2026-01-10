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
import { Buffer } from "node:buffer";

/**
 * User chat message content item for multi-modal messages.
 * Maps to SAP AI SDK format for user message content.
 *
 * @internal
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
 * @param options - Optional conversion settings
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
/**
 * Options for converting AI SDK prompts to SAP messages.
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

              // Validate specific image formats supported by most models
              const supportedFormats = [
                "image/png",
                "image/jpeg",
                "image/jpg",
                "image/gif",
                "image/webp",
              ];
              if (!supportedFormats.includes(part.mediaType.toLowerCase())) {
                console.warn(
                  `Image format ${part.mediaType} may not be supported by all models. ` +
                    `Recommended formats: PNG, JPEG, GIF, WebP`,
                );
              }

              // Convert image data to data URL format supporting multiple input types
              let imageUrl: string;

              if (part.data instanceof URL) {
                imageUrl = part.data.toString();
              } else if (typeof part.data === "string") {
                imageUrl = `data:${part.mediaType};base64,${part.data}`;
              } else if (part.data instanceof Uint8Array) {
                const base64Data = Buffer.from(part.data).toString("base64");
                imageUrl = `data:${part.mediaType};base64,${base64Data}`;
              } else if (Buffer.isBuffer(part.data)) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
                const base64Data = part.data.toString("base64");
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                imageUrl = `data:${part.mediaType};base64,${base64Data}`;
              } else {
                // Fallback for unknown data types
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
                const base64Data = part.data.toString("base64");
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                imageUrl = `data:${part.mediaType};base64,${base64Data}`;
              }

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
              // By default (when includeReasoning is false), drop them to avoid leaking chain-of-thought.
              // If explicitly enabled, preserve it as an XML marker.
              if (includeReasoning && part.text) {
                text += `<reasoning>${part.text}</reasoning>`;
              }
              break;
            }
            case "tool-call": {
              // Normalize tool call input: validate and convert to JSON string
              // AI SDK provides either JSON strings or objects; SAP expects valid JSON
              let argumentsJson: string;

              if (typeof part.input === "string") {
                // Validate it's valid JSON before passing it through
                try {
                  JSON.parse(part.input);
                  argumentsJson = part.input;
                } catch {
                  // Not valid JSON, stringify the string itself
                  argumentsJson = JSON.stringify(part.input);
                }
              } else {
                // Object: stringify it
                argumentsJson = JSON.stringify(part.input);
              }

              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: argumentsJson,
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
