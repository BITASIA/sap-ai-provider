export { createSAPAIProvider, sapai } from "./sap-ai-provider";
export type {
  SAPAIProvider,
  SAPAIProviderSettings,
  SAPAIServiceKey,
} from "./sap-ai-provider";

// Export core types and utilities
export type { SAPAISettings } from "./sap-ai-chat-settings";
export { SAPAIError } from "./sap-ai-error";

// Export constants for advanced usage
export {
  DEFAULT_DEPLOYMENT_ID,
  DEFAULT_RESOURCE_GROUP,
  DEFAULT_BASE_URL,
  HTTP_STATUS_CODES,
  ENV_VARS,
} from "./constants";
