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

type SAPModelParams = LlmModelParams & {
  top_k?: number;
  stop?: string[];
  seed?: number;
  parallel_tool_calls?: boolean;
};

type SAPToolParameters = Record<string, unknown> & {
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

/**
 * Type guard to check if an object is a Zod schema.
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
  readonly specificationVersion = "v2";
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
   * @returns True if the URL protocol is HTTPS or data
   */
  supportsUrl(url: URL): boolean {
    return url.protocol === "https:" || url.protocol === "data:";
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
    const providerOptions =
      (options.providerOptions as { sap?: Partial<SAPAISettings> } | undefined)
        ?.sap ?? {};
    const warnings: LanguageModelV2CallWarning[] = [];

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
                  type: "unsupported-tool",
                  tool,
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
              type: "unsupported-tool",
              tool: tool,
            });
            return null;
          }
        })
        .filter((t): t is ChatCompletionTool => t !== null);
    }

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
      modelParams.n =
        providerOptions.modelParams?.n ?? this.settings.modelParams?.n ?? 1;
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

    // SAP AI SDK only supports toolChoice: 'auto'
    if (options.toolChoice && options.toolChoice.type !== "auto") {
      warnings.push({
        type: "unsupported-setting",
        setting: "toolChoice",
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
    providerMetadata?: Record<string, Record<string, JSONValue>>;
    request: { body?: unknown };
    response: {
      timestamp: Date;
      modelId: string;
      headers?: Record<string, string>;
      body?: unknown;
    };
    warnings: LanguageModelV2CallWarning[];
  }> {
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

      // SAP AI SDK limitation: chatCompletion() does not accept AbortSignal
      const response = await client.chatCompletion(requestBody);
      const responseHeadersRaw = response.rawResponse.headers as
        | Record<string, unknown>
        | undefined;
      const responseHeaders = responseHeadersRaw
        ? Object.fromEntries(
            Object.entries(responseHeadersRaw).flatMap(([key, value]) => {
              if (typeof value === "string") return [[key, value]];
              if (Array.isArray(value)) return [[key, value.join(",")]];
              if (typeof value === "number" || typeof value === "boolean") {
                return [[key, String(value)]];
              }
              return [];
            }),
          )
        : undefined;

      const content: LanguageModelV2Content[] = [];

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
          inputTokens: tokenUsage.prompt_tokens,
          outputTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
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
  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    request?: { body?: unknown };
    response?: { headers?: Record<string, string> };
    warnings: LanguageModelV2CallWarning[];
  }> {
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

      let finishReason: LanguageModelV2FinishReason = "unknown";
      const usage: LanguageModelV2Usage = {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      };

      let isFirstChunk = true;
      let activeText = false;

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

      // `doStream` may discover additional warnings while iterating the upstream
      // stream (e.g. malformed tool-call deltas). Those warnings should be
      // observable on the returned result after stream consumption, without
      // mutating the `stream-start` warnings payload.
      const warningsOut: LanguageModelV2CallWarning[] = [...warningsSnapshot];

      const transformedStream = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          controller.enqueue({
            type: "stream-start",
            warnings: warningsSnapshot,
          });

          try {
            for await (const chunk of sdkStream) {
              if (isFirstChunk) {
                isFirstChunk = false;
                controller.enqueue({
                  type: "response-metadata",
                  modelId,
                  timestamp: new Date(),
                });
              }

              const deltaContent = chunk.getDeltaContent();
              if (
                typeof deltaContent === "string" &&
                deltaContent.length > 0 &&
                finishReason !== "tool-calls"
              ) {
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

              const deltaToolCalls = chunk.getDeltaToolCalls();
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
                finishReason = mapFinishReason(chunkFinishReason);

                if (finishReason === "tool-calls") {
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

                  if (activeText) {
                    controller.enqueue({ type: "text-end", id: "0" });
                    activeText = false;
                  }
                }
              }

              const chunkUsage = chunk.getTokenUsage();
              if (chunkUsage) {
                usage.inputTokens = chunkUsage.prompt_tokens;
                usage.outputTokens = chunkUsage.completion_tokens;
                usage.totalTokens = chunkUsage.total_tokens;
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

            if (activeText) {
              controller.enqueue({ type: "text-end", id: "0" });
            }

            if (didEmitAnyToolCalls) {
              finishReason = "tool-calls";
            }

            const finalUsage = streamResponse.getTokenUsage();
            if (finalUsage) {
              usage.inputTokens = finalUsage.prompt_tokens;
              usage.outputTokens = finalUsage.completion_tokens;
              usage.totalTokens = finalUsage.total_tokens;
            }

            const finalFinishReason = streamResponse.getFinishReason();
            if (finalFinishReason && finishReason !== "tool-calls") {
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
      });

      return {
        stream: transformedStream,
        request: {
          body: requestBody as unknown,
        },
        warnings: warningsOut,
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

function mapFinishReason(
  reason: string | undefined,
): LanguageModelV2FinishReason {
  if (!reason) return "unknown";

  switch (reason.toLowerCase()) {
    case "stop":
    case "end_turn":
    case "stop_sequence":
    case "eos":
      return "stop";
    case "length":
    case "max_tokens":
    case "max_tokens_reached":
      return "length";
    case "tool_calls":
    case "tool_call":
    case "function_call":
      return "tool-calls";
    case "content_filter":
      return "content-filter";
    case "error":
      return "error";
    default:
      return "other";
  }
}
