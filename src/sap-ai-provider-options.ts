/**
 * Provider options schemas for SAP AI models.
 *
 * These schemas define the options that can be passed per-call via `providerOptions['sap-ai']`.
 * They use Zod for runtime validation and are integrated with the AI SDK's `parseProviderOptions` helper.
 *
 * The schemas are also used to validate constructor settings, ensuring consistent validation
 * across both configuration paths.
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
 *
 * const provider = createSAPAIProvider();
 *
 * const result = await generateText({
 *   model: provider('gpt-4o'),
 *   prompt: 'Hello',
 *   providerOptions: {
 *     'sap-ai': {
 *       includeReasoning: true,
 *       modelParams: { temperature: 0.8 }
 *     }
 *   }
 * });
 * ```
 * @module
 */

import type { InferSchema } from "@ai-sdk/provider-utils";

import { lazySchema, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";

/**
 * The provider identifier used for provider options.
 * Use this key in `providerOptions` to pass SAP AI-specific options.
 * @example
 * ```typescript
 * providerOptions: {
 *   [SAP_AI_PROVIDER_NAME]: { includeReasoning: true }
 * }
 * ```
 */
export const SAP_AI_PROVIDER_NAME = "sap-ai" as const;

/**
 * Zod schema for model generation parameters.
 *
 * This schema is used for validating both:
 * - Constructor `modelParams` settings
 * - Per-call `providerOptions['sap-ai'].modelParams`
 *
 * Using a single schema ensures consistent validation rules across both paths.
 * @internal
 */
export const modelParamsSchema = z
  .object({
    /**
     * Frequency penalty between -2.0 and 2.0.
     * Positive values penalize tokens based on their frequency in the text so far.
     */
    frequencyPenalty: z.number().min(-2).max(2).optional(),

    /**
     * Maximum number of tokens to generate.
     * Must be a positive integer.
     */
    maxTokens: z.number().int().positive().optional(),

    /**
     * Number of completions to generate.
     * Must be a positive integer.
     * Note: Not supported by Amazon and Anthropic models.
     */
    n: z.number().int().positive().optional(),

    /**
     * Whether to enable parallel tool calls.
     * When enabled, the model can call multiple tools in parallel.
     */
    parallel_tool_calls: z.boolean().optional(),

    /**
     * Presence penalty between -2.0 and 2.0.
     * Positive values penalize tokens that have appeared in the text so far.
     */
    presencePenalty: z.number().min(-2).max(2).optional(),

    /**
     * Sampling temperature between 0 and 2.
     * Higher values make output more random, lower values more deterministic.
     */
    temperature: z.number().min(0).max(2).optional(),

    /**
     * Nucleus sampling parameter between 0 and 1.
     * Controls diversity via cumulative probability cutoff.
     */
    topP: z.number().min(0).max(1).optional(),
  })
  .catchall(z.unknown());

/**
 * TypeScript type for model generation parameters.
 * Inferred from the Zod schema for type safety.
 */
export type ModelParams = z.infer<typeof modelParamsSchema>;

/**
 * Validates model parameters from constructor settings.
 *
 * This function validates the `modelParams` object passed to model constructors,
 * ensuring values are within valid ranges before any API calls are made.
 * @param modelParams - The model parameters to validate
 * @returns The validated model parameters with proper typing
 * @throws {z.ZodError} If validation fails with details about invalid fields
 * @example
 * ```typescript
 * // In constructor
 * if (settings.modelParams) {
 *   validateModelParamsSettings(settings.modelParams);
 * }
 * ```
 */
export function validateModelParamsSettings(modelParams: unknown): ModelParams {
  return modelParamsSchema.parse(modelParams);
}

/**
 * Zod schema for SAP AI language model provider options.
 *
 * These options can be passed per-call via `providerOptions['sap-ai']` to override
 * constructor settings or provide request-specific configuration.
 * @example
 * ```typescript
 * const result = await generateText({
 *   model: provider('gpt-4o'),
 *   prompt: 'Hello',
 *   providerOptions: {
 *     'sap-ai': {
 *       includeReasoning: true,
 *       modelParams: { temperature: 0.7, maxTokens: 1000 }
 *     }
 *   }
 * });
 * ```
 */
export const sapAILanguageModelProviderOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Whether to include assistant reasoning parts in the response.
       * Overrides the constructor `includeReasoning` setting for this specific call.
       *
       * Reasoning parts contain internal model chain-of-thought reasoning.
       * Enable for debugging/analysis; disable for production applications.
       */
      includeReasoning: z.boolean().optional(),

      /**
       * Model generation parameters for this specific call.
       * These override the corresponding constructor `modelParams` settings.
       */
      modelParams: modelParamsSchema.optional(),
    }),
  ),
);

/**
 * TypeScript type for SAP AI language model provider options.
 * Inferred from the Zod schema for type safety.
 */
export type SAPAILanguageModelProviderOptions = InferSchema<
  typeof sapAILanguageModelProviderOptions
>;

/**
 * Zod schema for SAP AI embedding model provider options.
 *
 * These options can be passed per-call via `providerOptions['sap-ai']` to override
 * constructor settings or provide request-specific configuration.
 * @example
 * ```typescript
 * const { embedding } = await embed({
 *   model: provider.embedding('text-embedding-ada-002'),
 *   value: 'Hello, world!',
 *   providerOptions: {
 *     'sap-ai': {
 *       type: 'query'
 *     }
 *   }
 * });
 * ```
 */
export const sapAIEmbeddingProviderOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Additional model parameters for this call.
       * Passed directly to the embedding API.
       */
      modelParams: z.record(z.string(), z.unknown()).optional(),

      /**
       * Embedding task type for this specific call.
       * Overrides the constructor `type` setting.
       *
       * - `text`: General-purpose text embeddings (default)
       * - `query`: Optimized for search queries
       * - `document`: Optimized for document content
       */
      type: z.enum(["document", "query", "text"]).optional(),
    }),
  ),
);

/**
 * TypeScript type for SAP AI embedding model provider options.
 * Inferred from the Zod schema for type safety.
 */
export type SAPAIEmbeddingProviderOptions = InferSchema<typeof sapAIEmbeddingProviderOptions>;
