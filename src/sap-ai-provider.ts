import { ProviderV2 } from "@ai-sdk/provider";
import { loadApiKey, withoutTrailingSlash } from "@ai-sdk/provider-utils";
import { SAPAIChatLanguageModel } from "./sap-ai-chat-language-model";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-chat-settings";

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

// OAuth2 helper function
async function getOAuthToken(
  serviceKey: SAPAIServiceKey,
  customFetch?: typeof fetch,
): Promise<string> {
  const fetchFn = customFetch || fetch;
  const tokenUrl = `${serviceKey.url}/oauth/token`;
  const credentials = Buffer.from(
    `${serviceKey.clientid}:${serviceKey.clientsecret}`,
  ).toString("base64");

  const response = await fetchFn(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get OAuth access token: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  const tokenData = await response.json();
  return tokenData.access_token;
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
  let baseURL: string;
  let authToken: string;

  // Parse service key if provided
  let parsedServiceKey: SAPAIServiceKey | undefined;
  if (options.serviceKey) {
    if (typeof options.serviceKey === "string") {
      try {
        parsedServiceKey = JSON.parse(options.serviceKey);
      } catch (error) {
        throw new Error("Invalid service key JSON format");
      }
    } else {
      parsedServiceKey = options.serviceKey;
    }
  }

  // Determine baseURL
  if (parsedServiceKey) {
    baseURL =
      withoutTrailingSlash(options.baseURL) ??
      `${parsedServiceKey.serviceurls.AI_API_URL}/v2`;
  } else {
    baseURL =
      withoutTrailingSlash(options.baseURL) ??
      "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2";
  }

  // Determine authentication
  if (options.token) {
    authToken = options.token;
  } else if (parsedServiceKey) {
    // Get OAuth token automatically
    authToken = await getOAuthToken(parsedServiceKey, options.fetch);
  } else {
    // Try environment variable
    authToken = loadApiKey({
      apiKey: undefined,
      environmentVariableName: "SAP_AI_TOKEN",
      description: "SAP AI Core",
    });
  }

  const deploymentId = options.deploymentId ?? "d65d81e7c077e583";
  const resourceGroup = options.resourceGroup ?? "default";

  // Create the model factory function
  const createModel = (modelId: SAPAIModelId, settings: SAPAISettings = {}) => {
    return new SAPAIChatLanguageModel(modelId, settings, {
      provider: "sap-ai",
      baseURL: `${baseURL}/inference/deployments/${deploymentId}/completion`,
      headers: () => ({
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "ai-resource-group": resourceGroup,
        ...options.headers,
      }),
      fetch: options.fetch,
    });
  };

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
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2";

  const deploymentId = options.deploymentId ?? "d65d81e7c077e583";
  const resourceGroup = options.resourceGroup ?? "default";

  const createModel = (modelId: SAPAIModelId, settings: SAPAISettings = {}) => {
    return new SAPAIChatLanguageModel(modelId, settings, {
      provider: "sap-ai",
      baseURL: `${baseURL}/inference/deployments/${deploymentId}/completion`,
      headers: () => ({
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
        "ai-resource-group": resourceGroup,
        ...options.headers,
      }),
      fetch: options.fetch,
    });
  };

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
    const token = process.env.SAP_AI_TOKEN;
    if (!token) {
      throw new Error(
        "SAP_AI_TOKEN environment variable is required for default instance. " +
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
