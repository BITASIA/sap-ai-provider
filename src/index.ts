/**
 * `@mymediset/sap-ai-provider`
 *
 * Vercel AI SDK provider for SAP AI Core.
 * Wraps the SAP AI SDK to provide AI SDK-compatible interfaces.
 */

/**
 * Embedding model.
 */
export { SAPAIEmbeddingModel } from "./sap-ai-embedding-model.js";

export type { SAPAIEmbeddingModelId, SAPAIEmbeddingSettings } from "./sap-ai-embedding-model.js";

/**
 * Error handling types.
 */
export type { OrchestrationErrorResponse } from "./sap-ai-error.js";

/**
 * Provider factory and default instance.
 */
export { createSAPAIProvider, sapai } from "./sap-ai-provider.js";

export type { DeploymentConfig, SAPAIProvider, SAPAIProviderSettings } from "./sap-ai-provider.js";

/**
 * Model settings and identifiers.
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
 * Response classes from SAP AI SDK.
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
