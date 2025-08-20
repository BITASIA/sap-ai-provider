import {
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";

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

/**
 * Converts Vercel AI SDK prompt to SAP AI Core messages format
 * @param prompt The prompt from Vercel AI SDK
 * @returns Array of SAP AI Core compatible messages
 */
export function convertToSAPMessages(
  prompt: LanguageModelV2Prompt,
): SAPMessage[] {
  const messages: SAPMessage[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case "system": {
        messages.push(convertSystemMessage(message.content));
        break;
      }

      case "user": {
        messages.push(convertUserMessage(message.content));
        break;
      }

      case "assistant": {
        messages.push(convertAssistantMessage(message.content));
        break;
      }

      case "tool": {
        messages.push(...convertToolMessages(message.content));
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

/**
 * Converts system message to SAP format
 */
function convertSystemMessage(content: string): SAPMessage {
  return {
    role: "system",
    content: content,
  };
}

/**
 * Converts user message with potential multi-modal content
 */
function convertUserMessage(content: any[]): SAPMessage {
  const contentParts = content.map(convertContentPart);

  // If only text content, use simple string format
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role: "user",
      content: contentParts[0].text!,
    };
  }

  return {
    role: "user",
    content: contentParts,
  };
}

/**
 * Converts individual content part (text or image)
 */
function convertContentPart(part: any) {
  switch (part.type) {
    case "text": {
      return {
        type: "text",
        text: part.text,
      };
    }
    case "file": {
      return convertFilePart(part);
    }
    default: {
      throw new UnsupportedFunctionalityError({
        functionality: `Content type ${part.type}`,
      });
    }
  }
}

/**
 * Converts file part (currently only images supported)
 */
function convertFilePart(part: any) {
  if (!part.mediaType.startsWith("image/")) {
    throw new UnsupportedFunctionalityError({
      functionality: "Only image files are supported",
    });
  }

  const imageUrl =
    part.data instanceof URL
      ? part.data.toString()
      : `data:${part.mediaType};base64,${part.data}`;

  return {
    type: "image_url",
    image_url: {
      url: imageUrl,
    },
  };
}

/**
 * Converts assistant message with potential tool calls
 */
function convertAssistantMessage(content: any[]): SAPMessage {
  let text = "";
  const toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];

  for (const part of content) {
    if (part.type === "text") {
      text += part.text;
    } else if (part.type === "tool-call") {
      toolCalls.push({
        id: part.toolCallId,
        type: "function",
        function: {
          name: part.toolName,
          arguments: JSON.stringify(part.input),
        },
      });
    }
  }

  return {
    role: "assistant",
    content: text,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

/**
 * Converts tool result messages
 */
function convertToolMessages(content: any[]): SAPMessage[] {
  const messages: SAPMessage[] = [];

  for (const part of content) {
    if (part.type === "tool-result") {
      messages.push({
        role: "tool",
        tool_call_id: part.toolCallId,
        content: JSON.stringify(part.output),
      });
    }
  }

  return messages;
}