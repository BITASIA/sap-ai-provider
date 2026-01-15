import type { DeploymentIdConfig, ResourceGroupConfig } from "@sap-ai-sdk/ai-api/internal.js";
import type { LlmModelParams } from "@sap-ai-sdk/orchestration";
import type { Template } from "@sap-ai-sdk/orchestration/dist/client/api/schema/template.js";
import type { HttpDestinationOrFetchOptions } from "@sap-cloud-sdk/connectivity";
import type { ZodType } from "zod";

import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3FunctionTool,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  SharedV3Warning,
} from "@ai-sdk/provider";
import {
  ChatCompletionTool,
  ChatMessage,
  OrchestrationClient,
  OrchestrationModuleConfig,
} from "@sap-ai-sdk/orchestration";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Extended function tool type that includes the raw parameters field
 * which may contain a Zod schema in some AI SDK versions.
 *
 * @internal
 */
interface FunctionToolWithParameters extends LanguageModelV3FunctionTool {
  parameters?: unknown;
}

import { convertToSAPMessages } from "./convert-to-sap-messages";
import { convertToAISDKError } from "./sap-ai-error";
import { SAPAIModelId, SAPAISettings } from "./sap-ai-settings";

/**
 * Internal configuration for the SAP AI Chat Language Model.
 * @internal
 */
interface SAPAIConfig {
  deploymentConfig: DeploymentIdConfig | ResourceGroupConfig;
  destination?: HttpDestinationOrFetchOptions;
  provider: string;
}

/**
 * Extended SAP model parameters including additional OpenAI-compatible options
 * beyond the base LlmModelParams from SAP AI SDK.
 *
 * @internal
 */
type SAPModelParams = LlmModelParams & {
  parallel_tool_calls?: boolean;
  seed?: number;
  stop?: string[];
  top_k?: number;
};

type SAPResponseFormat = Template["response_format"];

/**
 * SAP tool parameters with required object type.
 *
 * @internal
 */
type SAPToolParameters = Record<string, unknown> & {
  type: "object";
};

/**
 * Generates unique IDs for stream elements.
 *
 * Uses native `crypto.randomUUID()` to generate RFC 4122-compliant UUIDs,
 * providing cryptographically strong random identifiers with guaranteed uniqueness.
 *
 * @internal
 */
