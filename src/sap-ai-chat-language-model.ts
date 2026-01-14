import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3FunctionTool,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import type { JSONValue } from "@ai-sdk/provider";
import {
  OrchestrationClient,
  OrchestrationModuleConfig,
  ChatMessage,
  ChatCompletionTool,
} from "@sap-ai-sdk/orchestration";
import type { LlmModelParams } from "@sap-ai-sdk/orchestration";
import type { HttpDestinationOrFetchOptions } from "@sap-cloud-sdk/connectivity";
import type {
  ResourceGroupConfig,
  DeploymentIdConfig,
} from "@sap-ai-sdk/ai-api/internal.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType } from "zod";
import type { Template } from "@sap-ai-sdk/orchestration/dist/client/api/schema/template.js";

type SAPResponseFormat = Template["response_format"];

import { convertToSAPMessages } from "./convert-to-sap-messages";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-chat-settings";
import { convertToAISDKError } from "./sap-ai-error";

/**
 * Validates model parameters against expected ranges and adds warnings to the array.
 *
 * Does not throw errors to allow API-side validation to be authoritative.
 * Warnings help developers catch configuration issues early during development.
 *
 * @internal
 */
function validateModelParameters(
  params: {
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    maxTokens?: number;
    n?: number;
  },
  warnings: SharedV3Warning[],
): void {
  // Heuristic range checks (provider/model-specific constraints may differ).
  if (
    params.temperature !== undefined &&
    (params.temperature < 0 || params.temperature > 2)
  ) {
    warnings.push({
      type: "other",
      message: `temperature=${String(params.temperature)} is outside typical range [0, 2]. The API may reject this value.`,
    });
  }

  if (params.topP !== undefined && (params.topP < 0 || params.topP > 1)) {
    warnings.push({
      type: "other",
      message: `topP=${String(params.topP)} is outside valid range [0, 1]. The API may reject this value.`,
    });
  }

  if (
    params.frequencyPenalty !== undefined &&
    (params.frequencyPenalty < -2 || params.frequencyPenalty > 2)
  ) {
    warnings.push({
      type: "other",
      message: `frequencyPenalty=${String(params.frequencyPenalty)} is outside typical range [-2, 2]. The API may reject this value.`,
    });
  }

  if (
    params.presencePenalty !== undefined &&
    (params.presencePenalty < -2 || params.presencePenalty > 2)
  ) {
    warnings.push({
      type: "other",
      message: `presencePenalty=${String(params.presencePenalty)} is outside typical range [-2, 2]. The API may reject this value.`,
    });
  }

  if (params.maxTokens !== undefined && params.maxTokens <= 0) {
    warnings.push({
      type: "other",
      message: `maxTokens=${String(params.maxTokens)} must be positive. The API will likely reject this value.`,
    });
  }

  if (params.n !== undefined && params.n <= 0) {
    warnings.push({
      type: "other",
      message: `n=${String(params.n)} must be positive. The API will likely reject this value.`,
    });
  }
}

/**
 * Creates a summary of the AI SDK request body for error reporting.
 * @internal
 */
function createAISDKRequestBodySummary(options: LanguageModelV3CallOptions): {
  promptMessages: number;
  hasImageParts: boolean;
  tools: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: number;
  seed?: number;
  toolChoiceType?: string;
  responseFormatType?: string;
} {
  return {
    promptMessages: options.prompt.length,
    hasImageParts: options.prompt.some(
      (message) =>
        message.role === "user" &&
        message.content.some(
          (part) => part.type === "file" && part.mediaType.startsWith("image/"),
        ),
    ),
    tools: options.tools?.length ?? 0,
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
    maxOutputTokens: options.maxOutputTokens,
    stopSequences: options.stopSequences?.length,
    seed: options.seed,
    toolChoiceType: options.toolChoice?.type,
    responseFormatType: options.responseFormat?.type,
  };
}

/**
 * Extended SAP model parameters including additional OpenAI-compatible options
 * beyond the base LlmModelParams from SAP AI SDK.
 *
 * @internal
 */
type SAPModelParams = LlmModelParams & {
  top_k?: number;
  stop?: string[];
  seed?: number;
  parallel_tool_calls?: boolean;
};

/**
 * SAP tool parameters with required object type.
 *
 * @internal
 */
type SAPToolParameters = Record<string, unknown> & {
  type: "object";
};

/**
 * Extended function tool type that includes the raw parameters field
 * which may contain a Zod schema in some AI SDK versions.
 *
 * @internal
 */
interface FunctionToolWithParameters extends LanguageModelV3FunctionTool {
  parameters?: unknown;
}

