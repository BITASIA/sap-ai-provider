import type {
  MaskingModule,
  FilteringModule,
  ChatModel,
  ChatCompletionTool,
} from "@sap-ai-sdk/orchestration";

/**
 * Settings for configuring SAP AI Core model behavior.
 *
 * These settings control model parameters, data masking, content filtering,
 * and tool usage. Settings can be provided at provider-level (defaults) or
 * per-model call (overrides).
 *
 * @example
 * **Basic usage with model parameters**
 * ```typescript
 * const model = provider('gpt-4o', {
 *   modelParams: {
 *     temperature: 0.7,
 *     maxTokens: 2000
 *   }
 * });
 * ```
 *
 * @example
 * **With data masking (DPI)**
 * ```typescript
 * import { buildDpiMaskingProvider } from '@mymediset/sap-ai-provider';
 *
 * const model = provider('gpt-4o', {
 *   masking: {
 *     masking_providers: [
 *       buildDpiMaskingProvider({
 *         method: 'anonymization',
 *         entities: ['profile-email', 'profile-person']
 *       })
 *     ]
 *   }
 * });
 * ```
 *
 * @example
 * **With content filtering**
 * ```typescript
 * import { buildAzureContentSafetyFilter } from '@mymediset/sap-ai-provider';
 *
 * const model = provider('gpt-4o', {
 *   filtering: {
 *     input: {
 *       filters: [buildAzureContentSafetyFilter('input', { hate: 'ALLOW_SAFE' })]
 *     }
 *   }
 * });
 * ```
 */
export interface SAPAISettings {
  /**
   * Specific version of the model to use.
   * If not provided, the latest version will be used.
   */
  modelVersion?: string;

  /**
   * Whether to include assistant reasoning parts in the SAP prompt conversion.
   *
   * Reasoning parts may contain internal model reasoning that you may not want
   * to persist or show to users
   */
  includeReasoning?: boolean;

  /**
   * Model generation parameters that control the output.
   */
  modelParams?: {
    /**
     * Maximum number of tokens to generate.
     * Higher values allow for longer responses but increase latency and cost.
     */
    maxTokens?: number;

    /**
     * Sampling temperature between 0 and 2.
     * Higher values make output more random, lower values more deterministic.
     * If not specified, the model's default temperature is used.
     */
    temperature?: number;

    /**
     * Nucleus sampling parameter between 0 and 1.
     * Controls diversity via cumulative probability cutoff.
     * If not specified, the model's default topP is used (typically 1).
     */
    topP?: number;

    /**
     * Frequency penalty between -2.0 and 2.0.
     * Positive values penalize tokens based on their frequency.
     * If not specified, the model's default is used (typically 0).
     */
    frequencyPenalty?: number;

    /**
     * Presence penalty between -2.0 and 2.0.
     * Positive values penalize tokens that have appeared in the text.
     * If not specified, the model's default is used (typically 0).
     */
    presencePenalty?: number;

    /**
     * Number of completions to generate.
     * Multiple completions provide alternative responses.
     * Note: Not supported by Amazon and Anthropic models.
     * If not specified, typically defaults to 1 on the model side.
     */
    n?: number;

    /**
     * Whether to enable parallel tool calls.
     * When enabled, the model can call multiple tools in parallel.
     *
     * Note: This uses the SAP/OpenAI-style key `parallel_tool_calls`.
     */
    parallel_tool_calls?: boolean;
  };

  /**
   * Masking configuration for SAP AI Core orchestration.
   * When provided, sensitive information in prompts can be anonymized or
   * pseudonymized by SAP Data Privacy Integration (DPI).
   *
   * @example
   * ```typescript
   * import { buildDpiMaskingProvider } from '@sap-ai-sdk/orchestration';
   *
   * const model = provider('gpt-4o', {
   *   masking: {
   *     masking_providers: [
   *       buildDpiMaskingProvider({
   *         method: 'anonymization',
   *         entities: ['profile-email', 'profile-phone']
   *       })
   *     ]
   *   }
   * });
   * ```
   */
  masking?: MaskingModule;

