import { ProviderV2 } from "@ai-sdk/provider";
import { loadApiKey, withoutTrailingSlash } from "@ai-sdk/provider-utils";
import { SAPAIChatLanguageModel } from "./sap-ai-chat-language-model";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-chat-settings";

/**
 * SAP AI Core Service Key interface.
 *
 * This interface represents the service key structure provided by SAP BTP (Business Technology Platform)
 * when you create a service key for your SAP AI Core instance. You can copy this JSON directly
 * from your SAP BTP cockpit.
 *
 * @example
 * ```typescript
 * const serviceKey: SAPAIServiceKey = {
 *   serviceurls: {
 *     AI_API_URL: "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com"
 *   },
 *   clientid: "your-client-id",
 *   clientsecret: "your-client-secret",
 *   url: "https://your-auth-url.authentication.region.hana.ondemand.com",
 *   identityzone: "your-identity-zone",
 *   appname: "your-app-name",
 *   "credential-type": "binding-secret"
 * };
 * ```
 */
export interface SAPAIServiceKey {
  /** Service URLs configuration containing the AI API endpoint */
  serviceurls: {
    /** Base URL for SAP AI Core API calls */
    AI_API_URL: string;
  };
  /** OAuth2 client ID for authentication */
  clientid: string;
  /** OAuth2 client secret for authentication */
  clientsecret: string;
  /** OAuth2 authorization server URL */
  url: string;
  /** Identity zone for multi-tenant environments */
  identityzone?: string;
  /** Unique identifier for the identity zone */
  identityzoneid?: string;
  /** Application name in SAP BTP */
  appname?: string;
  /** Type of credential (typically "binding-secret") */
  "credential-type"?: string;
}

/**
 * SAP AI Provider interface.
 *
 * This is the main interface for creating and configuring SAP AI Core models.
 * It extends the standard Vercel AI SDK ProviderV2 interface with SAP-specific functionality.
 *
 * @example
 * ```typescript
 * const provider = await createSAPAIProvider({
 *   serviceKey: process.env.SAP_AI_SERVICE_KEY
 * });
 *
 * // Create a model instance
 * const model = provider('gpt-4o', {
 *   modelParams: {
 *     temperature: 0.7,
 *     maxTokens: 1000
 *   }
 * });
 *
 * // Or use the explicit chat method
 * const chatModel = provider.chat('gpt-4o');
 * ```
 */
export interface SAPAIProvider extends ProviderV2 {
  /**
   * Create a language model instance.
   *
   * @param modelId - The SAP AI Core model identifier (e.g., 'gpt-4o', 'claude-3-sonnet')
   * @param settings - Optional model configuration settings
   * @returns Configured SAP AI chat language model instance
   */
  (modelId: SAPAIModelId, settings?: SAPAISettings): SAPAIChatLanguageModel;

  /**
   * Explicit method for creating chat models.
   *
   * This method is equivalent to calling the provider function directly,
   * but provides a more explicit API for chat-based interactions.
   *
   * @param modelId - The SAP AI Core model identifier
   * @param settings - Optional model configuration settings
   * @returns Configured SAP AI chat language model instance
   */
  chat(modelId: SAPAIModelId, settings?: SAPAISettings): SAPAIChatLanguageModel;
}

/**
 * Configuration settings for the SAP AI Provider.
 *
 * This interface defines all available options for configuring the SAP AI Core connection,
 * authentication, and deployment settings. You can use either a service key (recommended)
 * or direct token authentication.
 *
 * @example
 * ```typescript
 * // Using service key (recommended)
 * const provider = await createSAPAIProvider({
 *   serviceKey: process.env.SAP_AI_SERVICE_KEY,
 *   deploymentId: 'my-deployment-id',
 *   resourceGroup: 'production'
 * });
 *
 * // Using direct token
 * const provider = await createSAPAIProvider({
 *   token: process.env.SAP_AI_TOKEN,
 *   baseURL: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2'
 * });
 * ```
 */
export interface SAPAIProviderSettings {
  /**
   * SAP AI Core service key (JSON string or parsed object).
   *
   * This is what you get from SAP BTP when creating a service key.
   * You can copy/paste the entire JSON object or string here.
   * When provided, OAuth2 authentication will be handled automatically.
   *
   * @example
   * ```typescript
   * // As JSON string
   * serviceKey: '{"serviceurls":{"AI_API_URL":"https://..."},...}'
   *
   * // As parsed object
   * serviceKey: {
   *   serviceurls: { AI_API_URL: "https://..." },
   *   clientid: "...",
   *   clientsecret: "..."
   * }
   * ```
   */
  serviceKey?: string | SAPAIServiceKey;

  /**
   * Direct access token for SAP AI Core API.
   *
   * Alternative to serviceKey for advanced users who want to handle
   * authentication themselves. This should be a valid Bearer token.
   *
   * @example
   * ```typescript
   * token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
   * ```
   */
  token?: string;

