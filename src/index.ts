// Provider exports
export { createSAPAIProvider, sapai } from "./sap-ai-provider";
export type {
  SAPAIProvider,
  SAPAIProviderSettings,
  DeploymentConfig,
} from "./sap-ai-provider";

// Settings and model types
export type { SAPAISettings, SAPAIModelId } from "./sap-ai-chat-settings";

// Re-export masking/filtering module types and helpers from SAP AI SDK
export type { MaskingModule, FilteringModule } from "./sap-ai-chat-settings";
export {
  buildDpiMaskingProvider,
  buildAzureContentSafetyFilter,
  buildLlamaGuard38BFilter,
  buildDocumentGroundingConfig,
  buildTranslationConfig,
} from "./sap-ai-chat-settings";

// Error handling - re-export SAP AI SDK error type for convenience
export type { OrchestrationErrorResponse } from "./sap-ai-error";

// Re-export useful types from SAP AI SDK for advanced usage
export type {
  OrchestrationModuleConfig,
  ChatCompletionRequest,
  PromptTemplatingModule,
  GroundingModule,
  TranslationModule,
  LlmModelParams,
  LlmModelDetails,
  ChatCompletionTool,
  FunctionObject,
} from "./types/completion-request";

export type {
  ChatMessage,
  SystemChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  ToolChatMessage,
  DeveloperChatMessage,
} from "./types/completion-response";

export {
  OrchestrationResponse,
  OrchestrationStreamResponse,
  OrchestrationStreamChunkResponse,
} from "./types/completion-response";

// Re-export OrchestrationClient for advanced usage
export { OrchestrationClient } from "@sap-ai-sdk/orchestration";
