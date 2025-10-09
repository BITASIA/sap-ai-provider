import { z } from "zod";

// v2 tool definition (under prompt_templating.prompt.tools)
const sapAIToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    strict: z.boolean().optional(),
    parameters: z.record(z.any()),
  }),
});

// Response format schemas for templating prompt (OpenAI-compatible)
const sapAIResponseFormatTextSchema = z.object({
  type: z.literal("text"),
});

const sapAIResponseFormatJsonObjectSchema = z.object({
  type: z.literal("json_object"),
});

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

// v2 prompt config
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

// v2 model config under prompt_templating.model
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

// v2 modules config
const sapAIModulesSchema = z.object({
  prompt_templating: z.object({
    prompt: sapAITemplatingPromptSchema,
    model: sapAILLMModelSchema,
  }),
});

// v2 stream config
const sapAIStreamSchema = z.object({
  enabled: z.boolean(),
  chunk_size: z.number().optional(),
  delimiters: z.array(z.string()).optional(),
});

// Chat message content schemas (simplified per API spec)
const sapAITextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
const sapAIImageUrlSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({ url: z.string(), detail: z.string().optional() }),
});
const sapAIChatMessageContentSchema = z.union([
  z.string(),
  z.array(z.union([sapAITextContentSchema, sapAIImageUrlSchema])).min(1),
]);

// Tool calls inside assistant messages
const sapAIMessageToolCallSchema = z.object({
  id: z.string().optional(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

// ChatMessage union (system | user | assistant | tool | developer)
const sapAISystemMessageSchema = z.object({
  role: z.literal("system"),
  content: sapAIChatMessageContentSchema,
});

const sapAIUserMessageSchema = z.object({
  role: z.literal("user"),
  content: sapAIChatMessageContentSchema,
});

const sapAIAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: sapAIChatMessageContentSchema.optional(),
  refusal: z.string().optional(),
  tool_calls: z.array(sapAIMessageToolCallSchema).optional(),
});

const sapAIToolMessageSchema = z.object({
  role: z.literal("tool"),
  tool_call_id: z.string(),
  content: sapAIChatMessageContentSchema,
});

const sapAIDeveloperMessageSchema = z.object({
  role: z.literal("developer"),
  content: sapAIChatMessageContentSchema,
});

const sapAIMessageHistorySchema = z.union([
  sapAISystemMessageSchema,
  sapAIUserMessageSchema,
  sapAIAssistantMessageSchema,
  sapAIToolMessageSchema,
  sapAIDeveloperMessageSchema,
]);

export const sapAIRequestSchema = z.object({
  config: z.object({
    modules: sapAIModulesSchema,
    stream: sapAIStreamSchema.optional(),
  }),
  placeholder_values: z.record(z.string()).optional(),
  messages_history: z.array(sapAIMessageHistorySchema).optional(),
});

export type SAPAIRequest = z.infer<typeof sapAIRequestSchema>;
