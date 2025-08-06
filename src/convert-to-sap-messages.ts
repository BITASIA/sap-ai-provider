import {
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import { convertUint8ArrayToBase64 } from "@ai-sdk/provider-utils";

type SAPMessageContent =
  | string
  | Array<{
      type: "text" | "image_url";
      text?: string;
      image_url?: {
        url: string;
      };
    }>;

type SAPMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: SAPMessageContent | string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

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
              // Convert image to base64 data URL or use URL directly
              let imageUrl: string;

              if (part.data instanceof URL) {
                imageUrl = part.data.toString();
              } else {
                // Handle all other cases (string, Uint8Array, Buffer, ArrayBuffer)
                let base64Data: string;

                if (typeof part.data === "string") {
                  // Already a base64 string or data URL
                  if ((part.data as string).startsWith("data:")) {
                    imageUrl = part.data as string;
                  } else {
                    base64Data = part.data as string;
                    imageUrl = `data:${part.mediaType ?? "image/jpeg"};base64,${base64Data}`;
                  }
                } else {
                  // Binary data - convert to Uint8Array first, then to base64
                  let uint8Array: Uint8Array;
                  if (part.data instanceof ArrayBuffer) {
                    uint8Array = new Uint8Array(part.data);
                  } else {
                    uint8Array = part.data as Uint8Array;
                  }
                  base64Data = convertUint8ArrayToBase64(uint8Array);
                  imageUrl = `data:${part.mediaType ?? "image/jpeg"};base64,${base64Data}`;
                }
              }

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

        // Create a tool response message that SAP AI Core expects
        // messages.push({
        //   role: 'assistant',
        //   content: `Tool call ${toolResult.toolCallId} completed successfully. Result: ${JSON.stringify(toolResult.result)}`,
        // });
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
