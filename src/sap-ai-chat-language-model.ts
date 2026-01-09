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
import type { HttpDestinationOrFetchOptions } from "@sap-cloud-sdk/connectivity";
import type {
  ResourceGroupConfig,
  DeploymentIdConfig,
} from "@sap-ai-sdk/ai-api/internal.js";
// Note: zodToJsonSchema and isZodSchema are kept for potential future use
// when AI SDK Zod conversion issues are resolved
import { zodToJsonSchema } from "zod-to-json-schema";
// Import ZodSchema from zod/v3 for zod-to-json-schema
import type { ZodSchema } from "zod/v3";
import { convertToSAPMessages } from "./convert-to-sap-messages";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-chat-settings";
import { convertToAISDKError } from "./sap-ai-error";

/**
 * Type guard to check if an object is a Zod schema.
 * @internal
 */
function isZodSchema(obj: unknown): obj is ZodSchema {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "_def" in obj &&
    "parse" in obj &&
    typeof (obj as { parse: unknown }).parse === "function"
  );
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
  /** Default object generation mode */
  readonly defaultObjectGenerationMode = "json";
  /** Whether the model supports image URLs */
  readonly supportsImageUrls = true;
  /** The model identifier (e.g., 'gpt-4o', 'anthropic--claude-3.5-sonnet') */
  readonly modelId: SAPAIModelId;
  /** Whether the model supports structured outputs */
  readonly supportsStructuredOutputs = true;

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
            const toolWithParams = tool as LanguageModelV2FunctionTool & {
              parameters?: unknown;
            };

            // Build parameters ensuring type: "object" is always present
            // SAP AI Core requires explicit type: "object" in the schema
            let parameters: Record<string, unknown>;

            // First, check if there's a Zod schema we need to convert
            if (
              toolWithParams.parameters &&
              isZodSchema(toolWithParams.parameters)
            ) {
              // Convert Zod schema to JSON Schema
              const jsonSchema = zodToJsonSchema(toolWithParams.parameters, {
                $refStrategy: "none",
              }) as Record<string, unknown>;
              // Remove $schema property as SAP doesn't need it
              delete jsonSchema.$schema;
              parameters = {
                type: "object",
                ...jsonSchema,
              };
            } else if (inputSchema && Object.keys(inputSchema).length > 0) {
              // Check if schema has properties (it's a proper object schema)
              const hasProperties =
                inputSchema.properties &&
                typeof inputSchema.properties === "object" &&
                Object.keys(inputSchema.properties).length > 0;

              if (hasProperties) {
                parameters = {
                  type: "object",
                  ...inputSchema,
                };
              } else {
                // Schema exists but has no properties - use default empty schema
                parameters = {
                  type: "object",
                  properties: {},
                  required: [],
                };
              }
            } else {
              // No schema provided - use default empty schema
              parameters = {
                type: "object",
                properties: {},
                required: [],
              };
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

    // Build orchestration config
    const orchestrationConfig: OrchestrationModuleConfig = {
      promptTemplating: {
        model: {
          name: this.modelId,
          version: this.settings.modelVersion ?? "latest",
          params: {
            max_tokens: this.settings.modelParams?.maxTokens,
            temperature: this.settings.modelParams?.temperature,
            top_p: this.settings.modelParams?.topP,
            frequency_penalty: this.settings.modelParams?.frequencyPenalty,
            presence_penalty: this.settings.modelParams?.presencePenalty,
            n: supportsN ? (this.settings.modelParams?.n ?? 1) : undefined,
          },
        },
        prompt: {
          template: [],
          tools: tools && tools.length > 0 ? tools : undefined,
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
  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: LanguageModelV2Content[];
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelV2Usage;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
    warnings: LanguageModelV2CallWarning[];
  }> {
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

      return {
        content,
        finishReason,
        usage: {
          inputTokens: tokenUsage.prompt_tokens,
          outputTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
        },
        rawCall: {
          rawPrompt: { config: orchestrationConfig, messages },
          rawSettings: {},
        },
        warnings,
      };
    } catch (error) {
      throw convertToAISDKError(error, {
        operation: 'doGenerate',
        requestBody: options,
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
   * @returns Promise resolving to stream and raw call metadata
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
  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
  }> {
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
        { id: string; name: string; arguments: string }
      >();

      const sdkStream = streamResponse.stream;

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
                modelId: undefined,
                timestamp: new Date(),
              });
            }

            // Get delta content
            const deltaContent = chunk.getDeltaContent();
            if (deltaContent) {
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
            if (deltaToolCalls) {
              for (const toolCallChunk of deltaToolCalls) {
                const index = toolCallChunk.index;

                // Initialize tool call if new
                if (!toolCallsInProgress.has(index)) {
                  toolCallsInProgress.set(index, {
                    id: toolCallChunk.id ?? `tool_${String(index)}`,
                    name: toolCallChunk.function?.name ?? "",
                    arguments: "",
                  });

                  // Emit tool-input-start
                  const tc = toolCallsInProgress.get(index);
                  if (!tc) continue;
                  if (toolCallChunk.function?.name) {
                    controller.enqueue({
                      type: "tool-input-start",
                      id: tc.id,
                      toolName: tc.name,
                    });
                  }
                }

                const tc = toolCallsInProgress.get(index);
                if (!tc) continue;

                // Update tool call ID if provided
                if (toolCallChunk.id) {
                  tc.id = toolCallChunk.id;
                }

                // Update function name if provided
                if (toolCallChunk.function?.name) {
                  tc.name = toolCallChunk.function.name;
                }

                // Accumulate arguments
                if (toolCallChunk.function?.arguments) {
                  tc.arguments += toolCallChunk.function.arguments;
                  controller.enqueue({
                    type: "tool-input-delta",
                    id: tc.id,
                    delta: toolCallChunk.function.arguments,
                  });
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
            controller.enqueue({
              type: "tool-input-end",
              id: tc.id,
            });
            controller.enqueue({
              type: "tool-call",
              toolCallId: tc.id,
              toolName: tc.name,
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
            operation: 'doStream',
            requestBody: options,
          });
          controller.enqueue({
            type: "error",
            error: aiError instanceof Error ? aiError : new Error(String(aiError)),
          });
          controller.close();
        }
      },
    });

    return {
      stream: transformedStream,
      rawCall: {
        rawPrompt: { config: orchestrationConfig, messages },
        rawSettings: {},
      },
    };
    } catch (error) {
      throw convertToAISDKError(error, {
        operation: 'doStream',
        requestBody: options,
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
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool-calls";
    case "content_filter":
      return "content-filter";
    default:
      return "unknown";
  }
}