  /**
   * Filtering configuration for input and output content safety.
   * Supports Azure Content Safety and Llama Guard filters.
   *
   * @example
   * ```typescript
   * import { buildAzureContentSafetyFilter } from '@sap-ai-sdk/orchestration';
   *
   * const model = provider('gpt-4o', {
   *   filtering: {
   *     input: {
   *       filters: [
   *         buildAzureContentSafetyFilter('input', {
   *           hate: 'ALLOW_SAFE',
   *           violence: 'ALLOW_SAFE_LOW_MEDIUM'
   *         })
   *       ]
   *     }
   *   }
   * });
   * ```
   */
  filtering?: FilteringModule;

  /**
   * Response format for templating prompt (OpenAI-compatible)
   * Allows specifying structured output formats
   *

   * @example
   * ```typescript
   * const model = provider('gpt-4o', {
   *   responseFormat: {
   *     type: 'json_schema',
   *     json_schema: {
   *       name: 'response',
   *       schema: { type: 'object', properties: { answer: { type: 'string' } } }
   *     }
   *   }
   * });
   * ```
   */
  responseFormat?:
    | { type: "text" }
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          description?: string;
          schema?: unknown;
          strict?: boolean | null;
        };
      };

  /**
   * Tool definitions in SAP AI SDK format
   *

   * Use this to pass tools directly with proper JSON Schema definitions.
   * This bypasses the AI SDK's Zod conversion which may have issues.
   *
   * Note: This should be used in conjunction with AI SDK's tool handling
   * to provide the actual tool implementations (execute functions).
   *
   * @example
   * ```typescript
   * const model = provider('gpt-4o', {
   *   tools: [
   *     {
   *       type: 'function',
   *       function: {
   *         name: 'get_weather',
   *         description: 'Get weather for a location',
   *         parameters: {
   *           type: 'object',
   *           properties: {
   *             location: { type: 'string', description: 'City name' }
   *           },
   *           required: ['location']
   *         }
   *       }
   *     }
   *   ]
   * });
   * ```
   */
  tools?: ChatCompletionTool[];
}

/**
 * Supported model IDs in SAP AI Core.
 *
 * These models are available through the SAP AI Core Orchestration service.
 * **Note:** The models listed here are representative examples. Actual model availability
 * depends on your SAP AI Core tenant configuration, region, and subscription.
 *
 * **Azure OpenAI Models:**
 * - gpt-4o, gpt-4o-mini
 * - gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
 * - o1, o3, o3-mini, o4-mini
 *
 * **Google Vertex AI Models:**
 * - gemini-2.0-flash, gemini-2.0-flash-lite
 * - gemini-2.5-flash, gemini-2.5-pro
 *
 * **AWS Bedrock Models:**
 * - anthropic--claude-3-haiku, anthropic--claude-3-sonnet, anthropic--claude-3-opus
 * - anthropic--claude-3.5-sonnet, anthropic--claude-3.7-sonnet
 * - anthropic--claude-4-sonnet, anthropic--claude-4-opus
 * - amazon--nova-pro, amazon--nova-lite, amazon--nova-micro, amazon--nova-premier
 *
 * **AI Core Open Source Models:**
 * - mistralai--mistral-large-instruct, mistralai--mistral-medium-instruct, mistralai--mistral-small-instruct
 * - cohere--command-a-reasoning
 */
export type SAPAIModelId = ChatModel;

// Re-export useful types from SAP AI SDK for convenience
export type { MaskingModule, FilteringModule } from "@sap-ai-sdk/orchestration";

// Re-export DPI masking helpers
export {
  buildDpiMaskingProvider,
  buildAzureContentSafetyFilter,
  buildLlamaGuard38BFilter,
  buildDocumentGroundingConfig,
  buildTranslationConfig,
} from "@sap-ai-sdk/orchestration";
