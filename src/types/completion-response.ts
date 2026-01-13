/**
 * Re-export types from SAP AI SDK.
 *
 * Note: With the migration to @sap-ai-sdk/orchestration, most request/response
 * handling is now managed by the SDK internally. These types are provided
 * for reference and advanced customization scenarios.
 */
export type {
  ChatMessage,
  SystemChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  ToolChatMessage,
  DeveloperChatMessage,
} from "@sap-ai-sdk/orchestration";

export {
  OrchestrationResponse,
  OrchestrationStreamResponse,
  OrchestrationStreamChunkResponse,
} from "@sap-ai-sdk/orchestration";