/**
 * Type guard helper to check if an object has a callable 'parse' property.
 *
 * @param obj - Object to check
 * @returns True if object has callable parse method
 * @internal
 */
function hasCallableParse(
  obj: Record<string, unknown>,
): obj is Record<string, unknown> & { parse: (...args: unknown[]) => unknown } {
  return typeof obj.parse === "function";
}

/**
 * Type guard to check if an object is a Zod schema.
 * Used internally to detect Zod schemas passed via tool parameters.
 *
 * @param obj - Object to check
 * @returns True if object is a Zod schema
 * @internal
 */
function isZodSchema(obj: unknown): obj is ZodType {
  if (obj === null || typeof obj !== "object") {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return "_def" in record && "parse" in record && hasCallableParse(record);
}

/**
 * Build a SAPToolParameters object from a schema.
 * Ensures type: "object" is always present as required by SAP AI Core.
 *
 * @param schema - Input schema to convert
 * @returns SAPToolParameters with type: "object"
 * @internal
 */
function buildSAPToolParameters(
  schema: Record<string, unknown>,
): SAPToolParameters {
  const schemaType = schema.type;

  if (schemaType !== undefined && schemaType !== "object") {
    return {
      type: "object",
      properties: {},
      required: [],
    };
  }

  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, unknown>)
      : {};

  const required =
    Array.isArray(schema.required) &&
    schema.required.every((item) => typeof item === "string")
      ? schema.required
      : [];

  const additionalFields = Object.fromEntries(
    Object.entries(schema).filter(
      ([key]) => key !== "type" && key !== "properties" && key !== "required",
    ),
  );

  return {
    type: "object",
    properties,
    required,
    ...additionalFields,
  };
}

/**
 * Internal configuration for the SAP AI Chat Language Model.
 * @internal
 */
interface SAPAIConfig {
  provider: string;
  deploymentConfig: ResourceGroupConfig | DeploymentIdConfig;
  destination?: HttpDestinationOrFetchOptions;
}

/**
 * SAP AI Chat Language Model implementation.
 *
 * This class implements the AI SDK's `LanguageModelV3` interface,
 * providing a bridge between the AI SDK and SAP AI Core's Orchestration API
 * using the official SAP AI SDK (@sap-ai-sdk/orchestration).
 *
 * **Features:**
 * - Text generation (streaming and non-streaming)
 * - Tool calling (function calling)
 * - Multi-modal input (text + images)
 * - Data masking (SAP DPI)
 * - Content filtering
 *
 * **Model Support:**
 * - Azure OpenAI models (gpt-4o, gpt-4o-mini, o1, o3, etc.)
 * - Google Vertex AI models (gemini-2.0-flash, gemini-2.5-pro, etc.)
 * - AWS Bedrock models (anthropic--claude-*, amazon--nova-*, etc.)
 * - AI Core open source models (mistralai--, cohere--, etc.)
 *
 * @example
 * ```typescript
 * // Create via provider
 * const provider = createSAPAIProvider();
 * const model = provider('gpt-4o');
 *
 * // Use with AI SDK
 * const result = await generateText({
 *   model,
 *   prompt: 'Hello, world!'
 * });
 * ```
 *
 * @implements {LanguageModelV3}
 */
