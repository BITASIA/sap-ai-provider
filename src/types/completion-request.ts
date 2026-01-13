/**
 * Re-export types from SAP AI SDK.
 *
 * Note: With the migration to @sap-ai-sdk/orchestration, most request/response
 * handling is now managed by the SDK internally. These types are provided
 * for reference and advanced customization scenarios.
 */
export type {
  OrchestrationModuleConfig,
  OrchestrationConfigRef,
  ChatCompletionRequest,
  PromptTemplatingModule,
  MaskingModule,
  FilteringModule,
  GroundingModule,
  TranslationModule,
  TranslationInputParameters,
  TranslationOutputParameters,
  TranslationApplyToCategory,
  DocumentTranslationApplyToSelector,
  TranslationTargetLanguage,
  LlmModelParams,
  LlmModelDetails,
  ChatCompletionTool,
  FunctionObject,
} from "@sap-ai-sdk/orchestration";

/**
 * Re-export utility functions from SAP AI SDK.
 */
export { isConfigReference } from "@sap-ai-sdk/orchestration";
