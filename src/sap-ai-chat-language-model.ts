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
import {
  DEFAULT_MODEL_VERSION,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  MODEL_PREFIXES,
  MILLISECONDS_PER_SECOND,
} from "./constants";

type SAPAIConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class SAPAIChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2";
  readonly defaultObjectGenerationMode = "json";
  readonly supportsImageUrls = true;
  readonly modelId: SAPAIModelId;
  readonly supportsStructuredOutputs = true;

  private readonly config: SAPAIConfig;
  private readonly settings: SAPAISettings;

  constructor(
    modelId: SAPAIModelId,
    settings: SAPAISettings,
    config: SAPAIConfig,
  ) {
    this.settings = settings;
    this.config = config;
    this.modelId = modelId;
  }

  supportsUrl(url: URL): boolean {
    return url.protocol === "https:";
  }

  get supportedUrls(): Record<string, RegExp[]> {
    return {
      "image/*": [
        /^https:\/\/.*\.(?:png|jpg|jpeg|gif|webp)$/i,
        /^data:image\/.*$/,
      ],
    };
  }

  get provider(): string {
    return this.config.provider;
  }

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
      !this.modelId.startsWith(MODEL_PREFIXES.ANTHROPIC) &&
      !this.modelId.startsWith(MODEL_PREFIXES.CLAUDE) &&
      !this.modelId.startsWith(MODEL_PREFIXES.AMAZON);

    const supportsN = !this.modelId.startsWith(MODEL_PREFIXES.AMAZON);

    const templatingConfig: any = {
      template: convertToSAPMessages(options.prompt),
      defaults: {},
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

    // Only add response_format for models that support it AND when no tools are available
    // (tools require flexible response format for tool calls)
    if (supportsStructuredOutputs && !availableTools?.length) {
      templatingConfig.response_format = {
        type: "json_schema",
        json_schema: {
          name: "chat_completion_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["assistant"] },
              content: { type: "string" },
            },
            required: ["role", "content"],
            additionalProperties: false,
          },
        },
      };
    }

    const args = {
      orchestration_config: {
        stream: streaming,
        module_configurations: {
          llm_module_config: {
            model_name: this.modelId,
            model_version: this.settings.modelVersion ?? DEFAULT_MODEL_VERSION,
            model_params: {
              temperature:
                this.settings.modelParams?.temperature ?? DEFAULT_TEMPERATURE,
              max_tokens:
                this.settings.modelParams?.maxTokens ?? DEFAULT_MAX_TOKENS,
              top_p: this.settings.modelParams?.topP,
              frequency_penalty: this.settings.modelParams?.frequencyPenalty,
              presence_penalty: this.settings.modelParams?.presencePenalty,
              n: supportsN ? (this.settings.modelParams?.n ?? 1) : undefined,
            },
          },
          templating_module_config: templatingConfig,
        },
      },
    };

    return { args, warnings };
  }

  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: LanguageModelV2Content[];
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelV2Usage;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
    warnings: LanguageModelV2CallWarning[];
  }> {
    const { args, warnings } = this.getArgs(options);
    const headers = combineHeaders(
      this.config.headers(),
      options.headers ?? {},
    );

    const { value: response } = await postJsonToApi<
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

    const firstChoice = response.module_results.llm.choices[0];
    const usage = response.module_results.llm.usage;

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
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
      rawCall: {
        rawPrompt: args,
        rawSettings: {},
      },
      warnings,
    };
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
  }> {
    const { args, warnings } = this.getArgs(options, true);
    const body = args;

    const { value: response } = await postJsonToApi({
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

            // Skip chunks that don't have LLM results (e.g., initial templating chunks)
            const llmResult = value.module_results.llm;
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
                  ? new Date(llmResult.created * MILLISECONDS_PER_SECOND)
                  : undefined,
              });
            }

            if (llmResult.usage != null) {
              usage.inputTokens = llmResult.usage.prompt_tokens;
              usage.outputTokens = llmResult.usage.completion_tokens;
              usage.totalTokens = llmResult.usage.total_tokens;
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