class StreamIdGenerator {
  /**
   * Generates a unique ID for a text block.
   *
   * @returns RFC 4122-compliant UUID string
   */
  generateTextBlockId(): string {
    return crypto.randomUUID();
  }
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
 * @see {@link https://sdk.vercel.ai/docs/ai-sdk-core/language-model-v3 Vercel AI SDK LanguageModelV3}
 * @see {@link https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/orchestration SAP AI Core Orchestration}
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
export class SAPAILanguageModel implements LanguageModelV3 {
  readonly modelId: SAPAIModelId;
  readonly specificationVersion = "v3";

  /**
   * Model capabilities.
   *
   * These defaults assume “modern” model behavior to avoid maintaining a
   * per-model capability matrix. If a deployment doesn't support a feature,
   * SAP AI Core will fail the request at runtime.
   */
  readonly supportsImageUrls: boolean = true;
  /** Multiple completions via the `n` parameter (provider-specific support). */
  readonly supportsMultipleCompletions: boolean = true;

  /** Parallel tool calls. */
  readonly supportsParallelToolCalls: boolean = true;

  /** Streaming responses. */
  readonly supportsStreaming: boolean = true;

  /** Structured JSON outputs (json_schema response format). */
  readonly supportsStructuredOutputs: boolean = true;

  /** Tool/function calling. */
  readonly supportsToolCalls: boolean = true;

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
   * Returns supported URL patterns for different content types.
   *
   * @returns Record of content types to regex patterns
   */
  get supportedUrls(): Record<string, RegExp[]> {
    return {
      "image/*": [/^https:\/\/.+$/i, /^data:image\/.*$/],
    };
  }

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
  constructor(modelId: SAPAIModelId, settings: SAPAISettings, config: SAPAIConfig) {
    this.settings = settings;
    this.config = config;
    this.modelId = modelId;
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
  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    try {
      const { messages, orchestrationConfig, warnings } = this.buildOrchestrationConfig(options);

      const client = this.createClient(orchestrationConfig);

      const promptTemplating = orchestrationConfig.promptTemplating as unknown as {
        prompt: { response_format?: unknown; tools?: unknown };
      };

      const requestBody = {
        messages,
        model: {
          ...orchestrationConfig.promptTemplating.model,
        },
        ...(promptTemplating.prompt.tools ? { tools: promptTemplating.prompt.tools } : {}),
        ...(promptTemplating.prompt.response_format
          ? { response_format: promptTemplating.prompt.response_format }
          : {}),
        ...(() => {
          const masking = orchestrationConfig.masking;
          return masking && Object.keys(masking).length > 0 ? { masking } : {};
        })(),
        ...(() => {
          const filtering = orchestrationConfig.filtering;
          return filtering && Object.keys(filtering).length > 0 ? { filtering } : {};
        })(),
        ...(() => {
          const grounding = orchestrationConfig.grounding;
          return grounding && Object.keys(grounding).length > 0 ? { grounding } : {};
        })(),
        ...(() => {
          const translation = orchestrationConfig.translation;
          return translation && Object.keys(translation).length > 0 ? { translation } : {};
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
          text: textContent,
          type: "text",
        });
      }

      const toolCalls = response.getToolCalls();
      if (toolCalls) {
        for (const toolCall of toolCalls) {
          content.push({
            input: toolCall.function.arguments,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            type: "tool-call",
          });
        }
      }

      const tokenUsage = response.getTokenUsage();

      const finishReasonRaw = response.getFinishReason();
      const finishReason = mapFinishReason(finishReasonRaw);

      const rawResponseBody = {
        content: textContent,
        finishReason: finishReasonRaw,
        tokenUsage,
        toolCalls,
      };

      return {
        content,
        finishReason,
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
          body: rawResponseBody,
          headers: responseHeaders,
          modelId: this.modelId,
          timestamp: new Date(),
        },
        usage: {
          inputTokens: {
            cacheRead: undefined,
            cacheWrite: undefined,
            noCache: tokenUsage.prompt_tokens,
            total: tokenUsage.prompt_tokens,
          },
          outputTokens: {
            reasoning: undefined,
            text: tokenUsage.completion_tokens,
            total: tokenUsage.completion_tokens,
          },
        },
        warnings,
      };
    } catch (error) {
      throw convertToAISDKError(error, {
        operation: "doGenerate",
        requestBody: createAISDKRequestBodySummary(options),
        url: "sap-ai:orchestration",
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
   * @see {@link https://sdk.vercel.ai/docs/ai-sdk-core/streaming Vercel AI SDK Streaming}
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
  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    try {
      const { messages, orchestrationConfig, warnings } = this.buildOrchestrationConfig(options);

      const client = this.createClient(orchestrationConfig);

      const promptTemplating = orchestrationConfig.promptTemplating as unknown as {
        prompt: { response_format?: unknown; tools?: unknown };
      };

      const requestBody = {
        messages,
        model: {
          ...orchestrationConfig.promptTemplating.model,
        },
        ...(promptTemplating.prompt.tools ? { tools: promptTemplating.prompt.tools } : {}),
        ...(promptTemplating.prompt.response_format
          ? { response_format: promptTemplating.prompt.response_format }
          : {}),
        ...(() => {
          const masking = orchestrationConfig.masking;
          return masking && Object.keys(masking).length > 0 ? { masking } : {};
        })(),
        ...(() => {
          const filtering = orchestrationConfig.filtering;
          return filtering && Object.keys(filtering).length > 0 ? { filtering } : {};
        })(),
      };

      const streamResponse = await client.stream(requestBody, options.abortSignal, {
        promptTemplating: { include_usage: true },
      });

      // Generate unique ID for text blocks in this stream
      const idGenerator = new StreamIdGenerator();
      let textBlockId: null | string = null;

      // Track stream state in one place to keep updates consistent
      const streamState = {
        activeText: false,
        finishReason: {
          raw: undefined,
          unified: "other" as const,
        } as LanguageModelV3FinishReason,
        isFirstChunk: true,
        usage: {
          inputTokens: {
            cacheRead: undefined,
            cacheWrite: undefined,
            noCache: undefined as number | undefined,
            total: undefined as number | undefined,
          },
          outputTokens: {
            reasoning: undefined,
            text: undefined as number | undefined,
            total: undefined as number | undefined,
          },
        },
      };

      const toolCallsInProgress = new Map<
        number,
        {
          arguments: string;
          didEmitCall: boolean;
          didEmitInputStart: boolean;
          id: string;
          toolName?: string;
        }
      >();

      const sdkStream = streamResponse.stream;
      const modelId = this.modelId;

      const warningsSnapshot = [...warnings];

      // Warnings may be discovered while consuming the upstream stream
      // Expose them on the final result without mutating stream-start
      const warningsOut: SharedV3Warning[] = [...warningsSnapshot];

      const transformedStream = new ReadableStream<LanguageModelV3StreamPart>({
        cancel(reason) {
          // SAP AI SDK stream auto-closes; log cancellation for debugging
          if (reason) {
            console.debug("SAP AI stream cancelled:", reason);
          }
        },
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
                  modelId,
                  timestamp: new Date(),
                  type: "response-metadata",
                });
              }

              const deltaToolCalls = chunk.getDeltaToolCalls();
              if (Array.isArray(deltaToolCalls) && deltaToolCalls.length > 0) {
                // Once tool call deltas appear, stop emitting text deltas
                streamState.finishReason = {
                  raw: undefined,
                  unified: "tool-calls",
                };
              }

              const deltaContent = chunk.getDeltaContent();
              if (
                typeof deltaContent === "string" &&
                deltaContent.length > 0 &&
                streamState.finishReason.unified !== "tool-calls"
              ) {
                if (!streamState.activeText) {
                  textBlockId = idGenerator.generateTextBlockId();
                  controller.enqueue({ id: textBlockId, type: "text-start" });
                  streamState.activeText = true;
                }
                if (textBlockId) {
                  controller.enqueue({
                    delta: deltaContent,
                    id: textBlockId,
                    type: "text-delta",
                  });
                }
              }

              if (Array.isArray(deltaToolCalls) && deltaToolCalls.length > 0) {
                for (const toolCallChunk of deltaToolCalls) {
                  const index = toolCallChunk.index;
                  if (typeof index !== "number" || !Number.isFinite(index)) {
                    continue;
                  }

                  if (!toolCallsInProgress.has(index)) {
                    toolCallsInProgress.set(index, {
                      arguments: "",
                      didEmitCall: false,
                      didEmitInputStart: false,
                      id: toolCallChunk.id ?? `tool_${String(index)}`,
                      toolName: toolCallChunk.function?.name,
                    });
                  }

                  const tc = toolCallsInProgress.get(index);
                  if (!tc) continue;

                  if (toolCallChunk.id) {
                    tc.id = toolCallChunk.id;
                  }

                  const nextToolName = toolCallChunk.function?.name;
                  if (typeof nextToolName === "string" && nextToolName.length > 0) {
                    tc.toolName = nextToolName;
                  }

                  if (!tc.didEmitInputStart && tc.toolName) {
                    tc.didEmitInputStart = true;
                    controller.enqueue({
                      id: tc.id,
                      toolName: tc.toolName,
                      type: "tool-input-start",
                    });
                  }

                  const argumentsDelta = toolCallChunk.function?.arguments;
                  if (typeof argumentsDelta === "string" && argumentsDelta.length > 0) {
                    tc.arguments += argumentsDelta;

                    if (tc.didEmitInputStart) {
                      controller.enqueue({
                        delta: argumentsDelta,
                        id: tc.id,
                        type: "tool-input-delta",
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
                        id: tc.id,
                        toolName: tc.toolName ?? "",
                        type: "tool-input-start",
                      });
                    }

                    if (!tc.toolName) {
                      warningsOut.push({
                        message:
                          "Received tool-call delta without a tool name. Emitting tool-call with an empty tool name.",
                        type: "other",
                      });
                    }

                    tc.didEmitCall = true;
                    controller.enqueue({ id: tc.id, type: "tool-input-end" });
                    controller.enqueue({
                      input: tc.arguments,
                      toolCallId: tc.id,
                      toolName: tc.toolName ?? "",
                      type: "tool-call",
                    });
                  }

                  if (streamState.activeText && textBlockId) {
                    controller.enqueue({ id: textBlockId, type: "text-end" });
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
                  id: tc.id,
                  toolName: tc.toolName ?? "",
                  type: "tool-input-start",
                });
              }

              if (!tc.toolName) {
                warningsOut.push({
                  message:
                    "Received tool-call delta without a tool name. Emitting tool-call with an empty tool name.",
                  type: "other",
                });
              }

              didEmitAnyToolCalls = true;
              tc.didEmitCall = true;
              controller.enqueue({ id: tc.id, type: "tool-input-end" });
              controller.enqueue({
                input: tc.arguments,
                toolCallId: tc.id,
                toolName: tc.toolName ?? "",
                type: "tool-call",
              });
            }

            if (streamState.activeText && textBlockId) {
              controller.enqueue({ id: textBlockId, type: "text-end" });
            }

            // Determine final finish reason
            // Prefer the server value, otherwise fall back to tool-call detection
            const finalFinishReason = streamResponse.getFinishReason();
            if (finalFinishReason) {
              streamState.finishReason = mapFinishReason(finalFinishReason);
            } else if (didEmitAnyToolCalls) {
              streamState.finishReason = {
                raw: undefined,
                unified: "tool-calls",
              };
            }

            // Get final token usage from the SDK aggregate
            const finalUsage = streamResponse.getTokenUsage();
            if (finalUsage) {
              streamState.usage.inputTokens.total = finalUsage.prompt_tokens;
              streamState.usage.inputTokens.noCache = finalUsage.prompt_tokens;
              streamState.usage.outputTokens.total = finalUsage.completion_tokens;
              streamState.usage.outputTokens.text = finalUsage.completion_tokens;
            }

            controller.enqueue({
              finishReason: streamState.finishReason,
              type: "finish",
              usage: streamState.usage,
            });

            controller.close();
          } catch (error) {
            const aiError = convertToAISDKError(error, {
              operation: "doStream",
              requestBody: createAISDKRequestBodySummary(options),
              url: "sap-ai:orchestration",
            });
            controller.enqueue({
              error: aiError instanceof Error ? aiError : new Error(String(aiError)),
              type: "error",
            });
            controller.close();
          }
        },
      });

      return {
        request: {
          body: requestBody as unknown,
        },
        stream: transformedStream,
      };
    } catch (error) {
      throw convertToAISDKError(error, {
        operation: "doStream",
        requestBody: createAISDKRequestBodySummary(options),
        url: "sap-ai:orchestration",
      });
    }
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
   * Builds orchestration module config for SAP AI SDK.
   *
   * @param options - Call options from the AI SDK
   * @returns Object containing orchestration config, messages, and warnings
   * @internal
   */
  private buildOrchestrationConfig(options: LanguageModelV3CallOptions): {
    messages: ChatMessage[];
    orchestrationConfig: OrchestrationModuleConfig;
    warnings: SharedV3Warning[];
  } {
    const providerOptions =
      (options.providerOptions as undefined | { sap?: Partial<SAPAISettings> })?.sap ?? {};
    const warnings: SharedV3Warning[] = [];

    const messages = convertToSAPMessages(options.prompt, {
      includeReasoning: providerOptions.includeReasoning ?? this.settings.includeReasoning ?? false,
    });

    // AI SDK convention: options.tools override provider/model defaults
    let tools: ChatCompletionTool[] | undefined;

    const settingsTools = providerOptions.tools ?? this.settings.tools;
    const optionsTools = options.tools;

    const shouldUseSettingsTools =
      settingsTools && settingsTools.length > 0 && (!optionsTools || optionsTools.length === 0);

    const shouldUseOptionsTools = !!(optionsTools && optionsTools.length > 0);

    if (settingsTools && settingsTools.length > 0 && optionsTools && optionsTools.length > 0) {
      warnings.push({
        message:
          "Both settings.tools and call options.tools were provided; preferring call options.tools.",
        type: "other",
      });
    }

    if (shouldUseSettingsTools) {
      tools = settingsTools;
    } else {
      const availableTools = shouldUseOptionsTools ? optionsTools : undefined;

      tools = availableTools
        ?.map((tool): ChatCompletionTool | null => {
          if (tool.type === "function") {
            const inputSchema = tool.inputSchema as Record<string, unknown> | undefined;

            // AI SDK may pass Zod schemas in 'parameters' field (internal detail)
            const toolWithParams = tool as FunctionToolWithParameters;

            let parameters: SAPToolParameters;

            if (toolWithParams.parameters && isZodSchema(toolWithParams.parameters)) {
              try {
                const jsonSchema = zodToJsonSchema(toolWithParams.parameters as never, {
                  $refStrategy: "none",
                });
                const schemaRecord = jsonSchema as Record<string, unknown>;
                delete schemaRecord.$schema;
                parameters = buildSAPToolParameters(schemaRecord);
              } catch (error) {
                warnings.push({
                  details: `Failed to convert tool Zod schema: ${error instanceof Error ? error.message : String(error)}. Falling back to empty object schema.`,
                  feature: `tool schema conversion for ${tool.name}`,
                  type: "unsupported",
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
              function: {
                description: tool.description,
                name: tool.name,
                parameters,
              },
              type: "function",
            };
          } else {
            warnings.push({
              details: "Only 'function' tool type is supported.",
              feature: `tool type for ${tool.name}`,
              type: "unsupported",
            });
            return null;
          }
        })
        .filter((t): t is ChatCompletionTool => t !== null);
    }

    // Amazon Bedrock and Anthropic models don't support the 'n' parameter
    // Only set n when explicitly provided to avoid overriding API defaults
    const supportsN =
      !this.modelId.startsWith("amazon--") && !this.modelId.startsWith("anthropic--");

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
      options.topP ?? providerOptions.modelParams?.topP ?? this.settings.modelParams?.topP;
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
      const nValue = providerOptions.modelParams?.n ?? this.settings.modelParams?.n;
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
        frequencyPenalty,
        maxTokens,
        n: modelParams.n,
        presencePenalty,
        temperature,
        topP,
      },
      warnings,
    );

    // SAP AI SDK only supports toolChoice: 'auto'
    if (options.toolChoice && options.toolChoice.type !== "auto") {
      warnings.push({
        details: `SAP AI SDK does not support toolChoice '${options.toolChoice.type}'. Using default 'auto' behavior.`,
        feature: "toolChoice",
        type: "unsupported",
      });
    }

    // Forward JSON mode to model; support varies by deployment
    if (options.responseFormat?.type === "json") {
      warnings.push({
        message:
          "responseFormat JSON mode is forwarded to the underlying model; support and schema adherence depend on the model/deployment.",
        type: "other",
      });
    }

    const responseFormat: SAPResponseFormat | undefined =
      options.responseFormat?.type === "json"
        ? options.responseFormat.schema
          ? {
              json_schema: {
                description: options.responseFormat.description,
                name: options.responseFormat.name ?? "response",
                schema: options.responseFormat.schema as Record<string, unknown>,
                strict: null,
              },
              type: "json_schema" as const,
            }
          : { type: "json_object" as const }
        : undefined;

    const orchestrationConfig: OrchestrationModuleConfig = {
      promptTemplating: {
        model: {
          name: this.modelId,
          params: modelParams,
          version: providerOptions.modelVersion ?? this.settings.modelVersion ?? "latest",
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
        return filtering && Object.keys(filtering).length > 0 ? { filtering } : {};
      })(),
      ...(() => {
        const grounding = providerOptions.grounding ?? this.settings.grounding;
        return grounding && Object.keys(grounding).length > 0 ? { grounding } : {};
      })(),
      ...(() => {
        const translation = providerOptions.translation ?? this.settings.translation;
        return translation && Object.keys(translation).length > 0 ? { translation } : {};
      })(),
    };

    return { messages, orchestrationConfig, warnings };
  }

  /**
   * Creates an OrchestrationClient instance.
   *
   * @param config - Orchestration module configuration
   * @returns OrchestrationClient instance
   * @internal
   */
  private createClient(config: OrchestrationModuleConfig): OrchestrationClient {
    return new OrchestrationClient(config, this.config.deploymentConfig, this.config.destination);
  }
}

/**
 * Build a SAPToolParameters object from a schema.
 * Ensures type: "object" is always present as required by SAP AI Core.
 *
 * @param schema - Input schema to convert
 * @returns SAPToolParameters with type: "object"
 * @internal
 */
function buildSAPToolParameters(schema: Record<string, unknown>): SAPToolParameters {
  const schemaType = schema.type;

  if (schemaType !== undefined && schemaType !== "object") {
    return {
      properties: {},
      required: [],
      type: "object",
    };
  }

  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, unknown>)
      : {};

