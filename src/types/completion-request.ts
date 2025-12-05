/**
 * Re-export types from SAP AI SDK for convenience.
 *
 * Note: With the migration to @sap-ai-sdk/orchestration, most request/response
 * handling is now managed by the SDK internally. These types are provided
 * for reference and advanced customization scenarios.
 */
export type {
  OrchestrationModuleConfig,
  ChatCompletionRequest,
  PromptTemplatingModule,
  MaskingModule,
  FilteringModule,
  GroundingModule,
  TranslationModule,
  LlmModelParams,
  LlmModelDetails,
  ChatCompletionTool,
  FunctionObject,
} from "@sap-ai-sdk/orchestration";
