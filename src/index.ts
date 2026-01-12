/**
 * Factory function to create a new SAP AI provider instance.
 *
 * @see {@link createSAPAIProvider} in `./sap-ai-provider` for detailed documentation.
 *
 * @example
 * ```typescript
 * import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
 *
 * const provider = createSAPAIProvider({
 *   resourceGroup: 'production'
 * });
 * ```
 */
export { createSAPAIProvider } from "./sap-ai-provider";

/**
 * Default SAP AI provider instance using auto-detected configuration.
 *
 * Uses authentication from service binding (SAP BTP) or AICORE_SERVICE_KEY environment variable.
 *
 * @see {@link sapai} in `./sap-ai-provider` for detailed documentation.
 *
 * @example
 * ```typescript
 * import { sapai } from '@mymediset/sap-ai-provider';
 * import { generateText } from 'ai';
 *
 * const result = await generateText({
 *   model: sapai('gpt-4o'),
 *   prompt: 'Hello!'
 * });
 * ```
 */
export { sapai } from "./sap-ai-provider";

/**
 * SAP AI Provider interface types and configuration.
 *
 * @see {@link SAPAIProvider} - Main provider interface
 * @see {@link SAPAIProviderSettings} - Provider configuration options
 * @see {@link DeploymentConfig} - Deployment configuration type
 */
export type {
  SAPAIProvider,
  SAPAIProviderSettings,
  DeploymentConfig,
} from "./sap-ai-provider";

/**
 * Model settings and identifiers for SAP AI Core models.
 *
 * @see {@link SAPAISettings} - Configuration for model behavior
 * @see {@link SAPAIModelId} - Supported model identifiers
 */
export type { SAPAISettings, SAPAIModelId } from "./sap-ai-chat-settings";

/**
 * Data masking and content filtering types and helpers.
 *
 * Re-exports from SAP AI SDK for convenience.
 *
 * @see {@link MaskingModule} - Data masking configuration
 * @see {@link FilteringModule} - Content filtering configuration
 * @see {@link buildDpiMaskingProvider} - Helper to build DPI masking
 * @see {@link buildAzureContentSafetyFilter} - Helper for Azure content safety
 * @see {@link buildLlamaGuard38BFilter} - Helper for LlamaGuard filtering
 */
export type { MaskingModule, FilteringModule } from "./sap-ai-chat-settings";
export {
  buildDpiMaskingProvider,
  buildAzureContentSafetyFilter,
  buildLlamaGuard38BFilter,
  buildDocumentGroundingConfig,
  buildTranslationConfig,
} from "./sap-ai-chat-settings";

/**
 * Error handling types from SAP AI SDK.
 *
 * Re-exported for convenience when handling SAP AI Core errors.
 *
 * @see {@link OrchestrationErrorResponse} - SAP AI SDK error response type
 */
export type { OrchestrationErrorResponse } from "./sap-ai-error";

/**
 * Advanced SAP AI SDK types for request configuration.
 *
 * Re-exported for users who need fine-grained control over orchestration modules,
 * model parameters, and chat completion configuration.
 *
 * @see SAP AI SDK documentation for detailed usage of these types.
 */
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

/**
 * Advanced SAP AI SDK types for message and response handling.
 *
 * Re-exported for users who need to work with SAP AI SDK message formats directly.
 *
 * @see SAP AI SDK documentation for detailed usage of these types.
 */
export type {
  ChatMessage,
  SystemChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  ToolChatMessage,
  DeveloperChatMessage,
} from "./types/completion-response";

/**
 * Response type classes from SAP AI SDK.
 *
 * These are typically not needed for standard usage, but are exported for
 * advanced users who need direct access to SAP AI SDK response types.
 */
export {
  OrchestrationResponse,
  OrchestrationStreamResponse,
  OrchestrationStreamChunkResponse,
} from "./types/completion-response";

/**
 * Direct access to SAP AI SDK OrchestrationClient.
 *
 * Exported for advanced users who need to use the SAP AI SDK directly
 * alongside the AI SDK provider.
 *
 * @see SAP AI SDK documentation for OrchestrationClient usage.
 */
export { OrchestrationClient } from "@sap-ai-sdk/orchestration";
