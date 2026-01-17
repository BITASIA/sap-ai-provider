import type {
  EmbeddingModelV3,
  EmbeddingModelV3CallOptions,
  EmbeddingModelV3Embedding,
  EmbeddingModelV3Result,
  SharedV3ProviderMetadata,
} from "@ai-sdk/provider";
import type { DeploymentIdConfig, ResourceGroupConfig } from "@sap-ai-sdk/ai-api/internal.js";
import type { EmbeddingModelConfig, EmbeddingModelParams } from "@sap-ai-sdk/orchestration";
import type { HttpDestinationOrFetchOptions } from "@sap-cloud-sdk/connectivity";

import { TooManyEmbeddingValuesForCallError } from "@ai-sdk/provider";
import { OrchestrationEmbeddingClient } from "@sap-ai-sdk/orchestration";

import { convertToAISDKError } from "./sap-ai-error.js";

/**
 * Default maximum number of embeddings per call.
 * OpenAI's embedding API supports up to 2048 inputs per request.
 */
const DEFAULT_MAX_EMBEDDINGS_PER_CALL = 2048;

/**
 * Model ID type for SAP AI embedding models.
 *
 * Common embedding models available in SAP AI Core:
 * - `text-embedding-ada-002` - OpenAI Ada v2
 * - `text-embedding-3-small` - OpenAI v3 small
 * - `text-embedding-3-large` - OpenAI v3 large
 */
export type SAPAIEmbeddingModelId = string;

/**
 * Settings for the SAP AI Embedding Model.
 */
export interface SAPAIEmbeddingSettings {
  /**
   * Maximum number of embeddings per API call.
   * @default 2048
   */
  maxEmbeddingsPerCall?: number;

  /**
   * Additional model parameters passed to the embedding API.
   */
  modelParams?: EmbeddingModelParams;

  /**
   * Embedding task type.
   * @default 'text'
   */
  type?: "document" | "query" | "text";
}

/**
 * Internal configuration for the SAP AI Embedding Model.
 * @internal
 */
interface SAPAIEmbeddingConfig {
  deploymentConfig: DeploymentIdConfig | ResourceGroupConfig;
  destination?: HttpDestinationOrFetchOptions;
  provider: string;
}

/**
 * SAP AI Core Embedding Model implementing the Vercel AI SDK EmbeddingModelV3 interface.
 *
 * This class wraps the SAP AI SDK's OrchestrationEmbeddingClient to provide
 * embedding generation capabilities compatible with the Vercel AI SDK.
 * @example
 * ```typescript
 * import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
 * import { embed, embedMany } from 'ai';
 *
 * const provider = createSAPAIProvider();
 *
 * // Single embedding
 * const { embedding } = await embed({
 *   model: provider.embedding('text-embedding-ada-002'),
 *   value: 'Hello, world!'
 * });
 *
 * // Multiple embeddings
 * const { embeddings } = await embedMany({
 *   model: provider.embedding('text-embedding-3-small'),
 *   values: ['Hello', 'World', 'AI']
 * });
 * ```
 */
export class SAPAIEmbeddingModel implements EmbeddingModelV3 {
  /**
   * Maximum number of embeddings that can be generated in a single API call.
   * @default 2048
   */
  readonly maxEmbeddingsPerCall: number;

  /**
   * The model ID.
   */
  readonly modelId: string;

  /**
   * The provider identifier.
   */
  readonly provider: string;

  /**
   * The embedding model interface version.
   */
  readonly specificationVersion = "v3" as const;

  /**
   * Whether the model supports parallel calls.
   * Set to true as SAP AI Core can handle concurrent requests.
   */
  readonly supportsParallelCalls: boolean = true;

  private readonly config: SAPAIEmbeddingConfig;
  private readonly settings: SAPAIEmbeddingSettings;

  /**
   * Creates a new SAP AI Embedding Model instance.
   * @param modelId - The embedding model identifier (e.g., 'text-embedding-ada-002')
   * @param settings - Optional model settings
   * @param config - Internal configuration from the provider
   */
  constructor(
    modelId: SAPAIEmbeddingModelId,
    settings: SAPAIEmbeddingSettings = {},
    config: SAPAIEmbeddingConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.provider = config.provider;
    this.maxEmbeddingsPerCall = settings.maxEmbeddingsPerCall ?? DEFAULT_MAX_EMBEDDINGS_PER_CALL;
  }

  /**
   * Generates embeddings for the given input values.
   *
   * This method implements the EmbeddingModelV3 interface and wraps
   * the SAP AI SDK's OrchestrationEmbeddingClient.
   * @param options - The embedding request options
   * @returns Promise resolving to embeddings and usage information
   * @example
   * ```typescript
   * const result = await model.doEmbed({
   *   values: ['Hello, world!', 'How are you?']
   * });
   *
   * console.log(result.embeddings); // [[0.1, 0.2, ...], [0.3, 0.4, ...]]
   * console.log(result.usage?.tokens); // 10
   * ```
   */
  async doEmbed(options: EmbeddingModelV3CallOptions): Promise<EmbeddingModelV3Result> {
    const { abortSignal, values } = options;

    // Validate input count against maxEmbeddingsPerCall
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        modelId: this.modelId,
        provider: this.provider,
        values,
      });
    }

    try {
      const client = this.createClient();

      const response = await client.embed(
        {
          input: values,
          type: this.settings.type ?? "text",
        },
        // Pass abortSignal to the SAP SDK via requestConfig
        abortSignal ? { signal: abortSignal } : undefined,
      );

      const embeddingData = response.getEmbeddings();
      const tokenUsage = response.getTokenUsage();

      // Sort embeddings by index to ensure correct order
      const sortedEmbeddings = [...embeddingData].sort((a, b) => a.index - b.index);

      const embeddings: EmbeddingModelV3Embedding[] = sortedEmbeddings.map((data) =>
        this.normalizeEmbedding(data.embedding),
      );

      const providerMetadata: SharedV3ProviderMetadata = {
        "sap-ai": {
          model: this.modelId,
        },
      };

      return {
        embeddings,
        providerMetadata,
        usage: { tokens: tokenUsage.total_tokens },
        warnings: [],
      };
    } catch (error) {
      throw convertToAISDKError(error, {
        operation: "doEmbed",
        requestBody: { values: values.length },
        url: "sap-ai:orchestration/embeddings",
      });
    }
  }

  /**
   * Creates an OrchestrationEmbeddingClient with the current configuration.
   * @returns Configured embedding client
   */
  private createClient(): OrchestrationEmbeddingClient {
    const embeddingConfig: EmbeddingModelConfig = {
      model: {
        name: this.modelId,
        ...(this.settings.modelParams ? { params: this.settings.modelParams } : {}),
      },
    };

    return new OrchestrationEmbeddingClient(
      { embeddings: embeddingConfig },
      this.config.deploymentConfig,
      this.config.destination,
    );
  }

  /**
   * Converts SAP embedding response to AI SDK format.
   * Handles both number array and base64-encoded string formats.
   * @param embedding - The embedding from SAP API (number[] or base64 string)
   * @returns Normalized embedding as number array
   */
  private normalizeEmbedding(embedding: number[] | string): EmbeddingModelV3Embedding {
    if (Array.isArray(embedding)) {
      return embedding;
    }

    // Handle base64-encoded embedding (less common)
    // Base64 string represents float32 values
    const buffer = Buffer.from(embedding, "base64");
    const float32Array = new Float32Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.length / Float32Array.BYTES_PER_ELEMENT,
    );
    return Array.from(float32Array);
  }
}