  const required =
    Array.isArray(schema.required) && schema.required.every((item) => typeof item === "string")
      ? schema.required
      : [];

  const additionalFields = Object.fromEntries(
    Object.entries(schema).filter(
      ([key]) => key !== "type" && key !== "properties" && key !== "required",
    ),
  );

  return {
    properties,
    required,
    type: "object",
    ...additionalFields,
  };
}

/**
 * Creates a summary of the AI SDK request body for error reporting.
 * @internal
 */
function createAISDKRequestBodySummary(options: LanguageModelV3CallOptions): {
  hasImageParts: boolean;
  maxOutputTokens?: number;
  promptMessages: number;
  responseFormatType?: string;
  seed?: number;
  stopSequences?: number;
  temperature?: number;
  toolChoiceType?: string;
  tools: number;
  topK?: number;
  topP?: number;
} {
  return {
    hasImageParts: options.prompt.some(
      (message) =>
        message.role === "user" &&
        message.content.some((part) => part.type === "file" && part.mediaType.startsWith("image/")),
    ),
    maxOutputTokens: options.maxOutputTokens,
    promptMessages: options.prompt.length,
    responseFormatType: options.responseFormat?.type,
    seed: options.seed,
    stopSequences: options.stopSequences?.length,
    temperature: options.temperature,
    toolChoiceType: options.toolChoice?.type,
    tools: options.tools?.length ?? 0,
    topK: options.topK,
    topP: options.topP,
  };
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
 * Maps SAP AI finish reason to Vercel AI SDK finish reason format.
 *
 * @param reason - SAP AI finish reason string
 * @returns Finish reason object with unified and raw values
 * @internal
 */
function mapFinishReason(reason: string | undefined): LanguageModelV3FinishReason {
  const raw = reason;

  if (!reason) return { raw, unified: "other" };

  switch (reason.toLowerCase()) {
    case "content_filter":
      return { raw, unified: "content-filter" };
    case "end_turn":
    case "eos":
    case "stop":
    case "stop_sequence":
      return { raw, unified: "stop" };
    case "error":
      return { raw, unified: "error" };
    case "function_call":
    case "tool_call":
    case "tool_calls":
      return { raw, unified: "tool-calls" };
    case "length":
    case "max_tokens":
    case "max_tokens_reached":
      return { raw, unified: "length" };
    default:
      return { raw, unified: "other" };
  }
}

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
    frequencyPenalty?: number;
    maxTokens?: number;
    n?: number;
    presencePenalty?: number;
    temperature?: number;
    topP?: number;
  },
  warnings: SharedV3Warning[],
): void {
  // Heuristic range checks (provider/model-specific constraints may differ).
  if (params.temperature !== undefined && (params.temperature < 0 || params.temperature > 2)) {
    warnings.push({
      message: `temperature=${String(params.temperature)} is outside typical range [0, 2]. The API may reject this value.`,
      type: "other",
    });
  }

  if (params.topP !== undefined && (params.topP < 0 || params.topP > 1)) {
    warnings.push({
      message: `topP=${String(params.topP)} is outside valid range [0, 1]. The API may reject this value.`,
      type: "other",
    });
  }

  if (
    params.frequencyPenalty !== undefined &&
    (params.frequencyPenalty < -2 || params.frequencyPenalty > 2)
  ) {
    warnings.push({
      message: `frequencyPenalty=${String(params.frequencyPenalty)} is outside typical range [-2, 2]. The API may reject this value.`,
      type: "other",
    });
  }

  if (
    params.presencePenalty !== undefined &&
    (params.presencePenalty < -2 || params.presencePenalty > 2)
  ) {
    warnings.push({
      message: `presencePenalty=${String(params.presencePenalty)} is outside typical range [-2, 2]. The API may reject this value.`,
      type: "other",
    });
  }

  if (params.maxTokens !== undefined && params.maxTokens <= 0) {
    warnings.push({
      message: `maxTokens=${String(params.maxTokens)} must be positive. The API will likely reject this value.`,
      type: "other",
    });
  }

  if (params.n !== undefined && params.n <= 0) {
    warnings.push({
      message: `n=${String(params.n)} must be positive. The API will likely reject this value.`,
      type: "other",
    });
  }
}
