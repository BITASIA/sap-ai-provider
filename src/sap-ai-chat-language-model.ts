import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";
import {
  OrchestrationClient,
  OrchestrationModuleConfig,
  ChatMessage,
  ChatCompletionTool,
} from "@sap-ai-sdk/orchestration";
import type { LlmModelParams } from "@sap-ai-sdk/orchestration";
import type { Template } from "@sap-ai-sdk/orchestration/dist/client/api/schema/template.js";
import type { HttpDestinationOrFetchOptions } from "@sap-cloud-sdk/connectivity";
import type {
  ResourceGroupConfig,
  DeploymentIdConfig,
} from "@sap-ai-sdk/ai-api/internal.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodSchema } from "zod/v3";
import { convertToSAPMessages } from "./convert-to-sap-messages";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-chat-settings";
import { convertToAISDKError } from "./sap-ai-error";

function createAISDKRequestBodySummary(options: LanguageModelV2CallOptions): {
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
 * Type guard to check if an object is a Zod schema.
 * @internal
 */
type SapModelParams = LlmModelParams & {
  top_k?: number;
  stop?: string[];
  seed?: number;
  parallel_tool_calls?: boolean;
};

type SapResponseFormat = Template["response_format"];

type SapToolParameters = Record<string, unknown> & {
  type: "object";
};

/**
 * Extended function tool type that includes the raw parameters field
 * which may contain a Zod schema in some AI SDK versions.
 * @internal
 */
interface FunctionToolWithParameters extends LanguageModelV2FunctionTool {
  parameters?: unknown;
}

/**
 * Type guard helper to check if an object has a callable 'parse' property.
 * @internal
 */
function hasCallableParse(
  obj: Record<string, unknown>,
): obj is Record<string, unknown> & { parse: (...args: unknown[]) => unknown } {
  return typeof obj.parse === "function";
}

function isZodSchema(obj: unknown): obj is ZodSchema {
  if (obj === null || typeof obj !== "object") {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return "_def" in record && "parse" in record && hasCallableParse(record);
}

/**
 * Build a SapToolParameters object from a schema.
 * Ensures type: "object" is always present as required by SAP AI Core.
 * @internal
 */
function buildSapToolParameters(
  schema: Record<string, unknown>,
): SapToolParameters {
  return {
    type: "object",
    properties: {},
    required: [],
    ...schema,
  };
}

/**
 * Internal configuration for the SAP AI Chat Language Model.
 * @internal
 */
interface SAPAIConfig {
  /** Provider identifier */
  provider: string;
  /** Deployment configuration for SAP AI SDK */
  deploymentConfig: ResourceGroupConfig | DeploymentIdConfig;
  /** Optional custom destination */
  destination?: HttpDestinationOrFetchOptions;
}

/**
 * SAP AI Chat Language Model implementation.
 *
 * This class implements the Vercel AI SDK's `LanguageModelV2` interface,
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
 * @implements {LanguageModelV2}
 */
export class SAPAIChatLanguageModel implements LanguageModelV2 {
  /** AI SDK specification version */
  readonly specificationVersion = "v2";
  /** The model identifier (e.g., 'gpt-4o', 'anthropic--claude-3.5-sonnet') */
  readonly modelId: SAPAIModelId;

  /** Internal configuration */
  private readonly config: SAPAIConfig;
  /** Model-specific settings */
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
   * @returns True if the URL protocol is HTTPS
   */
  supportsUrl(url: URL): boolean {
    return url.protocol === "https:";
  }

  /**
   * Returns supported URL patterns for different content types.
   *
   * @returns Record of content types to regex patterns
   */
  get supportedUrls(): Record<string, RegExp[]> {
    return {
      "image/*": [
        /^https:\/\/.*\.(?:png|jpg|jpeg|gif|webp)$/i,
        /^data:image\/.*$/,
      ],
    };
  }

  /**
   * Gets the provider identifier.
   *
   * @returns The provider name ('sap-ai')
   */
  get provider(): string {
    return this.config.provider;
  }

  /**
   * Builds orchestration module config for SAP AI SDK.
   *
   * @param options - Call options from the AI SDK
   * @returns Object containing orchestration config and warnings
   *
   * @internal
   */
  private buildOrchestrationConfig(options: LanguageModelV2CallOptions): {
    orchestrationConfig: OrchestrationModuleConfig;
    messages: ChatMessage[];
    warnings: LanguageModelV2CallWarning[];
  } {
    const warnings: LanguageModelV2CallWarning[] = [];

    // Convert AI SDK prompt to SAP messages
    const messages = convertToSAPMessages(options.prompt);

    // Get tools - prefer settings.tools if provided (proper JSON Schema),
    // otherwise try to convert from AI SDK tools
    let tools: ChatCompletionTool[] | undefined;

    if (this.settings.tools && this.settings.tools.length > 0) {
      // Use tools from settings (already in SAP format with proper schemas)
      tools = this.settings.tools;
    } else {
      // Extract tools from options and convert
      const availableTools = options.tools;

      tools = availableTools
        ?.map((tool): ChatCompletionTool | null => {
          if (tool.type === "function") {
            // Get the input schema - AI SDK provides this as JSONSchema7
            // But in some cases, it might be a Zod schema or have empty properties
            const inputSchema = tool.inputSchema as
              | Record<string, unknown>
              | undefined;

            // Also check for raw Zod schema in 'parameters' field (AI SDK internal)
            const toolWithParams = tool as FunctionToolWithParameters;

            // Build parameters ensuring type: "object" is always present
            // SAP AI Core requires explicit type: "object" in the schema
            let parameters: SapToolParameters;

            // First, check if there's a Zod schema we need to convert
            if (
              toolWithParams.parameters &&
              isZodSchema(toolWithParams.parameters)
            ) {
              try {
                // Convert Zod schema to JSON Schema
                const jsonSchema = zodToJsonSchema(toolWithParams.parameters, {
                  $refStrategy: "none",
                });
                const schemaRecord = jsonSchema as Record<string, unknown>;
                // Remove $schema property as SAP doesn't need it
                delete schemaRecord.$schema;
                parameters = buildSapToolParameters(schemaRecord);
              } catch {
                warnings.push({
                  type: "unsupported-tool",
                  tool,
                  details:
                    "Failed to convert tool Zod schema to JSON Schema. Falling back to empty object schema.",
                });
                parameters = buildSapToolParameters({});
              }
            } else if (inputSchema && Object.keys(inputSchema).length > 0) {
              // Check if schema has properties (it's a proper object schema)
              const hasProperties =
                inputSchema.properties &&
                typeof inputSchema.properties === "object" &&
                Object.keys(inputSchema.properties).length > 0;

              if (hasProperties) {
                parameters = buildSapToolParameters(inputSchema);
              } else {
                // Schema exists but has no properties - use default empty schema
                parameters = buildSapToolParameters({});
              }
            } else {
              // No schema provided - use default empty schema
              parameters = buildSapToolParameters({});
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
              type: "unsupported-tool",
              tool: tool,
            });
            return null;
          }
        })
        .filter((t): t is ChatCompletionTool => t !== null);
    }

    // Check if model supports certain features
    const supportsN =
      !this.modelId.startsWith("amazon--") &&
      !this.modelId.startsWith("anthropic--");

    // Build model params from options with fallback to settings
    // Options take precedence over settings as per LanguageModelV2 interface
    const modelParams: SapModelParams = {
      max_tokens:
        options.maxOutputTokens ?? this.settings.modelParams?.maxTokens,
      temperature:
        options.temperature ?? this.settings.modelParams?.temperature,
      top_p: options.topP ?? this.settings.modelParams?.topP,
      top_k: options.topK,
      frequency_penalty:
        options.frequencyPenalty ?? this.settings.modelParams?.frequencyPenalty,
      presence_penalty:
        options.presencePenalty ?? this.settings.modelParams?.presencePenalty,
      n: supportsN ? (this.settings.modelParams?.n ?? 1) : undefined,
      parallel_tool_calls: this.settings.modelParams?.parallel_tool_calls,
    };

    // Add stop sequences if provided
    if (options.stopSequences && options.stopSequences.length > 0) {
      modelParams.stop = options.stopSequences;
    }

    // Add seed if provided
    if (options.seed !== undefined) {
      modelParams.seed = options.seed;
    }

    // Warn about unsupported settings
    // SAP AI SDK doesn't support toolChoice other than 'auto'
    if (options.toolChoice && options.toolChoice.type !== "auto") {
      warnings.push({
        type: "unsupported-setting",
        setting: "toolChoice",
        details: `SAP AI SDK does not support toolChoice '${options.toolChoice.type}'. Using default 'auto' behavior.`,
      });
    }

    // Response format (Structured Outputs)
    // SAP AI SDK supports OpenAI-compatible response formats, but schema adherence depends on the underlying model.
    if (options.responseFormat?.type === "json") {
      warnings.push({
        type: "unsupported-setting",
        setting: "responseFormat",
        details:
          "SAP AI SDK forwards JSON mode/Structured Outputs to the underlying model. Schema adherence depends on model support.",
      });
    }

    const responseFormat: SapResponseFormat | undefined =
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

    // Build orchestration config
    const orchestrationConfig: OrchestrationModuleConfig = {
      promptTemplating: {
        model: {
          name: this.modelId,
          version: this.settings.modelVersion ?? "latest",
          params: modelParams,
        },
        prompt: {
          template: [],
          tools: tools && tools.length > 0 ? tools : undefined,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        },
      },
      // Include masking module if provided
      ...(this.settings.masking ? { masking: this.settings.masking } : {}),
      // Include filtering module if provided
      ...(this.settings.filtering
        ? { filtering: this.settings.filtering }
        : {}),
    };

    return { orchestrationConfig, messages, warnings };
  }

  /**
   * Creates an OrchestrationClient instance.
   *
   * @param config - Orchestration module configuration
   * @returns OrchestrationClient instance
   *
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
   * This method implements the `LanguageModelV2.doGenerate` interface,
   * sending a request to SAP AI Core and returning the complete response.
   *
   * **Features:**
   * - Tool calling support
   * - Multi-modal input (text + images)
   * - Data masking (if configured)
   * - Content filtering (if configured)
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
  async doGenerate(options: LanguageModelV2CallOptions) {
    try {
      const { orchestrationConfig, messages, warnings } =
        this.buildOrchestrationConfig(options);

      const client = this.createClient(orchestrationConfig);

      const response = await client.chatCompletion({
        messages,
      });

      const content: LanguageModelV2Content[] = [];

      // Extract text content
      const textContent = response.getContent();
      if (textContent) {
        content.push({
          type: "text",
          text: textContent,
        });
      }

      // Extract tool calls
      const toolCalls = response.getToolCalls();
      if (toolCalls) {
        for (const toolCall of toolCalls) {
          content.push({
            type: "tool-call",
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            // AI SDK expects input as a JSON string, which it parses internally
            input: toolCall.function.arguments,
          });
        }
      }

      // Get usage
      const tokenUsage = response.getTokenUsage();

      // Map finish reason
      const finishReasonRaw = response.getFinishReason();
      const finishReason = mapFinishReason(finishReasonRaw);

      // Build the raw response body for debugging
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
          inputTokens: tokenUsage.prompt_tokens,
          outputTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
        },
        providerMetadata: {
          sap: {
            finishReason: finishReasonRaw ?? "unknown",
          },
        },
        request: {
          body: { config: orchestrationConfig, messages },
        },
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          body: rawResponseBody,
        },
        warnings,
      };
    } catch (error) {
      throw convertToAISDKError(error, {
        operation: "doGenerate",
        requestBody: createAISDKRequestBodySummary(options),
      });
    }
  }

  /**
   * Generates a streaming completion.
   *
   * This method implements the `LanguageModelV2.doStream` interface,
   * sending a streaming request to SAP AI Core and returning a stream of response parts.
   *
   * **Stream Events:**
   * - `stream-start` - Stream initialization
   * - `response-metadata` - Response metadata (model, timestamp)
   * - `text-start` - Text generation starts
   * - `text-delta` - Incremental text chunks
   * - `text-end` - Text generation completes
   * - `tool-call` - Tool call detected
   * - `finish` - Stream completes with usage and finish reason
   * - `error` - Error occurred
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
   * }
   * ```
   */
  async doStream(options: LanguageModelV2CallOptions) {
    try {
      const { orchestrationConfig, messages, warnings } =
        this.buildOrchestrationConfig(options);

      const client = this.createClient(orchestrationConfig);

      const streamResponse = await client.stream(
        { messages },
        options.abortSignal,
        { promptTemplating: { include_usage: true } },
      );

      let finishReason: LanguageModelV2FinishReason = "unknown";
      const usage: LanguageModelV2Usage = {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      };

      let isFirstChunk = true;
      let activeText = false;

      // Track tool calls being built up
      const toolCallsInProgress = new Map<
        number,
        {
          id: string;
          toolName?: string;
          arguments: string;
          didEmitInputStart: boolean;
        }
      >();

      const sdkStream = streamResponse.stream;
      const modelId = this.modelId;

      const transformedStream = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings });

          try {
            for await (const chunk of sdkStream) {
              if (isFirstChunk) {
                isFirstChunk = false;
                controller.enqueue({
                  type: "response-metadata",
                  id: undefined,
                  modelId,
                  timestamp: new Date(),
                });
              }

              // Get delta content
              const deltaContent = chunk.getDeltaContent();
              if (typeof deltaContent === "string" && deltaContent.length > 0) {
                if (!activeText) {
                  controller.enqueue({ type: "text-start", id: "0" });
                  activeText = true;
                }
                controller.enqueue({
                  type: "text-delta",
                  id: "0",
                  delta: deltaContent,
                });
              }

              // Handle tool calls
              const deltaToolCalls = chunk.getDeltaToolCalls();
              if (Array.isArray(deltaToolCalls) && deltaToolCalls.length > 0) {
                for (const toolCallChunk of deltaToolCalls) {
                  const index = toolCallChunk.index;
                  if (typeof index !== "number" || !Number.isFinite(index)) {
                    continue;
                  }

                  // Initialize tool call if new
                  if (!toolCallsInProgress.has(index)) {
                    toolCallsInProgress.set(index, {
                      id: toolCallChunk.id ?? `tool_${String(index)}`,
                      toolName: toolCallChunk.function?.name,
                      arguments: "",
                      didEmitInputStart: false,
                    });
                  }

                  const tc = toolCallsInProgress.get(index);
                  if (!tc) continue;

                  // Update tool call ID if provided
                  if (toolCallChunk.id) {
                    tc.id = toolCallChunk.id;
                  }

                  // Update tool name if provided
                  const nextToolName = toolCallChunk.function?.name;
                  if (
                    typeof nextToolName === "string" &&
                    nextToolName.length > 0
                  ) {
                    tc.toolName = nextToolName;
                  }

                  // Emit tool-input-start only once, and only when name is known
                  if (!tc.didEmitInputStart && tc.toolName) {
                    tc.didEmitInputStart = true;
                    controller.enqueue({
                      type: "tool-input-start",
                      id: tc.id,
                      toolName: tc.toolName,
                    });
                  }

                  // Accumulate arguments; only emit deltas once started
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

              // Check for finish reason
              const chunkFinishReason = chunk.getFinishReason();
              if (chunkFinishReason) {
                finishReason = mapFinishReason(chunkFinishReason);
              }

              // Get usage from chunk
              const chunkUsage = chunk.getTokenUsage();
              if (chunkUsage) {
                usage.inputTokens = chunkUsage.prompt_tokens;
                usage.outputTokens = chunkUsage.completion_tokens;
                usage.totalTokens = chunkUsage.total_tokens;
              }
            }

            // Emit completed tool calls
            const toolCalls = Array.from(toolCallsInProgress.values());
            for (const tc of toolCalls) {
              if (!tc.didEmitInputStart || !tc.toolName) {
                warnings.push({
                  type: "unsupported-tool",
                  tool: {
                    type: "function",
                    name: tc.toolName ?? "unknown",
                    description: "",
                    inputSchema: {
                      type: "object",
                      properties: {},
                      required: [],
                    },
                  },
                  details:
                    "Received tool call delta without a tool name. Dropping tool-call output.",
                });
                continue;
              }

              controller.enqueue({ type: "tool-input-end", id: tc.id });
              controller.enqueue({
                type: "tool-call",
                toolCallId: tc.id,
                toolName: tc.toolName,
                input: tc.arguments,
              });
            }

            if (activeText) {
              controller.enqueue({ type: "text-end", id: "0" });
            }

            // Try to get final usage from stream response
            const finalUsage = streamResponse.getTokenUsage();
            if (finalUsage) {
              usage.inputTokens = finalUsage.prompt_tokens;
              usage.outputTokens = finalUsage.completion_tokens;
              usage.totalTokens = finalUsage.total_tokens;
            }

            // Get final finish reason
            const finalFinishReason = streamResponse.getFinishReason();
            if (finalFinishReason) {
              finishReason = mapFinishReason(finalFinishReason);
            }

            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
            });

            controller.close();
          } catch (error) {
            const aiError = convertToAISDKError(error, {
              operation: "doStream",
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
      });

      return {
        stream: transformedStream,
        request: {
          body: { config: orchestrationConfig, messages },
        },
      };
    } catch (error) {
      throw convertToAISDKError(error, {
        operation: "doStream",
        requestBody: createAISDKRequestBodySummary(options),
      });
    }
  }
}

/**
 * Maps SAP AI Core finish reasons to AI SDK finish reasons.
 */
function mapFinishReason(
  reason: string | undefined,
): LanguageModelV2FinishReason {
  if (!reason) return "unknown";

  switch (reason.toLowerCase()) {
    case "stop":
    case "end_turn":
      return "stop";
    case "length":
    case "max_tokens":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool-calls";
    case "content_filter":
      return "content-filter";
    case "error":
      return "error";
    default:
      // Return 'other' for any unrecognized but valid reason
      // Only return 'unknown' when reason is undefined/empty (handled above)
      return "other";
  }
}
