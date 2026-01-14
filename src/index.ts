/**
 * @mymediset/sap-ai-provider
 *
 * Vercel AI SDK provider for SAP AI Core.
 * Wraps the SAP AI SDK to provide AI SDK-compatible interfaces.
 */

/**
 * Provider factory and default instance.
 */
export { createSAPAIProvider, sapai } from "./sap-ai-provider";
export type {
  SAPAIProvider,
  SAPAIProviderSettings,
  DeploymentConfig,
} from "./sap-ai-provider";

/**
 * Model settings and identifiers.
 */
export type { SAPAISettings, SAPAIModelId } from "./sap-ai-settings";

/**
 * SAP AI SDK types and utilities.
 *
 * Re-exported for convenience and advanced usage scenarios.
 */
export type {
  MaskingModule,
  FilteringModule,
  GroundingModule,
  TranslationModule,
  OrchestrationModuleConfig,
  OrchestrationConfigRef,
  ChatCompletionRequest,
  PromptTemplatingModule,
  TranslationInputParameters,
  TranslationOutputParameters,
  TranslationApplyToCategory,
  DocumentTranslationApplyToSelector,
  TranslationTargetLanguage,
  LlmModelParams,
  LlmModelDetails,
  ChatCompletionTool,
  FunctionObject,
  ChatMessage,
  SystemChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  ToolChatMessage,
  DeveloperChatMessage,
} from "./sap-ai-settings";

/**
 * Helper functions for building configurations.
 */
export {
  buildDpiMaskingProvider,
  buildAzureContentSafetyFilter,
  buildLlamaGuard38BFilter,
  buildDocumentGroundingConfig,
  buildTranslationConfig,
  isConfigReference,
} from "./sap-ai-settings";

/**
 * Response classes from SAP AI SDK.
 */
export {
  OrchestrationResponse,
  OrchestrationStreamResponse,
  OrchestrationStreamChunkResponse,
} from "./sap-ai-settings";

/**
 * Error handling types.
 */
export type { OrchestrationErrorResponse } from "./sap-ai-error";

/**
 * Direct access to SAP AI SDK OrchestrationClient.
 *
 * For advanced users who need to use the SAP AI SDK directly.
 */
export { OrchestrationClient } from "@sap-ai-sdk/orchestration";
