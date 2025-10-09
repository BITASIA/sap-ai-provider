import { z } from "zod";

const sapAIToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

// Schema for structured content parts (used in templating)
const sapAIContentPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string(),
      detail: z.string().optional(),
    }),
  }),
]);

// Chat message content for templating/messages_history
const sapAIChatMessageContentSchema = z.union([
  z.string(),
  z.array(sapAIContentPartSchema).min(1),
]);

// Templating messages follow the same shapes as messages_history
const sapAISystemTemplatingMessageSchema = z.object({
  role: z.literal("system"),
  content: sapAIChatMessageContentSchema,
});

const sapAIUserTemplatingMessageSchema = z.object({
  role: z.literal("user"),
  content: sapAIChatMessageContentSchema,
});

const sapAIAssistantTemplatingMessageSchema = z.object({
  role: z.literal("assistant"),
  content: sapAIChatMessageContentSchema.optional(),
  refusal: z.string().optional(),
  tool_calls: z.array(sapAIToolCallSchema).optional(),
});

const sapAIToolTemplatingMessageSchema = z.object({
  role: z.literal("tool"),
  tool_call_id: z.string(),
  content: sapAIChatMessageContentSchema,
});

const sapAIDeveloperTemplatingMessageSchema = z.object({
  role: z.literal("developer"),
  content: sapAIChatMessageContentSchema,
});

const sapAITemplatingMessageSchema = z.union([
  sapAISystemTemplatingMessageSchema,
  sapAIUserTemplatingMessageSchema,
  sapAIAssistantTemplatingMessageSchema,
  sapAIToolTemplatingMessageSchema,
  sapAIDeveloperTemplatingMessageSchema,
]);

// Schema for LLM result messages (assistant-only per OpenAI shape), include refusal
const sapAIResponseChatMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().nullable(),
  tool_calls: z.array(sapAIToolCallSchema).optional(),
  refusal: z.string().optional(),
});

const sapAIChatCompletionTokenLogprobSchema = z.object({
  token: z.string(),
  logprob: z.number(),
  bytes: z.array(z.number().int()).optional(),
  top_logprobs: z
    .array(
      z.object({
        token: z.string(),
        logprob: z.number(),
        bytes: z.array(z.number().int()).optional(),
      }),
    )
    .optional(),
});

const sapAIChoiceLogprobsSchema = z.object({
  content: z.array(sapAIChatCompletionTokenLogprobSchema).optional(),
  refusal: z.array(sapAIChatCompletionTokenLogprobSchema).optional(),
});

const sapAIChoiceSchema = z.object({
  index: z.number(),
  message: sapAIResponseChatMessageSchema,
  logprobs: sapAIChoiceLogprobsSchema.optional(),
  finish_reason: z.string(),
});

const sapAIUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

// Common LLM result (used by v1 module_results.llm, v2 intermediate_results.llm and v2 final_result)
const sapAILLMResultSchema = z.object({
  choices: z.array(sapAIChoiceSchema),
  usage: sapAIUsageSchema,
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  system_fingerprint: z.string().optional(),
});

// LLMChoice schema reused in output_unmasking (same as OpenAI choice shape)
const sapAILLMChoiceSchema = z.object({
  index: z.number(),
  message: sapAIResponseChatMessageSchema,
  finish_reason: z.string(),
  logprobs: z.any().optional(),
});

const sapAITemplatingResultSchema = z.array(sapAITemplatingMessageSchema);

// Orchestration v2 top-level response supports both intermediate_results and final_result
export const sapAIResponseSchema = z.object({
  request_id: z.string(),
  // v2 preferred fields
  intermediate_results: z
    .object({
      templating: sapAITemplatingResultSchema.optional(),
      llm: sapAILLMResultSchema.optional(),
      output_unmasking: z.array(sapAILLMChoiceSchema).optional(),
    })
    .optional(),
  final_result: sapAILLMResultSchema.optional(),

  // legacy / v1 fields for backward compatibility
  module_results: z
    .object({
      llm: sapAILLMResultSchema.optional(),
      templating: sapAITemplatingResultSchema.optional(),
    })
    .optional(),
});

// Streaming schemas for SAP AI Core responses
const sapAIStreamChoiceSchema = z.object({
  delta: z.object({
    role: z.enum(["assistant"]).optional(),
    content: z.string().optional(),
    tool_calls: z.array(sapAIToolCallSchema).optional(),
    refusal: z.string().optional(),
  }),
  finish_reason: z.string().nullish(),
  index: z.number(),
  logprobs: sapAIChoiceLogprobsSchema.optional(),
});

const sapAIStreamLLMResultSchema = z.object({
  choices: z.array(sapAIStreamChoiceSchema),
  usage: sapAIUsageSchema.nullish(),
  id: z.string().optional(),
  object: z.string().optional(),
  created: z.number().optional(),
  model: z.string().optional(),
  system_fingerprint: z.string().optional(),
});

export const sapAIStreamResponseSchema = z.object({
  request_id: z.string(),
  // v2 streaming shape
  intermediate_results: z
    .object({
      templating: z.array(sapAITemplatingMessageSchema).optional(),
      llm: sapAIStreamLLMResultSchema.optional(),
      output_unmasking: z.array(sapAIStreamChoiceSchema).optional(),
    })
    .optional(),
  final_result: sapAIStreamLLMResultSchema.optional(),

  // legacy streaming support
  module_results: z
    .object({
      llm: sapAIStreamLLMResultSchema.optional(),
      templating: z.array(sapAITemplatingMessageSchema).optional(),
    })
    .optional(),
});

export type SAPAIResponse = z.infer<typeof sapAIResponseSchema>;
export type SAPAIStreamResponse = z.infer<typeof sapAIStreamResponseSchema>;
