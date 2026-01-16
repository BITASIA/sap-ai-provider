import type {
  AssistantChatMessage,
  ChatMessage,
  SystemChatMessage,
  ToolChatMessage,
  UserChatMessage,
} from "@sap-ai-sdk/orchestration";

import { LanguageModelV3Prompt, UnsupportedFunctionalityError } from "@ai-sdk/provider";
import { Buffer } from "node:buffer";

/**
 * Converts AI SDK prompt format to SAP AI SDK ChatMessage format.
 *
 * Transforms the AI SDK prompt format into the ChatMessage format
 * expected by SAP AI SDK's OrchestrationClient.
 *
 * **Supported Features:**
 * - Text messages (system, user, assistant)
 * - Multi-modal messages (text + images)
 * - Tool calls and tool results
 * - Reasoning parts (optional)
 * - Conversation history
 *
 * **Limitations:**
 * - Images must be in data URL format or accessible HTTPS URLs
 * - Audio messages are not supported
 * - File attachments (non-image) are not supported
 *
 * **Behavior:**
 * - Reasoning parts are dropped by default; when enabled via `includeReasoning`, they are preserved inline as `<reasoning>...</reasoning>` markers
 * @see {@link https://sdk.vercel.ai/docs/ai-sdk-core/prompt-engineering Vercel AI SDK Prompt Engineering}
 * @see {@link https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/orchestration SAP AI Core Orchestration}
 * @param prompt - The AI SDK prompt to convert
 * @param options - Optional conversion settings
 * @returns Array of SAP AI SDK compatible ChatMessage objects
 * @throws {UnsupportedFunctionalityError} When unsupported message types are encountered
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
   * Include assistant reasoning parts in the converted messages.
   *
   * When false (default), reasoning content is dropped
   * When true, reasoning is preserved as `<reasoning>...</reasoning>` markers
   */
  includeReasoning?: boolean;
}

/**
 * User chat message content item for multi-modal messages.
 * Maps to SAP AI SDK format for user message content.
 * @internal
 */
interface UserContentItem {
  image_url?: {
    url: string;
  };
  text?: string;
  type: "image_url" | "text";
}

/**
 * Converts AI SDK prompt format to SAP AI SDK ChatMessage format.
 * @param prompt - The AI SDK prompt to convert
 * @param options - Optional conversion settings
 * @returns Array of SAP AI SDK compatible ChatMessage objects
 */
export function convertToSAPMessages(
  prompt: LanguageModelV3Prompt,
  options: ConvertToSAPMessagesOptions = {},
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const includeReasoning = options.includeReasoning ?? false;

  for (const message of prompt) {
    switch (message.role) {
      case "assistant": {
        let text = "";
        const toolCalls: {
          function: { arguments: string; name: string };
          id: string;
          type: "function";
        }[] = [];

        for (const part of message.content) {
          switch (part.type) {
            case "reasoning": {
              // SAP AI SDK doesn't support reasoning parts natively
              // Drop them by default, or preserve as <reasoning>...</reasoning> when enabled
              if (includeReasoning && part.text) {
                text += `<reasoning>${part.text}</reasoning>`;
              }
              break;
            }
            case "text": {
              text += part.text;
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
                function: {
                  arguments: argumentsJson,
                  name: part.toolName,
                },
                id: part.toolCallId,
                type: "function",
              });
              break;
            }
          }
        }

        const assistantMessage: AssistantChatMessage = {
          content: text || "",
          role: "assistant",
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        };
        messages.push(assistantMessage);
        break;
      }

      case "system": {
        const systemMessage: SystemChatMessage = {
          content: message.content,
          role: "system",
        };
        messages.push(systemMessage);
        break;
      }

      case "tool": {
        for (const part of message.content) {
          // Only process tool-result parts (approval responses are not supported)
          if (part.type === "tool-result") {
            const toolMessage: ToolChatMessage = {
              content: JSON.stringify(part.output),
              role: "tool",
              tool_call_id: part.toolCallId,
            };
            messages.push(toolMessage);
          }
        }
        break;
      }

      case "user": {
        const contentParts: UserContentItem[] = [];

        for (const part of message.content) {
          switch (part.type) {
            case "file": {
              // Only image files are supported for multi-modal inputs in SAP AI Core
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
                // Convert Uint8Array to base64 via Node.js Buffer
                const base64Data = Buffer.from(part.data).toString("base64");
                imageUrl = `data:${part.mediaType};base64,${base64Data}`;
              } else if (Buffer.isBuffer(part.data)) {
                const base64Data = Buffer.from(part.data).toString("base64");
                imageUrl = `data:${part.mediaType};base64,${base64Data}`;
              } else {
                // Defensive fallback for unexpected data types
                const maybeBufferLike = part.data as unknown;

                if (
                  maybeBufferLike !== null &&
                  typeof maybeBufferLike === "object" &&
                  "toString" in (maybeBufferLike as Record<string, unknown>)
                ) {
                  const base64Data = (
                    maybeBufferLike as {
                      toString: (encoding?: string) => string;
                    }
                  ).toString("base64");
                  imageUrl = `data:${part.mediaType};base64,${base64Data}`;
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality:
                      "Unsupported file data type for image. Expected URL, base64 string, or Uint8Array.",
                  });
                }
              }

              contentParts.push({
                image_url: {
                  url: imageUrl,
                },
                type: "image_url",
              });
              break;
            }
            case "text": {
              contentParts.push({
                text: part.text,
                type: "text",
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
                content: contentParts[0].text ?? "",
                role: "user",
              }
            : {
                content: contentParts as UserChatMessage["content"],
                role: "user",
              };

        messages.push(userMessage);
        break;
      }

      default: {
        const _exhaustiveCheck: never = message;
        throw new Error(`Unsupported role: ${(_exhaustiveCheck as { role: string }).role}`);
      }
    }
  }

  return messages;
}