export class SAPAIChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";
  readonly modelId: SAPAIModelId;

  private readonly config: SAPAIConfig;
  private readonly settings: SAPAISettings;

  /**
   * Creates a new SAP AI Chat Language Model instance.
   *
   * @param modelId - The model identifier
   * @param settings - Model-specific configuration settings
   * @param config - Internal configuration (deployment config, destination, etc.)
   *
   * @internal This constructor is not meant to be called directly.
   * Use the provider function instead.
   */
  constructor(
    modelId: SAPAIModelId,
    settings: SAPAISettings,
    config: SAPAIConfig,
  ) {
    this.settings = settings;
    this.config = config;
    this.modelId = modelId;
  }

  /**
   * Checks if a URL is supported for file/image uploads.
   *
   * @param url - The URL to check
   * @returns True if the URL protocol is HTTPS or data with valid image format
   */
  supportsUrl(url: URL): boolean {
    if (url.protocol === "https:") return true;
    if (url.protocol === "data:") {
      // Validate data URL format for images
      return /^data:image\//i.test(url.href);
    }
    return false;
  }

  /**
   * Returns supported URL patterns for different content types.
   *
   * @returns Record of content types to regex patterns
   */
  get supportedUrls(): Record<string, RegExp[]> {
    return {
      "image/*": [/^https:\/\/.+$/i, /^data:image\/.*$/],
    };
  }

  /**
   * Generates text completion using SAP AI Core's Orchestration API.
   *
   * This method implements the `LanguageModelV3.doGenerate` interface,
   * providing synchronous (non-streaming) text generation with support for:
   * - Multi-turn conversations with system/user/assistant messages
   * - Tool calling (function calling) with structured outputs
   * - Multi-modal inputs (text + images)
   * - Data masking via SAP DPI
   * - Content filtering via Azure Content Safety or Llama Guard
   *
   * **Return Structure:**
   * - Finish reason: `{ unified: string, raw?: string }`
   * - Usage: Nested structure with token breakdown `{ inputTokens: { total, ... }, outputTokens: { total, ... } }`
   * - Warnings: Array of warnings with `type` and optional `feature` field
   *
   * @param options - Generation options including prompt, tools, temperature, etc.
   * @returns Promise resolving to generation result with content, usage, and metadata
   *
   * @throws {InvalidPromptError} If prompt format is invalid
   * @throws {InvalidArgumentError} If arguments are malformed
   * @throws {APICallError} If the SAP AI Core API call fails
   *
   * @example
   * ```typescript
   * const result = await model.doGenerate({
   *   prompt: [
   *     { role: 'user', content: [{ type: 'text', text: 'Hello!' }] }
   *   ],
   *   temperature: 0.7,
   *   maxTokens: 100
   * });
   *
   * console.log(result.content); // Array of V3 content parts
   * console.log(result.finishReason.unified); // "stop", "length", "tool-calls", etc.
   * console.log(result.usage.inputTokens.total); // Total input tokens
   * ```
   *
   * @since 1.0.0
   * @since 4.0.0 Updated to LanguageModelV3 interface
   */
  get provider(): string {
    return this.config.provider;
  }

  /**
   * Model capabilities.
   *
   * These defaults assume “modern” model behavior to avoid maintaining a
   * per-model capability matrix. If a deployment doesn't support a feature,
   * SAP AI Core will fail the request at runtime.
   */
  readonly supportsImageUrls: boolean = true;

  /** Structured JSON outputs (json_schema response format). */
  readonly supportsStructuredOutputs: boolean = true;

  /** Tool/function calling. */
  readonly supportsToolCalls: boolean = true;

  /** Streaming responses. */
  readonly supportsStreaming: boolean = true;

  /** Multiple completions via the `n` parameter (provider-specific support). */
  readonly supportsMultipleCompletions: boolean = true;

  /** Parallel tool calls. */
  readonly supportsParallelToolCalls: boolean = true;

  /**
   * Builds orchestration module config for SAP AI SDK.
   *
   * @param options - Call options from the AI SDK
   * @returns Object containing orchestration config, messages, and warnings
   * @internal
   */
  private buildOrchestrationConfig(options: LanguageModelV3CallOptions): {
    orchestrationConfig: OrchestrationModuleConfig;
    messages: ChatMessage[];
    warnings: SharedV3Warning[];
  } {
    const providerOptions =
      (options.providerOptions as { sap?: Partial<SAPAISettings> } | undefined)
        ?.sap ?? {};
    const warnings: SharedV3Warning[] = [];

    const messages = convertToSAPMessages(options.prompt, {
      includeReasoning:
        providerOptions.includeReasoning ??
        this.settings.includeReasoning ??
        false,
    });

    // AI SDK convention: options.tools override provider/model defaults
    let tools: ChatCompletionTool[] | undefined;

    const settingsTools = providerOptions.tools ?? this.settings.tools;
    const optionsTools = options.tools;

    const shouldUseSettingsTools =
      settingsTools &&
      settingsTools.length > 0 &&
      (!optionsTools || optionsTools.length === 0);

    const shouldUseOptionsTools = !!(optionsTools && optionsTools.length > 0);

    if (
      settingsTools &&
      settingsTools.length > 0 &&
      optionsTools &&
      optionsTools.length > 0
    ) {
      warnings.push({
        type: "other",
        message:
          "Both settings.tools and call options.tools were provided; preferring call options.tools.",
      });
    }

    if (shouldUseSettingsTools) {
      tools = settingsTools;
    } else {
      const availableTools = shouldUseOptionsTools ? optionsTools : undefined;

      tools = availableTools
        ?.map((tool): ChatCompletionTool | null => {
          if (tool.type === "function") {
            const inputSchema = tool.inputSchema as
              | Record<string, unknown>
              | undefined;

            // AI SDK may pass Zod schemas in 'parameters' field (internal detail)
            const toolWithParams = tool as FunctionToolWithParameters;

            let parameters: SAPToolParameters;

            if (
              toolWithParams.parameters &&
              isZodSchema(toolWithParams.parameters)
            ) {
              try {
                const jsonSchema = zodToJsonSchema(
                  toolWithParams.parameters as never,
                  {
                    $refStrategy: "none",
                  },
                );
                const schemaRecord = jsonSchema as Record<string, unknown>;
                delete schemaRecord.$schema;
                parameters = buildSAPToolParameters(schemaRecord);
              } catch {
                warnings.push({
                  type: "unsupported",
                  feature: `tool schema conversion for ${tool.name}`,
                  details:
                    "Failed to convert tool Zod schema to JSON Schema. Falling back to empty object schema.",
                });
                parameters = buildSAPToolParameters({});
              }
            } else if (inputSchema && Object.keys(inputSchema).length > 0) {
              const hasProperties =
                inputSchema.properties &&
                typeof inputSchema.properties === "object" &&
                Object.keys(inputSchema.properties).length > 0;

              if (hasProperties) {
                parameters = buildSAPToolParameters(inputSchema);
              } else {
                parameters = buildSAPToolParameters({});
              }
            } else {
              parameters = buildSAPToolParameters({});
            }

            return {
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters,
              },
            };
          } else {
            warnings.push({
              type: "unsupported",
              feature: `tool type for ${tool.name}`,
              details: "Only 'function' tool type is supported.",
            });
            return null;
          }
        })
        .filter((t): t is ChatCompletionTool => t !== null);
    }

    // Amazon Bedrock and Anthropic models don't support the 'n' parameter
    // Only set n when explicitly provided to avoid overriding API defaults
    const supportsN =
      !this.modelId.startsWith("amazon--") &&
      !this.modelId.startsWith("anthropic--");

    const modelParams: SAPModelParams = {};

    const maxTokens =
      options.maxOutputTokens ??
      providerOptions.modelParams?.maxTokens ??
      this.settings.modelParams?.maxTokens;
    if (maxTokens !== undefined) modelParams.max_tokens = maxTokens;

    const temperature =
      options.temperature ??
      providerOptions.modelParams?.temperature ??
      this.settings.modelParams?.temperature;
    if (temperature !== undefined) modelParams.temperature = temperature;

    const topP =
      options.topP ??
      providerOptions.modelParams?.topP ??
      this.settings.modelParams?.topP;
    if (topP !== undefined) modelParams.top_p = topP;

    if (options.topK !== undefined) modelParams.top_k = options.topK;

    const frequencyPenalty =
      options.frequencyPenalty ??
      providerOptions.modelParams?.frequencyPenalty ??
      this.settings.modelParams?.frequencyPenalty;
    if (frequencyPenalty !== undefined) {
      modelParams.frequency_penalty = frequencyPenalty;
    }

    const presencePenalty =
      options.presencePenalty ??
      providerOptions.modelParams?.presencePenalty ??
      this.settings.modelParams?.presencePenalty;
    if (presencePenalty !== undefined) {
      modelParams.presence_penalty = presencePenalty;
    }

    if (supportsN) {
      const nValue =
        providerOptions.modelParams?.n ?? this.settings.modelParams?.n;
      if (nValue !== undefined) {
        modelParams.n = nValue;
      }
      // If n is not explicitly provided, omit it to allow the API to use its default
    }

    const parallelToolCalls =
      providerOptions.modelParams?.parallel_tool_calls ??
      this.settings.modelParams?.parallel_tool_calls;
    if (parallelToolCalls !== undefined) {
      modelParams.parallel_tool_calls = parallelToolCalls;
    }

    if (options.stopSequences && options.stopSequences.length > 0) {
      modelParams.stop = options.stopSequences;
    }

    if (options.seed !== undefined) {
      modelParams.seed = options.seed;
    }

    // Validate model parameters and add warnings for out-of-range values
    validateModelParameters(
      {
        temperature,
        topP,
        frequencyPenalty,
        presencePenalty,
        maxTokens,
        n: modelParams.n,
      },
      warnings,
    );

    // SAP AI SDK only supports toolChoice: 'auto'
    if (options.toolChoice && options.toolChoice.type !== "auto") {
      warnings.push({
        type: "unsupported",
        feature: "toolChoice",
        details: `SAP AI SDK does not support toolChoice '${options.toolChoice.type}'. Using default 'auto' behavior.`,
      });
    }

    // Forward JSON mode to model; support varies by deployment
    if (options.responseFormat?.type === "json") {
      warnings.push({
        type: "other",
        message:
          "responseFormat JSON mode is forwarded to the underlying model; support and schema adherence depend on the model/deployment.",
      });
    }

    const responseFormat: SAPResponseFormat | undefined =
      options.responseFormat?.type === "json"
        ? options.responseFormat.schema
          ? {
              type: "json_schema" as const,
              json_schema: {
                name: options.responseFormat.name ?? "response",
                description: options.responseFormat.description,
                schema: options.responseFormat.schema as Record<
                  string,
                  unknown
                >,
                strict: null,
              },
            }
          : { type: "json_object" as const }
        : undefined;

    const orchestrationConfig: OrchestrationModuleConfig = {
      promptTemplating: {
        model: {
          name: this.modelId,
          version:
            providerOptions.modelVersion ??
            this.settings.modelVersion ??
            "latest",
          params: modelParams,
        },
        prompt: {
          template: [],
          tools: tools && tools.length > 0 ? tools : undefined,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        },
      },
      ...(() => {
        const masking = providerOptions.masking ?? this.settings.masking;
        return masking && Object.keys(masking).length > 0 ? { masking } : {};
      })(),
      ...(() => {
        const filtering = providerOptions.filtering ?? this.settings.filtering;
        return filtering && Object.keys(filtering).length > 0
          ? { filtering }
          : {};
      })(),
    };

    return { orchestrationConfig, messages, warnings };
  }

  /**
   * Creates an OrchestrationClient instance.
   *
   * @param config - Orchestration module configuration
   * @returns OrchestrationClient instance
   * @internal
   */
  private createClient(config: OrchestrationModuleConfig): OrchestrationClient {
    return new OrchestrationClient(
      config,
      this.config.deploymentConfig,
      this.config.destination,
    );
  }

  /**
   * Generates a single completion (non-streaming).
   *
   * This method implements the `LanguageModelV3.doGenerate` interface,
   * sending a request to SAP AI Core and returning the complete response.
   *
   * **Features:**
   * - Tool calling support
   * - Multi-modal input (text + images)
   * - Data masking (if configured)
   * - Content filtering (if configured)
   * - Abort signal support (via Promise.race)
   *
   * **Note on Abort Signal:**
   * The abort signal implementation uses Promise.race to reject the promise when
   * the signal is aborted. However, this does not cancel the underlying HTTP request
   * to SAP AI Core - the request continues executing on the server. This is a
   * limitation of the SAP AI SDK's chatCompletion API.
   *
   * @param options - Generation options including prompt, tools, and settings
   * @returns Promise resolving to the generation result with content, usage, and metadata
   *
   * @example
   * ```typescript
   * const result = await model.doGenerate({
   *   prompt: [
   *     { role: 'user', content: [{ type: 'text', text: 'Hello!' }] }
   *   ]
   * });
   *
   * console.log(result.content); // Generated content
   * console.log(result.usage);   // Token usage
   * ```
   */
  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    try {
      const { orchestrationConfig, messages, warnings } =
        this.buildOrchestrationConfig(options);

      const client = this.createClient(orchestrationConfig);

      const promptTemplating =
        orchestrationConfig.promptTemplating as unknown as {
          prompt: { tools?: unknown; response_format?: unknown };
        };

      const requestBody = {
        messages,
        model: {
          ...orchestrationConfig.promptTemplating.model,
        },
        ...(promptTemplating.prompt.tools
          ? { tools: promptTemplating.prompt.tools }
          : {}),
        ...(promptTemplating.prompt.response_format
          ? { response_format: promptTemplating.prompt.response_format }
          : {}),
        ...(() => {
          const masking = orchestrationConfig.masking;
          return masking && Object.keys(masking).length > 0 ? { masking } : {};
        })(),
        ...(() => {
          const filtering = orchestrationConfig.filtering;
          return filtering && Object.keys(filtering).length > 0
            ? { filtering }
            : {};
        })(),
      };

      // SAP AI SDK's chatCompletion() doesn't accept AbortSignal directly
      // Implement cancellation via Promise.race() when an AbortSignal is provided
      const response = await (async () => {
        const completionPromise = client.chatCompletion(requestBody);

        if (options.abortSignal) {
          return Promise.race([
            completionPromise,
            new Promise<never>((_, reject) => {
              if (options.abortSignal?.aborted) {
                reject(
                  new Error(
                    `Request aborted: ${String(options.abortSignal.reason ?? "unknown reason")}`,
                  ),
                );
                return;
              }

              options.abortSignal?.addEventListener(
                "abort",
                () => {
                  reject(
                    new Error(
                      `Request aborted: ${String(options.abortSignal?.reason ?? "unknown reason")}`,
                    ),
                  );
                },
                { once: true },
              );
            }),
          ]);
        }

        return completionPromise;
      })();
      const responseHeadersRaw = response.rawResponse.headers as
        | Record<string, unknown>
        | undefined;
      const responseHeaders = responseHeadersRaw
        ? Object.fromEntries(
            Object.entries(responseHeadersRaw).flatMap(([key, value]) => {
              if (typeof value === "string") return [[key, value]];
              if (Array.isArray(value)) {
                // Use semicolon separator to avoid ambiguity with commas in header values
                const strings = value
                  .filter((item): item is string => typeof item === "string")
                  .join("; ");
                return strings.length > 0 ? [[key, strings]] : [];
              }
              if (typeof value === "number" || typeof value === "boolean") {
                return [[key, String(value)]];
              }
              return [];
            }),
          )
        : undefined;

      const content: LanguageModelV3Content[] = [];

      const textContent = response.getContent();
      if (textContent) {
        content.push({
          type: "text",
          text: textContent,
        });
      }

      const toolCalls = response.getToolCalls();
      if (toolCalls) {
        for (const toolCall of toolCalls) {
          content.push({
            type: "tool-call",
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            input: toolCall.function.arguments,
          });
        }
      }

      const tokenUsage = response.getTokenUsage();

      const finishReasonRaw = response.getFinishReason();
      const finishReason = mapFinishReason(finishReasonRaw);

      const rawResponseBody = {
        content: textContent,
        toolCalls,
        tokenUsage,
        finishReason: finishReasonRaw,
      };

      return {
        content,
        finishReason,
        usage: {
          inputTokens: {
            total: tokenUsage.prompt_tokens,
            noCache: tokenUsage.prompt_tokens,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: tokenUsage.completion_tokens,
            text: tokenUsage.completion_tokens,
            reasoning: undefined,
          },
        },
        providerMetadata: {
          "sap-ai": {
            finishReason: finishReasonRaw ?? "unknown",
            finishReasonMapped: finishReason,
            ...(typeof responseHeaders?.["x-request-id"] === "string"
              ? { requestId: responseHeaders["x-request-id"] }
              : {}),
          },
        },
        request: {
          body: requestBody as unknown,
        },
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
          body: rawResponseBody,
        },
        warnings,
      };
    } catch (error) {
      throw convertToAISDKError(error, {
        operation: "doGenerate",
        url: "sap-ai:orchestration",
        requestBody: createAISDKRequestBodySummary(options),
      });
    }
  }

  /**
   * Generates a streaming completion.
   *
   * This method implements the `LanguageModelV3.doStream` interface,
   * sending a streaming request to SAP AI Core and returning a stream of response parts.
   *
   * **Stream Events:**
   * - `stream-start` - Stream initialization with warnings
   * - `response-metadata` - Response metadata (model, timestamp)
   * - `text-start` - Text block begins (with unique ID)
   * - `text-delta` - Incremental text chunks (with block ID)
   * - `text-end` - Text block completes (with accumulated text)
   * - `tool-input-start` - Tool input begins
   * - `tool-input-delta` - Tool input chunk
   * - `tool-input-end` - Tool input completes
   * - `tool-call` - Complete tool call
   * - `finish` - Stream completes with usage and finish reason
   * - `error` - Error occurred
   *
   * **Stream Structure:**
   * - Text blocks have explicit lifecycle with unique IDs
   * - Finish reason format: `{ unified: string, raw?: string }`
   * - Usage format: `{ inputTokens: { total, ... }, outputTokens: { total, ... } }`
   * - Warnings only in `stream-start` event
   *
   * @param options - Streaming options including prompt, tools, and settings
   * @returns Promise resolving to stream and request metadata
   *
   * @example
   * ```typescript
   * const { stream } = await model.doStream({
   *   prompt: [
   *     { role: 'user', content: [{ type: 'text', text: 'Write a story' }] }
   *   ]
   * });
   *
   * for await (const part of stream) {
   *   if (part.type === 'text-delta') {
   *     process.stdout.write(part.delta);
   *   }
   *   if (part.type === 'text-end') {
   *     console.log('Block complete:', part.id, part.text);
   *   }
   * }
   * ```
   *
   * @since 4.0.0
   */
  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    try {
      const { orchestrationConfig, messages, warnings } =
        this.buildOrchestrationConfig(options);

      const client = this.createClient(orchestrationConfig);

      const promptTemplating =
        orchestrationConfig.promptTemplating as unknown as {
          prompt: { tools?: unknown; response_format?: unknown };
        };

      const requestBody = {
        messages,
        model: {
          ...orchestrationConfig.promptTemplating.model,
        },
        ...(promptTemplating.prompt.tools
          ? { tools: promptTemplating.prompt.tools }
          : {}),
        ...(promptTemplating.prompt.response_format
          ? { response_format: promptTemplating.prompt.response_format }
          : {}),
        ...(() => {
          const masking = orchestrationConfig.masking;
          return masking && Object.keys(masking).length > 0 ? { masking } : {};
        })(),
        ...(() => {
          const filtering = orchestrationConfig.filtering;
          return filtering && Object.keys(filtering).length > 0
            ? { filtering }
            : {};
        })(),
      };

      const streamResponse = await client.stream(
        requestBody,
        options.abortSignal,
        { promptTemplating: { include_usage: true } },
      );

      // Track stream state in one place to keep updates consistent
      const streamState = {
        finishReason: {
          unified: "other" as const,
          raw: undefined,
        } as LanguageModelV3FinishReason,
        usage: {
          inputTokens: {
            total: undefined as number | undefined,
            noCache: undefined as number | undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: undefined as number | undefined,
            text: undefined as number | undefined,
            reasoning: undefined,
          },
        },
        isFirstChunk: true,
        activeText: false,
      };

      const toolCallsInProgress = new Map<
        number,
        {
          id: string;
          toolName?: string;
          arguments: string;
          didEmitInputStart: boolean;
          didEmitCall: boolean;
        }
      >();

      const sdkStream = streamResponse.stream;
      const modelId = this.modelId;

      const warningsSnapshot = [...warnings];

      // Warnings may be discovered while consuming the upstream stream
      // Expose them on the final result without mutating stream-start
      const warningsOut: SharedV3Warning[] = [...warningsSnapshot];

      const transformedStream = new ReadableStream<LanguageModelV3StreamPart>({
        async start(controller) {
          controller.enqueue({
            type: "stream-start",
            warnings: warningsSnapshot,
          });

          try {
            for await (const chunk of sdkStream) {
              if (streamState.isFirstChunk) {
                streamState.isFirstChunk = false;
                controller.enqueue({
                  type: "response-metadata",
                  modelId,
                  timestamp: new Date(),
                });
              }

              const deltaToolCalls = chunk.getDeltaToolCalls();
              if (Array.isArray(deltaToolCalls) && deltaToolCalls.length > 0) {
                // Once tool call deltas appear, stop emitting text deltas
                streamState.finishReason = {
                  unified: "tool-calls",
                  raw: undefined,
                };
              }

              const deltaContent = chunk.getDeltaContent();
              if (
                typeof deltaContent === "string" &&
                deltaContent.length > 0 &&
                streamState.finishReason.unified !== "tool-calls"
              ) {
                if (!streamState.activeText) {
                  controller.enqueue({ type: "text-start", id: "0" });
                  streamState.activeText = true;
                }
                controller.enqueue({
                  type: "text-delta",
                  id: "0",
                  delta: deltaContent,
                });
              }

              if (Array.isArray(deltaToolCalls) && deltaToolCalls.length > 0) {
                for (const toolCallChunk of deltaToolCalls) {
                  const index = toolCallChunk.index;
                  if (typeof index !== "number" || !Number.isFinite(index)) {
                    continue;
                  }

                  if (!toolCallsInProgress.has(index)) {
                    toolCallsInProgress.set(index, {
                      id: toolCallChunk.id ?? `tool_${String(index)}`,
                      toolName: toolCallChunk.function?.name,
                      arguments: "",
                      didEmitInputStart: false,
                      didEmitCall: false,
                    });
                  }

                  const tc = toolCallsInProgress.get(index);
                  if (!tc) continue;

                  if (toolCallChunk.id) {
                    tc.id = toolCallChunk.id;
                  }

                  const nextToolName = toolCallChunk.function?.name;
                  if (
                    typeof nextToolName === "string" &&
                    nextToolName.length > 0
                  ) {
                    tc.toolName = nextToolName;
                  }

                  if (!tc.didEmitInputStart && tc.toolName) {
                    tc.didEmitInputStart = true;
                    controller.enqueue({
                      type: "tool-input-start",
                      id: tc.id,
                      toolName: tc.toolName,
                    });
                  }

                  const argumentsDelta = toolCallChunk.function?.arguments;
                  if (
                    typeof argumentsDelta === "string" &&
                    argumentsDelta.length > 0
                  ) {
                    tc.arguments += argumentsDelta;

                    if (tc.didEmitInputStart) {
                      controller.enqueue({
                        type: "tool-input-delta",
                        id: tc.id,
                        delta: argumentsDelta,
                      });
                    }
                  }
                }
              }

              const chunkFinishReason = chunk.getFinishReason();
              if (chunkFinishReason) {
                streamState.finishReason = mapFinishReason(chunkFinishReason);

                if (streamState.finishReason.unified === "tool-calls") {
                  const toolCalls = Array.from(toolCallsInProgress.values());
                  for (const tc of toolCalls) {
                    if (tc.didEmitCall) {
                      continue;
                    }
                    if (!tc.didEmitInputStart) {
                      tc.didEmitInputStart = true;
                      controller.enqueue({
                        type: "tool-input-start",
                        id: tc.id,
                        toolName: tc.toolName ?? "",
                      });
                    }

                    if (!tc.toolName) {
                      warningsOut.push({
                        type: "other",
                        message:
                          "Received tool-call delta without a tool name. Emitting tool-call with an empty tool name.",
                      });
                    }

                    tc.didEmitCall = true;
                    controller.enqueue({ type: "tool-input-end", id: tc.id });
                    controller.enqueue({
                      type: "tool-call",
                      toolCallId: tc.id,
                      toolName: tc.toolName ?? "",
                      input: tc.arguments,
                    });
                  }

                  if (streamState.activeText) {
                    controller.enqueue({ type: "text-end", id: "0" });
                    streamState.activeText = false;
                  }
                }
              }
            }

            const toolCalls = Array.from(toolCallsInProgress.values());
            let didEmitAnyToolCalls = false;

            for (const tc of toolCalls) {
              if (tc.didEmitCall) {
                continue;
              }

              if (!tc.didEmitInputStart) {
                tc.didEmitInputStart = true;
                controller.enqueue({
                  type: "tool-input-start",
                  id: tc.id,
                  toolName: tc.toolName ?? "",
                });
              }

              if (!tc.toolName) {
                warningsOut.push({
                  type: "other",
                  message:
                    "Received tool-call delta without a tool name. Emitting tool-call with an empty tool name.",
                });
              }

              didEmitAnyToolCalls = true;
              tc.didEmitCall = true;
              controller.enqueue({ type: "tool-input-end", id: tc.id });
              controller.enqueue({
                type: "tool-call",
                toolCallId: tc.id,
                toolName: tc.toolName ?? "",
                input: tc.arguments,
              });
            }

            if (streamState.activeText) {
              controller.enqueue({ type: "text-end", id: "0" });
            }

            // Determine final finish reason
            // Prefer the server value, otherwise fall back to tool-call detection
            const finalFinishReason = streamResponse.getFinishReason();
            if (finalFinishReason) {
              streamState.finishReason = mapFinishReason(finalFinishReason);
            } else if (didEmitAnyToolCalls) {
              streamState.finishReason = {
                unified: "tool-calls",
                raw: undefined,
              };
            }

            // Get final token usage from the SDK aggregate
            const finalUsage = streamResponse.getTokenUsage();
            if (finalUsage) {
              streamState.usage.inputTokens.total = finalUsage.prompt_tokens;
              streamState.usage.inputTokens.noCache = finalUsage.prompt_tokens;
              streamState.usage.outputTokens.total =
                finalUsage.completion_tokens;
              streamState.usage.outputTokens.text =
                finalUsage.completion_tokens;
            }

            controller.enqueue({
              type: "finish",
              finishReason: streamState.finishReason,
              usage: streamState.usage,
            });

            controller.close();
          } catch (error) {
            const aiError = convertToAISDKError(error, {
              operation: "doStream",
              url: "sap-ai:orchestration",
              requestBody: createAISDKRequestBodySummary(options),
            });
            controller.enqueue({
              type: "error",
              error:
                aiError instanceof Error ? aiError : new Error(String(aiError)),
            });
            controller.close();
          }
        },
        cancel(reason) {
          // SAP AI SDK stream auto-closes; log cancellation for debugging
          if (reason) {
            console.debug("SAP AI stream cancelled:", reason);
          }
        },
      });

      return {
        stream: transformedStream,
        request: {
          body: requestBody as unknown,
        },
      };
    } catch (error) {
      throw convertToAISDKError(error, {
        operation: "doStream",
        url: "sap-ai:orchestration",
        requestBody: createAISDKRequestBodySummary(options),
      });
    }
  }
}

/**
 * Maps SAP AI finish reason to Vercel AI SDK finish reason format.
 *
 * @param reason - SAP AI finish reason string
 * @returns Finish reason object with unified and raw values
 * @internal
 */
function mapFinishReason(
  reason: string | undefined,
): LanguageModelV3FinishReason {
  const raw = reason;

  if (!reason) return { unified: "other", raw };

  switch (reason.toLowerCase()) {
    case "stop":
    case "end_turn":
    case "stop_sequence":
    case "eos":
      return { unified: "stop", raw };
    case "length":
    case "max_tokens":
    case "max_tokens_reached":
      return { unified: "length", raw };
    case "tool_calls":
    case "tool_call":
    case "function_call":
      return { unified: "tool-calls", raw };
    case "content_filter":
      return { unified: "content-filter", raw };
    case "error":
      return { unified: "error", raw };
    default:
      return { unified: "other", raw };
  }
}
