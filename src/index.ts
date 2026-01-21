/**
 * `@mymediset/sap-ai-provider`
 *
 * Vercel AI SDK provider for SAP AI Core.
 * Wraps the SAP AI SDK to provide Vercel AI SDK-compatible interfaces.
 */

/**
 * Embedding model class for generating vector embeddings via SAP AI Core.
 */
export { SAPAIEmbeddingModel } from "./sap-ai-embedding-model.js";

export type { SAPAIEmbeddingModelId, SAPAIEmbeddingSettings } from "./sap-ai-embedding-model.js";

/**
 * Error handling types for SAP AI Core error responses.
 */
export type { OrchestrationErrorResponse } from "./sap-ai-error.js";

/**
 * Language model class for chat/text completions via SAP AI Core.
 */
export { SAPAILanguageModel } from "./sap-ai-language-model.js";

/**
 * Dynamic model capability detection for SAP AI Core models.
 *
 * Functions for determining model capabilities based on model ID prefix
 * following the SAP AI Core naming convention: `vendor--model-name`.
 */
export {
  getModelVendor,
  getSAPAIModelCapabilities,
  modelSupports,
} from "./sap-ai-model-capabilities.js";

export type { SAPAIModelCapabilities, SAPAIModelVendor } from "./sap-ai-model-capabilities.js";

/**
 * Provider options for per-call configuration.
 *
 * These schemas and types enable runtime validation of provider options
 * passed via `providerOptions['sap-ai']` in Vercel AI SDK calls.
 */
export {
  getProviderName,
  SAP_AI_PROVIDER_NAME,
  sapAIEmbeddingProviderOptions,
  sapAILanguageModelProviderOptions,
} from "./sap-ai-provider-options.js";

export type {
  SAPAIEmbeddingProviderOptions,
  SAPAILanguageModelProviderOptions,
} from "./sap-ai-provider-options.js";

/**
 * Provider factory function and pre-configured default instance.
 */
export { createSAPAIProvider, sapai } from "./sap-ai-provider.js";

export type { DeploymentConfig, SAPAIProvider, SAPAIProviderSettings } from "./sap-ai-provider.js";

/**
 * Model settings types and model identifier type definitions.
 */
export type { SAPAIModelId, SAPAISettings } from "./sap-ai-settings.js";

/**
 * SAP AI SDK types and utilities.
 *
 * Re-exported for convenience and advanced usage scenarios.
 */
export type {
  AssistantChatMessage,
  ChatCompletionRequest,
  ChatCompletionTool,
  ChatMessage,
  DeveloperChatMessage,
  DocumentTranslationApplyToSelector,
  FilteringModule,
  FunctionObject,
  GroundingModule,
  LlmModelDetails,
  LlmModelParams,
  MaskingModule,
  OrchestrationConfigRef,
  OrchestrationModuleConfig,
  PromptTemplatingModule,
  SystemChatMessage,
  ToolChatMessage,
  TranslationApplyToCategory,
  TranslationInputParameters,
  TranslationModule,
  TranslationOutputParameters,
  TranslationTargetLanguage,
  UserChatMessage,
} from "./sap-ai-settings.js";

/**
 * Helper functions for building configurations.
 */
export {
  buildAzureContentSafetyFilter,
  buildDocumentGroundingConfig,
  buildDpiMaskingProvider,
  buildLlamaGuard38BFilter,
  buildTranslationConfig,
  isConfigReference,
} from "./sap-ai-settings.js";

/**
 * Response classes from the SAP AI SDK for orchestration results.
 */
export {
  OrchestrationResponse,
  OrchestrationStreamChunkResponse,
  OrchestrationStreamResponse,
} from "./sap-ai-settings.js";

/**
 * Direct access to SAP AI SDK OrchestrationClient.
 *
 * For advanced users who need to use the SAP AI SDK directly.
 */
export { OrchestrationClient, OrchestrationEmbeddingClient } from "@sap-ai-sdk/orchestration";
