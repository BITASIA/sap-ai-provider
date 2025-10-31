import { z } from "zod";

/**
 * Zod schema for SAP AI Core function tool definition (v2 API).
 * Defines the structure for function calling tools in the orchestration API.
 */
const sapAIToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    strict: z.boolean().optional(),
    parameters: z.record(z.any()),
  }),
});

/**
 * Zod schema for text response format.
 * Used when requesting plain text output.
 */
const sapAIResponseFormatTextSchema = z.object({
  type: z.literal("text"),
});

/**
 * Zod schema for JSON object response format.
 * Used when requesting JSON-formatted output without a specific schema.
 */
const sapAIResponseFormatJsonObjectSchema = z.object({
  type: z.literal("json_object"),
});

/**
 * Zod schema for JSON schema response format (structured output).
 * Used when requesting output that follows a specific JSON schema.
 */
const sapAIResponseFormatJsonSchemaSchema = z.object({
  type: z.literal("json_schema"),
  json_schema: z.object({
    description: z.string().optional(),
    name: z
      .string()
      .max(64)
      .regex(/^[a-zA-Z0-9-_]+$/),
    schema: z.any().optional(),
    strict: z.boolean().nullable().optional(),
  }),
});

/**
 * Zod schema for prompt templating configuration (v2 API).
 * Defines the structure for prompt templates, response formats, and tools.
 */
const sapAITemplatingPromptSchema = z.object({
  template: z.any(), // we convert SDK prompt externally
  defaults: z.record(z.any()).optional(),
  response_format: z
    .union([
      sapAIResponseFormatTextSchema,
      sapAIResponseFormatJsonObjectSchema,
      sapAIResponseFormatJsonSchemaSchema,
    ])
    .optional(),
  tools: z.array(sapAIToolSchema).optional(),
});

/**
 * Zod schema for LLM model configuration (v2 API).
 * Defines model name, version, and generation parameters.
 */
const sapAILLMModelSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  params: z
    .object({
      temperature: z.number().optional(),
      max_tokens: z.number().optional(),
      top_p: z.number().optional(),
      frequency_penalty: z.number().optional(),
      presence_penalty: z.number().optional(),
      n: z.number().optional(),
    })
    .optional(),
});

/**
 * Zod schema for orchestration modules configuration (v2 API).
 * Contains prompt templating and optional masking module.
 */
const sapAIModulesSchema = z.object({
  prompt_templating: z.object({
    prompt: sapAITemplatingPromptSchema,
    model: sapAILLMModelSchema,
  }),
});

/**
 * Zod schema for streaming configuration (v2 API).
 * Defines streaming behavior including chunk size and delimiters.
 */
const sapAIStreamSchema = z.object({
  enabled: z.boolean(),
  chunk_size: z.number().optional(),
  delimiters: z.array(z.string()).optional(),
});

/**
 * Zod schema for text content part in messages.
 * Represents a text segment within a message.
 */
const sapAITextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

/**
 * Zod schema for image URL content part in messages.
 * Represents an image within a message (supports URLs and data URIs).
 */
const sapAIImageUrlSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({ url: z.string(), detail: z.string().optional() }),
});

/**
 * Zod schema for chat message content.
 * Can be a simple string or array of content parts (text + images).
 */
const sapAIChatMessageContentSchema = z.union([
  z.string(),
  z.array(z.union([sapAITextContentSchema, sapAIImageUrlSchema])).min(1),
]);

/**
 * Zod schema for tool call in assistant messages.
 * Represents a function call made by the model.
 */
const sapAIMessageToolCallSchema = z.object({
  id: z.string().optional(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

/**
 * Zod schema for system message.
 * Sets the behavior and context for the AI assistant.
 */
const sapAISystemMessageSchema = z.object({
  role: z.literal("system"),
  content: sapAIChatMessageContentSchema,
});

/**
 * Zod schema for user message.
 * Represents input from the user (text or multi-modal).
 */
const sapAIUserMessageSchema = z.object({
  role: z.literal("user"),
  content: sapAIChatMessageContentSchema,
});

/**
 * Zod schema for assistant message.
 * Represents AI assistant response with optional tool calls.
 */
const sapAIAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: sapAIChatMessageContentSchema.optional(),
  refusal: z.string().optional(),
  tool_calls: z.array(sapAIMessageToolCallSchema).optional(),
});

/**
 * Zod schema for tool message.
 * Represents the result of a tool/function execution.
 */
const sapAIToolMessageSchema = z.object({
  role: z.literal("tool"),
  tool_call_id: z.string(),
  content: sapAIChatMessageContentSchema,
});

/**
 * Zod schema for developer message.
 * Used for system-level instructions (similar to system message).
 */
const sapAIDeveloperMessageSchema = z.object({
  role: z.literal("developer"),
  content: sapAIChatMessageContentSchema,
});

/**
 * Zod schema for message history.
 * Union of all message types supported by the API.
 */
const sapAIMessageHistorySchema = z.union([
  sapAISystemMessageSchema,
  sapAIUserMessageSchema,
  sapAIAssistantMessageSchema,
  sapAIToolMessageSchema,
  sapAIDeveloperMessageSchema,
]);

/**
 * Zod schema for the complete SAP AI Core request (v2 API).
 * Validates the structure of orchestration API requests.
 *
 * @example
 * ```typescript
 * const request = {
 *   config: {
 *     modules: {
 *       prompt_templating: {
 *         prompt: { template: [...], tools: [...] },
 *         model: { name: 'gpt-4o', version: 'latest' }
 *       }
 *     }
 *   }
 * };
 * sapAIRequestSchema.parse(request);
 * ```
 */
export const sapAIRequestSchema = z.object({
  config: z.object({
    modules: sapAIModulesSchema,
    stream: sapAIStreamSchema.optional(),
  }),
  placeholder_values: z.record(z.string()).optional(),
  messages_history: z.array(sapAIMessageHistorySchema).optional(),
});

/**
 * TypeScript type for SAP AI Core request.
 * Inferred from the request schema.
 */
export type SAPAIRequest = z.infer<typeof sapAIRequestSchema>;
