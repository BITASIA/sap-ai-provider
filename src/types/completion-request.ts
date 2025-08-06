import { z } from "zod";

const sapAIToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.any()),
  }),
});

const sapAILLMConfigSchema = z.object({
  model_name: z.string(),
  model_version: z.string(),
  model_params: z
    .object({
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
      topP: z.number().optional(),
    })
    .optional(),
  response_format: z
    .object({
      type: z.literal("json_object"),
    })
    .optional(),
  tools: z.array(sapAIToolSchema).optional(),
});

const sapAIMessageSchema = z.object({
  role: z.enum(["assistant", "user", "system"]),
  content: z.string(),
});

export const sapAIRequestSchema = z.object({
  orchestration_config: z.object({
    module_configurations: z.object({
      llm_module_config: sapAILLMConfigSchema,
    }),
  }),
  input_params: z.object({
    messages: z.array(sapAIMessageSchema),
  }),
});

export type SAPAIRequest = z.infer<typeof sapAIRequestSchema>;
