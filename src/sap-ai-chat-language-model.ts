import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2ProviderDefinedTool,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";
import {
  FetchFunction,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  ParseResult,
  postJsonToApi,
} from "@ai-sdk/provider-utils";
import { z } from "zod";
import { convertToSAPMessages } from "./convert-to-sap-messages";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-chat-settings";
import { sapAIFailedResponseHandler } from "./sap-ai-error";
import {
  sapAIResponseSchema,
  sapAIStreamResponseSchema,
} from "./types/completion-response";

/**
 * Internal configuration for the SAP AI Chat Language Model.
 * @internal
 */
type SAPAIConfig = {
  /** Provider identifier */
  provider: string;
  /** Base URL for API calls */
  baseURL: string;
  /** Function that returns request headers */
  headers: () => Record<string, string | undefined>;
  /** Optional custom fetch implementation */
  fetch?: FetchFunction;
};

/**
 * SAP AI Chat Language Model implementation.
 *
 * This class implements the Vercel AI SDK's `LanguageModelV2` interface,
 * providing a bridge between the AI SDK and SAP AI Core's Orchestration API.
 *
 * **Features:**
 * - Text generation (streaming and non-streaming)
 * - Tool calling (function calling)
 * - Multi-modal input (text + images)
 * - Structured outputs (JSON schema)
 * - Data masking (SAP DPI)
 *
 * **Model Support:**
 * - OpenAI models
 * - Anthropic Claude models
 * - Google Gemini models
 * - Amazon Nova and Titan models
 * - Open source models (Llama, Mistral, etc.)
 *
 * @example
 * ```typescript
 * // Create via provider
 * const provider = await createSAPAIProvider({ serviceKey });
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
  /** The model identifier (e.g., 'gpt-4o', 'claude-3.5-sonnet') */
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
   * @param config - Internal configuration (base URL, headers, etc.)
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
   * Builds request arguments for SAP AI Core API.
   *
   * This private method prepares the request body for both v2 and v1 (legacy) API formats.
   * It handles model-specific capabilities, tool configurations, response formats, and masking.
   *
   * @param options - Call options from the AI SDK
   * @param streaming - Whether this is a streaming request
   * @returns Object containing v2 args, legacy v1 args, and warnings
   *
   * @internal
   */
  private getArgs(
    options: LanguageModelV2CallOptions,
    streaming: boolean = false,
  ) {
    const warnings: LanguageModelV2CallWarning[] = [];

    // Extract tools from mode if available (for tool calling)
    const availableTools = options.tools as
      | Array<LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool>
      | undefined;

    // Check if model supports structured outputs (OpenAI and Gemini models do, Anthropic doesn't)
    const supportsStructuredOutputs =
      !this.modelId.startsWith("anthropic--") &&
      !this.modelId.startsWith("claude-") &&
      !this.modelId.startsWith("amazon--");

    const supportsN = !this.modelId.startsWith("amazon--");

    // Decide response_format first, so we can inline it into templatingPromptConfig
    const explicitResponseFormat =
      (options as any)?.response_format ?? this.settings.responseFormat;
    const resolvedResponseFormat =
      explicitResponseFormat ??
      (availableTools?.length ? undefined : { type: "text" });

    const templatingPromptConfig: any = {
      template: convertToSAPMessages(options.prompt),
      defaults: {},
      ...(resolvedResponseFormat
        ? { response_format: resolvedResponseFormat }
        : {}),
      tools: availableTools
        ?.map((tool) => {
          if (tool.type === "function") {
            const parameters = tool.inputSchema;
            return {
              type: tool.type,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: parameters || {
                  type: "object",
                  properties: {},
                  required: [],
                },
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
        .filter(Boolean),
    };

    // templatingPromptConfig already carries response_format if applicable

    // Only add response_format for models that support it AND when no tools are available
    // (tools require flexible response format for tool calls)
    // Build orchestration v2 body
    const argsV2 = {
      config: {
        modules: {
          // Prompt templating module aggregates prompt + model configuration
          prompt_templating: {
            prompt: templatingPromptConfig,
            model: {
              name: this.modelId,
              params: {
                temperature: this.settings.modelParams?.temperature,
                max_tokens: this.settings.modelParams?.maxTokens,
                top_p: this.settings.modelParams?.topP,
                frequency_penalty: this.settings.modelParams?.frequencyPenalty,
                presence_penalty: this.settings.modelParams?.presencePenalty,
                n: supportsN ? (this.settings.modelParams?.n ?? 1) : undefined,
                parallel_tool_calls:
                  this.settings.modelParams?.parallel_tool_calls,
              },
              version: this.settings.modelVersion ?? "latest",
            },
          },
          // Include masking module if provided by settings (backed by DPI)
          ...(this.settings.masking ? { masking: this.settings.masking } : {}),
        },
        ...(streaming ? { stream: { enabled: true } } : {}),
      },
      // placeholder_values are not used because we pass fully rendered messages
    } as const;

    // Build legacy orchestration v1 body (with orchestration_config)
    const templatingModuleConfigV1: any = {
      template: templatingPromptConfig.template,
      defaults: templatingPromptConfig.defaults,
      tools: templatingPromptConfig.tools,
      response_format: (templatingPromptConfig as any).response_format,
    };

    // response_format is already carried over from templatingPromptConfig

    const argsV1 = {
      orchestration_config: {
        stream: streaming,
        module_configurations: {
          llm_module_config: {
            model_name: this.modelId,
            model_version: this.settings.modelVersion ?? "latest",
            model_params: {
              temperature: this.settings.modelParams?.temperature,
              max_tokens: this.settings.modelParams?.maxTokens,
              top_p: this.settings.modelParams?.topP,
              frequency_penalty: this.settings.modelParams?.frequencyPenalty,
              presence_penalty: this.settings.modelParams?.presencePenalty,
              n: supportsN ? (this.settings.modelParams?.n ?? 1) : undefined,
              parallel_tool_calls:
                this.settings.modelParams?.parallel_tool_calls,
            },
          },
          templating_module_config: templatingModuleConfigV1,
          ...(this.settings.masking
            ? { masking_module_config: this.settings.masking }
            : {}),
        },
      },
    } as const;

    return { args: argsV2, argsLegacy: argsV1, warnings };
  }

  /**
   * Generates a single completion (non-streaming).
   *
   * This method implements the `LanguageModelV2.doGenerate` interface,
   * sending a request to SAP AI Core and returning the complete response.
   *
   * **Features:**
   * - Automatic v2/v1 API fallback
   * - Tool calling support
   * - Multi-modal input (text + images)
   * - Structured outputs (for supported models)
   * - Data masking (if configured)
   *
   * **Model-Specific Behavior:**
   * - Structured outputs: Not supported by Anthropic and Amazon models
   * - Multiple completions (n): Not supported by Amazon models
   * - Parallel tool calls: Full support for OpenAI (can be disable with modelParams.parallel_tool_calls), limited for Gemini
   *
   * @param options - Generation options including prompt, tools, and settings
   * @returns Promise resolving to the generation result with content, usage, and metadata
   *
   * @throws {SAPAIError} When the API request fails
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
    const { args, argsLegacy, warnings } = this.getArgs(options);
    const headers = combineHeaders(
      this.config.headers(),
      options.headers ?? {},
    );

    let response: z.infer<typeof sapAIResponseSchema>;
    try {
      const { value } = await postJsonToApi<
        z.infer<typeof sapAIResponseSchema>
      >({
        url: this.config.baseURL,
        headers,
        body: args,
        failedResponseHandler: sapAIFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          sapAIResponseSchema as any,
        ),
        fetch: this.config.fetch,
        abortSignal: options.abortSignal,
      });
      response = value;
    } catch (error: any) {
      const message = String(error?.message ?? "");

      const requiresLegacy =
        message.includes("orchestration_config") ||
        message.includes("required property");
      if (!requiresLegacy) {
        throw error;
      }
      const { value } = await postJsonToApi<
        z.infer<typeof sapAIResponseSchema>
      >({
        url: this.config.baseURL,
        headers,
        body: argsLegacy,
        failedResponseHandler: sapAIFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          sapAIResponseSchema as any,
        ),
        fetch: this.config.fetch,
        abortSignal: options.abortSignal,
      });
      response = value;
    }

    // Prefer v2 final_result, fall back to intermediate/module_results for backward compatibility
    const llmResult =
      (response as any).final_result ??
      (response as any).intermediate_results?.llm ??
      (response as any).module_results?.llm;

    const firstChoice = llmResult.choices[0];
    const usage = llmResult.usage;

    const content: LanguageModelV2Content[] = [];

    if (firstChoice.message.content) {
      let text: string;
      try {
        const parsed = JSON.parse(firstChoice.message.content);
        text = parsed.content || firstChoice.message.content;
      } catch {
        text = firstChoice.message.content;
      }

      if (text) {
        content.push({
          type: "text",
          text: text,
        });
      }
    }

    if (firstChoice.message.tool_calls) {
      for (const toolCall of firstChoice.message.tool_calls) {
        content.push({
          type: "tool-call",
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolCall.function.arguments,
        });
      }
    }

    return {
      content,
      finishReason: firstChoice.finish_reason as LanguageModelV2FinishReason,
      usage: {
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
      },
      rawCall: {
        rawPrompt: args,
        rawSettings: {},
      },
      warnings,
    };
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
   * **Features:**
   * - Real-time token streaming
   * - Tool call detection in stream
   * - Automatic v2/v1 API fallback
   * - Error handling in stream
   *
   * @param options - Streaming options including prompt, tools, and settings
   * @returns Promise resolving to stream and raw call metadata
   *
   * @throws {SAPAIError} When the initial request fails
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
    const { args, argsLegacy, warnings } = this.getArgs(options, true);
    let body: unknown = args;

    let response: any;
    try {
      const result = await postJsonToApi({
        url: this.config.baseURL,
        headers: combineHeaders(this.config.headers(), options.headers),
        body,
        failedResponseHandler: sapAIFailedResponseHandler,
        successfulResponseHandler: createEventSourceResponseHandler(
          sapAIStreamResponseSchema as any,
        ),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });
      response = result.value as any;
    } catch (error: any) {
      const message = String(error?.message ?? "");
      const requiresLegacy =
        message.includes("orchestration_config") ||
        message.includes("required property");
      if (!requiresLegacy) {
        throw error;
      }
      const result = await postJsonToApi({
        url: this.config.baseURL,
        headers: combineHeaders(this.config.headers(), options.headers),
        body: argsLegacy,
        failedResponseHandler: sapAIFailedResponseHandler,
        successfulResponseHandler: createEventSourceResponseHandler(
          sapAIStreamResponseSchema as any,
        ),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });
      response = result.value as any;
    }

    let finishReason: LanguageModelV2FinishReason = "unknown";
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };

    let isFirstChunk = true;
    let activeText = false;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof sapAIStreamResponseSchema>>,
          LanguageModelV2StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings });
          },

          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }

            const value = chunk.value;

            // Support v2 stream shape; prefer intermediate_results.llm, then final_result, then legacy module_results.llm
            const llmResult =
              (value as any).intermediate_results?.llm ??
              (value as any).final_result ??
              (value as any).module_results?.llm;
            if (!llmResult) {
              return;
            }

            if (isFirstChunk) {
              isFirstChunk = false;

              controller.enqueue({
                type: "response-metadata",
                id: llmResult.id ?? undefined,
                modelId: llmResult.model ?? undefined,
                timestamp: llmResult.created
                  ? new Date(llmResult.created * 1000)
                  : undefined,
              });
            }

            if (llmResult.usage != null) {
              usage.inputTokens = llmResult.usage?.prompt_tokens;
              usage.outputTokens = llmResult.usage?.completion_tokens;
              usage.totalTokens = llmResult.usage?.total_tokens;
            }

            const choice = llmResult.choices[0];
            const delta = choice.delta;

            // Handle text content
            if (delta.content != null && delta.content.length > 0) {
              // Extract text from JSON response if needed
              let textContent: string;
              try {
                const parsed = JSON.parse(delta.content);
                textContent = parsed.content || delta.content;
              } catch {
                textContent = delta.content;
              }

              if (!activeText) {
                controller.enqueue({ type: "text-start", id: "0" });
                activeText = true;
              }

              controller.enqueue({
                type: "text-delta",
                id: "0",
                delta: textContent,
              });
            }

            // Handle tool calls
            if (delta.tool_calls != null) {
              for (const toolCall of delta.tool_calls) {
                const toolCallId = toolCall.id;
                const toolName = toolCall.function.name;
                const input = toolCall.function.arguments;

                controller.enqueue({
                  type: "tool-input-start",
                  id: toolCallId,
                  toolName,
                });

                controller.enqueue({
                  type: "tool-input-delta",
                  id: toolCallId,
                  delta: input,
                });

                controller.enqueue({
                  type: "tool-input-end",
                  id: toolCallId,
                });

                controller.enqueue({
                  type: "tool-call",
                  toolCallId,
                  toolName,
                  input,
                });
              }
            }

            if (choice.finish_reason != null) {
              finishReason =
                choice.finish_reason as LanguageModelV2FinishReason;
            }
          },

          flush(controller) {
            if (activeText) {
              controller.enqueue({ type: "text-end", id: "0" });
            }

            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
            });
          },
        }),
      ),
      rawCall: { rawPrompt: body, rawSettings: {} },
    };
  }
}
