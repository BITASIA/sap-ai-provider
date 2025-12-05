import { ProviderV2 } from "@ai-sdk/provider";
import type { HttpDestinationOrFetchOptions } from "@sap-cloud-sdk/connectivity";
import type {
  ResourceGroupConfig,
  DeploymentIdConfig,
} from "@sap-ai-sdk/ai-api/internal.js";
import { SAPAIChatLanguageModel } from "./sap-ai-chat-language-model";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-chat-settings";

/**
 * SAP AI Provider interface.
 *
 * This is the main interface for creating and configuring SAP AI Core models.
 * It extends the standard Vercel AI SDK ProviderV2 interface with SAP-specific functionality.
 *
 * @example
 * ```typescript
 * const provider = createSAPAIProvider({
 *   resourceGroup: 'default'
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
   * @param modelId - The SAP AI Core model identifier (e.g., 'gpt-4o', 'anthropic--claude-3.5-sonnet')
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
 * This interface defines all available options for configuring the SAP AI Core connection
 * using the official SAP AI SDK. The SDK handles authentication automatically when
 * running on SAP BTP (via service binding) or locally (via AICORE_SERVICE_KEY env var).
 *
 * @example
 * ```typescript
 * // Using default configuration (auto-detects service binding or env var)
 * const provider = createSAPAIProvider();
 *
 * // With specific resource group
 * const provider = createSAPAIProvider({
 *   resourceGroup: 'production'
 * });
 *
 * // With custom destination
 * const provider = createSAPAIProvider({
 *   destination: {
 *     url: 'https://my-ai-core-instance.cfapps.eu10.hana.ondemand.com'
 *   }
 * });
 * ```
 */
export interface SAPAIProviderSettings {
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
   * SAP AI Core deployment ID.
   *
   * A specific deployment ID to use for orchestration requests.
   * If not provided, the SDK will resolve the deployment automatically.
   *
   * @example
   * ```typescript
   * deploymentId: 'd65d81e7c077e583'
   * ```
   */
  deploymentId?: string;

  /**
   * Custom destination configuration for SAP AI Core.
   *
   * Override the default destination detection. Useful for:
   * - Custom proxy configurations
   * - Non-standard SAP AI Core setups
   * - Testing environments
   *
   * @example
   * ```typescript
   * destination: {
   *   url: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com'
   * }
   * ```
   */
  destination?: HttpDestinationOrFetchOptions;

  /**
   * Default model settings applied to every model instance created by this provider.
   * Per-call settings provided to the model will override these.
   */
  defaultSettings?: SAPAISettings;
}

/**
 * Deployment configuration type used by SAP AI SDK.
 */
export type DeploymentConfig = ResourceGroupConfig | DeploymentIdConfig;

/**
 * Creates a SAP AI Core provider instance for use with Vercel AI SDK.
 *
 * This is the main entry point for integrating SAP AI Core with the Vercel AI SDK.
 * It uses the official SAP AI SDK (@sap-ai-sdk/orchestration) under the hood,
 * which handles authentication and API communication automatically.
 *
 * **Authentication:**
 * The SAP AI SDK automatically handles authentication:
 * 1. On SAP BTP: Uses service binding (VCAP_SERVICES)
 * 2. Locally: Uses AICORE_SERVICE_KEY environment variable
 *
 * **Key Features:**
 * - Automatic authentication via SAP AI SDK
 * - Support for all SAP AI Core orchestration models
 * - Streaming and non-streaming responses
 * - Tool calling support
 * - Data masking (DPI)
 * - Content filtering
 *
 * @param options - Configuration options for the provider
 * @returns A configured SAP AI provider
 *
 * @example
 * **Basic Usage**
 * ```typescript
 * import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
 * import { generateText } from 'ai';
 *
 * const provider = createSAPAIProvider();
 *
 * const result = await generateText({
 *   model: provider('gpt-4o'),
 *   prompt: 'Hello, world!'
 * });
 * ```
 *
 * @example
 * **With Resource Group**
 * ```typescript
 * const provider = createSAPAIProvider({
 *   resourceGroup: 'production'
 * });
 *
 * const model = provider('anthropic--claude-3.5-sonnet', {
 *   modelParams: {
 *     temperature: 0.3,
 *     maxTokens: 2000
 *   }
 * });
 * ```
 *
 * @example
 * **With Default Settings**
 * ```typescript
 * const provider = createSAPAIProvider({
 *   defaultSettings: {
 *     modelParams: {
 *       temperature: 0.7
 *     }
 *   }
 * });
 * ```
 */
export function createSAPAIProvider(
  options: SAPAIProviderSettings = {},
): SAPAIProvider {
  const resourceGroup = options.resourceGroup ?? "default";

  // Build deployment config for SAP AI SDK
  const deploymentConfig: DeploymentConfig = options.deploymentId
    ? { deploymentId: options.deploymentId }
    : { resourceGroup };

  // Create the model factory function
  const createModel = (modelId: SAPAIModelId, settings: SAPAISettings = {}) => {
    const mergedSettings: SAPAISettings = {
      ...options.defaultSettings,
      ...settings,
      modelParams: {
        ...(options.defaultSettings?.modelParams ?? {}),
        ...(settings.modelParams ?? {}),
      },
    };

    return new SAPAIChatLanguageModel(modelId, mergedSettings, {
      provider: "sap-ai",
      deploymentConfig,
      destination: options.destination,
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
 * Default SAP AI provider instance.
 *
 * Uses the default configuration which auto-detects authentication
 * from service binding (SAP BTP) or AICORE_SERVICE_KEY environment variable.
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
export const sapai = createSAPAIProvider();
