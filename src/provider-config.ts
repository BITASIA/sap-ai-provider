import { loadApiKey, withoutTrailingSlash } from "@ai-sdk/provider-utils";
import { SAPAIProviderSettings, SAPAIServiceKey } from "./sap-ai-provider";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-chat-settings";
import { SAPAIChatLanguageModel } from "./sap-ai-chat-language-model";
import { getOAuthToken, parseServiceKey } from "./auth";
import {
  DEFAULT_DEPLOYMENT_ID,
  DEFAULT_RESOURCE_GROUP,
  DEFAULT_BASE_URL,
  ENV_VARS,
  PROVIDER_NAME,
  CONTENT_TYPES,
} from "./constants";

/**
 * Configuration utilities for SAP AI Provider
 */

export interface ResolvedProviderConfig {
  baseURL: string;
  authToken: string;
  deploymentId: string;
  resourceGroup: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

/**
 * Resolves provider configuration from settings
 * @param options Provider settings
 * @returns Promise resolving to complete configuration
 */
export async function resolveProviderConfig(
  options: SAPAIProviderSettings = {},
): Promise<ResolvedProviderConfig> {
  const parsedServiceKey = options.serviceKey
    ? parseServiceKey(options.serviceKey)
    : undefined;

  const baseURL = resolveBaseURL(options.baseURL, parsedServiceKey);
  const authToken = await resolveAuthToken(options, parsedServiceKey);
  const deploymentId = options.deploymentId ?? DEFAULT_DEPLOYMENT_ID;
  const resourceGroup = options.resourceGroup ?? DEFAULT_RESOURCE_GROUP;

  return {
    baseURL,
    authToken,
    deploymentId,
    resourceGroup,
    headers: options.headers,
    fetch: options.fetch,
  };
}

/**
 * Resolves the base URL for API calls
 * @param customBaseURL Custom base URL from options
 * @param serviceKey Parsed service key
 * @returns Resolved base URL
 */
function resolveBaseURL(
  customBaseURL?: string,
  serviceKey?: SAPAIServiceKey,
): string {
  if (customBaseURL) {
    return withoutTrailingSlash(customBaseURL);
  }

  if (serviceKey) {
    return `${serviceKey.serviceurls.AI_API_URL}/v2`;
  }

  return DEFAULT_BASE_URL;
}

/**
 * Resolves authentication token from various sources
 * @param options Provider settings
 * @param serviceKey Parsed service key
 * @returns Promise resolving to auth token
 */
async function resolveAuthToken(
  options: SAPAIProviderSettings,
  serviceKey?: SAPAIServiceKey,
): Promise<string> {
  // Priority: direct token > service key > environment variable
  if (options.token) {
    return options.token;
  }

  if (serviceKey) {
    return getOAuthToken(serviceKey, options.fetch);
  }

  return loadApiKey({
    apiKey: undefined,
    environmentVariableName: ENV_VARS.TOKEN,
    description: "SAP AI Core",
  });
}

/**
 * Creates model factory function with resolved configuration
 * @param config Resolved provider configuration
 * @returns Model factory function
 */
export function createModelFactory(config: ResolvedProviderConfig) {
  return (modelId: SAPAIModelId, settings: SAPAISettings = {}) => {
    return new SAPAIChatLanguageModel(modelId, settings, {
      provider: PROVIDER_NAME,
      baseURL: `${config.baseURL}/inference/deployments/${config.deploymentId}/completion`,
      headers: () => ({
        Authorization: `Bearer ${config.authToken}`,
        "Content-Type": CONTENT_TYPES.JSON,
        "ai-resource-group": config.resourceGroup,
        ...config.headers,
      }),
      fetch: config.fetch,
    });
  };
}