  /**
   * SAP AI Core deployment ID.
   *
   * A unique identifier for your model deployment in SAP AI Core.
   * You can find this in your SAP AI Core deployment details.
   * Each deployment represents a specific model configuration.
   *
   * @default 'd65d81e7c077e583'
   * @example
   * ```typescript
   * deploymentId: 'd65d81e7c077e583'  // Default general-purpose deployment
   * deploymentId: 'my-custom-deployment-id'
   * ```
   */
  deploymentId?: string;

  /**
   * SAP AI Core resource group.
   *
   * Logical grouping of AI resources in SAP AI Core.
   * Used for resource isolation and access control.
   * Different resource groups can have different permissions and quotas.
   *
   * @default 'default'
   * @example
   * ```typescript
   * resourceGroup: 'default'     // Default resource group
   * resourceGroup: 'production'  // Production environment
   * resourceGroup: 'development' // Development environment
   * ```
   */
  resourceGroup?: string;

  /**
   * Custom base URL for SAP AI Core API calls.
   *
   * Override the default API endpoint. Useful for:
   * - Different SAP AI Core regions
   * - Custom proxy configurations
   * - Development/testing environments
   *
   * @example
   * ```typescript
   * baseURL: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2'
   * baseURL: 'https://proxy.mycompany.com/sap-ai'
   * ```
   */
  baseURL?: string;

  /**
   * Custom HTTP headers to include in all requests.
   *
   * Useful for adding custom authentication, tracking, or proxy headers.
   *
   * @example
   * ```typescript
   * headers: {
   *   'X-Custom-Header': 'value',
   *   'User-Agent': 'MyApp/1.0.0'
   * }
   * ```
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation.
   *
   * Override the default fetch function for custom networking behavior,
   * such as adding retries, custom timeouts, or proxy configurations.
   *
   * @example
   * ```typescript
   * import { fetch } from 'undici';
   *
   * fetch: fetch  // Use undici instead of global fetch
   * ```
   */
  fetch?: typeof fetch;
}

/**
 * Obtains an OAuth2 access token from SAP AI Core using client credentials flow.
 *
 * This function handles the OAuth2 authentication process with SAP AI Core.
 * It uses the client credentials from the service key to obtain a Bearer token
 * that can be used for subsequent API calls.
 *
 * @param serviceKey - SAP AI Core service key containing OAuth2 credentials
 * @param customFetch - Optional custom fetch implementation
 * @returns Promise that resolves to an access token string
 *
 * @throws {Error} When OAuth2 authentication fails
 *
 * @internal This function is used internally by createSAPAIProvider
 *
 * @example
 * ```typescript
 * const token = await getOAuthToken(serviceKey);
 * // token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
 * ```
 */
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
 * Creates a SAP AI Core provider instance for use with Vercel AI SDK.
 *
 * This is the main entry point for integrating SAP AI Core with the Vercel AI SDK.
 * It handles authentication, configuration, and provides a standardized interface
 * for accessing SAP AI Core models.
 *
 * **Authentication Methods:**
 * 1. **Service Key (Recommended)**: Provide the JSON service key from SAP BTP
 * 2. **Direct Token**: Provide a valid OAuth2 access token
 * 3. **Environment Variables**: Use SAP_AI_SERVICE_KEY or SAP_AI_TOKEN
 *
 * **Key Features:**
 * - Automatic OAuth2 token management
 * - Support for all SAP AI Core model types
 * - Built-in error handling and retries
 * - Type-safe configuration
 * - Compatible with Vercel AI SDK patterns
 *
 * @param options - Configuration options for the provider
 * @returns Promise that resolves to a configured SAP AI provider
 *
 * @throws {Error} When authentication fails or configuration is invalid
 *
 * @example
 * **Basic Usage with Service Key**
 * ```typescript
 * import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
 * import { generateText } from 'ai';
 *
 * const provider = await createSAPAIProvider({
 *   serviceKey: process.env.SAP_AI_SERVICE_KEY
 * });
 *
 * const result = await generateText({
 *   model: provider('gpt-4o'),
 *   prompt: 'Hello, world!'
 * });
 * ```
 *
 * @example
 * **Advanced Configuration**
 * ```typescript
 * const provider = await createSAPAIProvider({
 *   serviceKey: serviceKeyObject,
 *   deploymentId: 'custom-deployment-id',
 *   resourceGroup: 'production',
 *   headers: {
 *     'X-Custom-Header': 'value'
 *   }
 * });
 *
 * // Use with specific model settings
 * const model = provider('gpt-4o', {
 *   modelParams: {
 *     temperature: 0.3,
 *     maxTokens: 2000
 *   }
 * });
 * ```
 *
 * @example
 * **With Custom Deployment**
 * ```typescript
 * const provider = await createSAPAIProvider({
 *   token: process.env.SAP_AI_TOKEN,
 *   deploymentId: 'my-fine-tuned-model',
 *   baseURL: 'https://api.ai.prod.us-east-1.aws.ml.hana.ondemand.com/v2'
 * });
 * ```
 *
 * @example
 * **Error Handling**
 * ```typescript
 * try {
 *   const provider = await createSAPAIProvider({
 *     serviceKey: invalidServiceKey
 *   });
 * } catch (error) {
 *   if (error.message.includes('OAuth')) {
 *     console.error('Authentication failed:', error.message);
 *   }
 * }
 * ```
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
