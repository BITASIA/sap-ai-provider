import type {
  ChatCompletionTool,
  ChatModel,
  FilteringModule,
  GroundingModule,
  MaskingModule,
  TranslationModule,
} from "@sap-ai-sdk/orchestration";

/**
 * Supported model IDs in SAP AI Core.
 *
 * These models are available through the SAP AI Core Orchestration service.
 * **Note:** The models listed here are representative examples. Actual model availability
 * depends on your SAP AI Core tenant configuration, region, and subscription.
 * @see {@link https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/models-and-scenarios SAP AI Core Models Documentation}
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

/**
 * Settings for configuring SAP AI Core model behavior.
 *
 * These settings control model parameters, data masking, content filtering,
 * and tool usage. Settings can be provided at provider-level (defaults) or
 * per-model call (overrides).
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
   * Filtering configuration for input and output content safety.
   * Supports Azure Content Safety and Llama Guard filters.
   * @see {@link https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/content-filtering SAP Content Filtering Documentation}
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
   * Grounding module configuration for document-based retrieval (RAG).
   * Enables retrieval-augmented generation using SAP Document Grounding Service.
   *
   * Use `buildDocumentGroundingConfig()` to create the configuration.
   * @see {@link https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/document-grounding SAP Document Grounding Documentation}
   * @example
   * ```typescript
   * import { buildDocumentGroundingConfig } from '@mymediset/sap-ai-provider';
   *
   * const model = provider('gpt-4o', {
   *   grounding: buildDocumentGroundingConfig({
   *     filters: [
   *       {
   *         id: 'my-vector-store',
   *         data_repository_type: 'vector',
   *         data_repositories: ['document-repo-1'],
   *         chunk_overlap: 50
   *       }
   *     ],
   *     placeholders: {
   *       input: ['?question'],
   *       output: 'groundingOutput'
   *     }
   *   })
   * });
   * ```
   */
  grounding?: GroundingModule;

  /**
   * Whether to include assistant reasoning parts in the SAP prompt conversion.
   *
   * Reasoning parts contain internal model chain-of-thought reasoning that may not be
   * suitable for end-user display or persistence. When disabled (default), only the
   * final response content is forwarded.
   *
   * **Default:** `false` (recommended for production)
   *
   * **When to enable:**
   * - Debugging model behavior
   * - Analyzing reasoning patterns
   * - Research and development
   *
   * **When to keep disabled:**
   * - Production applications
   * - User-facing chatbots
   * - When storing conversation history
   * @example
   * ```typescript
   * // Enable for debugging (see model's reasoning)
   * const debugModel = provider('gpt-4o', {
   *   includeReasoning: true
   * });
   *
   * // Disabled by default (production use)
   * const prodModel = provider('gpt-4o');
   * // or explicitly:
   * const prodModel2 = provider('gpt-4o', {
   *   includeReasoning: false
   * });
   * ```
   */
  includeReasoning?: boolean;

  /**
   * Masking configuration for SAP AI Core orchestration.
   * When provided, sensitive information in prompts can be anonymized or
   * pseudonymized by SAP Data Privacy Integration (DPI).
   * @see {@link https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/data-privacy-integration SAP DPI Documentation}
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
   * Model generation parameters that control the output.
   */
  modelParams?: {
    /**
     * Frequency penalty between -2.0 and 2.0.
     * Positive values penalize tokens based on their frequency.
     * If not specified, the model's default is used (typically 0).
     */
    frequencyPenalty?: number;

    /**
     * Maximum number of tokens to generate.
     * Higher values allow for longer responses but increase latency and cost.
     */
    maxTokens?: number;

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

    /**
     * Presence penalty between -2.0 and 2.0.
     * Positive values penalize tokens that have appeared in the text.
     * If not specified, the model's default is used (typically 0).
     */
    presencePenalty?: number;

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
  };

  /**
   * Specific version of the model to use.
   * If not provided, the latest version will be used.
   */
  modelVersion?: string;

  /**
   * Response format for templating prompt (OpenAI-compatible)
   * Allows specifying structured output formats
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
    | {
        json_schema: {
          description?: string;
          name: string;
          schema?: unknown;
          strict?: boolean | null;
        };
        type: "json_schema";
      }
    | { type: "json_object" }
    | { type: "text" };

  /**
   * Tool definitions in SAP AI SDK format
   *
   *
   * Use this to pass tools directly with proper JSON Schema definitions.
   * This bypasses the AI SDK's Zod conversion which may have issues.
   *
   * Note: This should be used in conjunction with AI SDK's tool handling
   * to provide the actual tool implementations (execute functions).
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

  /**
   * Translation module configuration for input/output translation.
   * Enables automatic translation using SAP Document Translation service.
   *
   * Use `buildTranslationConfig()` to create input/output configurations.
   * @see {@link https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/translation SAP Translation Documentation}
   * @example
   * ```typescript
   * import { buildTranslationConfig } from '@mymediset/sap-ai-provider';
   *
   * const model = provider('gpt-4o', {
   *   translation: {
   *     input: buildTranslationConfig('input', {
   *       sourceLanguage: 'de-DE',
   *       targetLanguage: 'en-US'
   *     }),
   *     output: buildTranslationConfig('output', {
   *       targetLanguage: 'de-DE'
   *     })
   *   }
   * });
   * ```
   */
  translation?: TranslationModule;
}

// Re-export useful types from SAP AI SDK
export type {
  FilteringModule,
  GroundingModule,
  MaskingModule,
  TranslationModule,
} from "@sap-ai-sdk/orchestration";

// Re-export helper functions from SAP AI SDK
export {
  buildAzureContentSafetyFilter,
  buildDocumentGroundingConfig,
  buildDpiMaskingProvider,
  buildLlamaGuard38BFilter,
  buildTranslationConfig,
  isConfigReference,
} from "@sap-ai-sdk/orchestration";

// Re-export advanced SAP AI SDK types for request/response handling
export type {
  AssistantChatMessage,
  ChatCompletionRequest,
  ChatCompletionTool,
  ChatMessage,
  DeveloperChatMessage,
  DocumentTranslationApplyToSelector,
  FunctionObject,
  LlmModelDetails,
  LlmModelParams,
  OrchestrationConfigRef,
  OrchestrationModuleConfig,
  PromptTemplatingModule,
  SystemChatMessage,
  ToolChatMessage,
  TranslationApplyToCategory,
  TranslationInputParameters,
  TranslationOutputParameters,
  TranslationTargetLanguage,
  UserChatMessage,
} from "@sap-ai-sdk/orchestration";

// Re-export response classes from SAP AI SDK
export {
  OrchestrationResponse,
  OrchestrationStreamChunkResponse,
  OrchestrationStreamResponse,
} from "@sap-ai-sdk/orchestration";
