import { ProviderV2 } from "@ai-sdk/provider";
import { SAPAIChatLanguageModel } from "./sap-ai-chat-language-model";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-chat-settings";
import { resolveProviderConfig, createModelFactory } from "./provider-config";
import {
  ENV_VARS,
  DEFAULT_BASE_URL,
  DEFAULT_DEPLOYMENT_ID,
  DEFAULT_RESOURCE_GROUP,
} from "./constants";

// SAP AI Core Service Key interface (what users get from SAP BTP)
export interface SAPAIServiceKey {
  serviceurls: {
    AI_API_URL: string;
  };
  clientid: string;
  clientsecret: string;
  url: string;
  identityzone?: string;
  identityzoneid?: string;
  appname?: string;
  "credential-type"?: string;
}

// model factory function with additional methods and properties
export interface SAPAIProvider extends ProviderV2 {
  (modelId: SAPAIModelId, settings?: SAPAISettings): SAPAIChatLanguageModel;

  // explicit method for targeting chat models
  chat(modelId: SAPAIModelId, settings?: SAPAISettings): SAPAIChatLanguageModel;
}

// Simple settings for the provider
export interface SAPAIProviderSettings {
  /**
   * SAP AI Core service key (JSON string or parsed object).
   * This is what you get from SAP BTP - just copy/paste it here.
   * If provided, OAuth2 will be handled automatically.
   */
  serviceKey?: string | SAPAIServiceKey;

  /**
   * Alternative: provide token directly (for advanced users)
   */
  token?: string;

  /**
   * SAP AI Core deployment ID.
   * @default 'd65d81e7c077e583'
   */
  deploymentId?: string;

  /**
   * SAP AI Core resource group.
   * @default 'default'
   */
  resourceGroup?: string;

  /**
   * Custom base URL (optional)
   */
  baseURL?: string;

  /**
   * Custom headers (optional)
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation (optional)
   */
  fetch?: typeof fetch;
}

/**
 * Main SAP AI provider factory function.
 *
 * @example
 * // With service key (recommended)
 * const provider = await createSAPAIProvider({
 *   serviceKey: '{"serviceurls":{"AI_API_URL":"..."},"clientid":"...","clientsecret":"...","url":"..."}'
 * });
 *
 * // With token (advanced)
 * const provider = createSAPAIProvider({
 *   token: 'your-oauth-token'
 * });
 *
 * // Use with Vercel AI SDK
 * const model = provider('gpt-4o');
 */
export async function createSAPAIProvider(
  options: SAPAIProviderSettings = {},
): Promise<SAPAIProvider> {
  const config = await resolveProviderConfig(options);
  const createModel = createModelFactory(config);

  // Create the provider function
  const provider = function (modelId: SAPAIModelId, settings?: SAPAISettings) {
    if (new.target) {
      throw new Error(
        "The SAP AI provider function cannot be called with the new keyword.",
      );
    }

    return createModel(modelId, settings);
  };

  provider.chat = createModel;

  return provider as SAPAIProvider;
}

/**
 * Synchronous version for when you already have a token.
 * Most users should use createSAPAIProvider() instead.
 */
export function createSAPAIProviderSync(
  options: Omit<SAPAIProviderSettings, "serviceKey"> & { token: string },
): SAPAIProvider {
  const config = {
    baseURL: options.baseURL || DEFAULT_BASE_URL,
    authToken: options.token,
    deploymentId: options.deploymentId || DEFAULT_DEPLOYMENT_ID,
    resourceGroup: options.resourceGroup || DEFAULT_RESOURCE_GROUP,
    headers: options.headers,
    fetch: options.fetch,
  };

  const createModel = createModelFactory(config);

  const provider = function (modelId: SAPAIModelId, settings?: SAPAISettings) {
    if (new.target) {
      throw new Error(
        "The SAP AI provider function cannot be called with the new keyword.",
      );
    }

    return createModel(modelId, settings);
  };

  provider.chat = createModel;

  return provider as SAPAIProvider;
}

/**
 * Default SAP AI provider instance (uses SAP_AI_TOKEN environment variable).
 * Will throw error only when actually used without the environment variable.
 */
function createDefaultSAPAI(): SAPAIProvider {
  const createModel = (modelId: SAPAIModelId, settings?: SAPAISettings) => {
    const token = process.env[ENV_VARS.TOKEN];
    if (!token) {
      throw new Error(
        `${ENV_VARS.TOKEN} environment variable is required for default instance. ` +
          'Either set SAP_AI_TOKEN or use createSAPAIProvider({ serviceKey: "..." }) instead.',
      );
    }

    const provider = createSAPAIProviderSync({ token });
    return provider(modelId, settings);
  };

  const provider = function (modelId: SAPAIModelId, settings?: SAPAISettings) {
    return createModel(modelId, settings);
  };

  provider.chat = createModel;

  return provider as SAPAIProvider;
}

export const sapai = createDefaultSAPAI();
