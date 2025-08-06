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

// Schema for templating messages (can have structured content)
const sapAITemplatingMessageSchema = z.object({
  role: z.enum(["assistant", "user", "system", "tool"]),
  content: z.union([z.string(), z.array(sapAIContentPartSchema)]),
  tool_calls: z.array(sapAIToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
});

// Schema for LLM result messages (always string content)
const sapAIMessageSchema = z.object({
  role: z.enum(["assistant", "user", "system", "tool"]),
  content: z.string(),
  tool_calls: z.array(sapAIToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
});

const sapAIChoiceSchema = z.object({
  message: sapAIMessageSchema,
  finish_reason: z.string(),
});

const sapAIUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

const sapAILLMResultSchema = z.object({
  choices: z.array(sapAIChoiceSchema),
  usage: sapAIUsageSchema,
  id: z.string().optional(),
  object: z.string().optional(),
  created: z.number().optional(),
  model: z.string().optional(),
  system_fingerprint: z.string().optional(),
});

const sapAITemplatingResultSchema = z.array(sapAITemplatingMessageSchema);

export const sapAIResponseSchema = z.object({
  request_id: z.string(),
  module_results: z.object({
    llm: sapAILLMResultSchema,
    templating: sapAITemplatingResultSchema,
  }),
  orchestration_results: z
    .object({
      id: z.string().optional(),
      object: z.string().optional(),
      created: z.number().optional(),
      model: z.string().optional(),
      system_fingerprint: z.string().optional(),
      choices: z.array(sapAIChoiceSchema).optional(),
      usage: sapAIUsageSchema.optional(),
    })
    .optional(),
});

export type SAPAIResponse = z.infer<typeof sapAIResponseSchema>;
