import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage
} from '@ai-sdk/provider';
import {
  FetchFunction,
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi
} from '@ai-sdk/provider-utils';
import { convertToSAPMessages } from './convert-to-sap-messages';
import { SAPAIModelId, SAPAISettings } from './sap-ai-chat-settings';
import { sapAIFailedResponseHandler } from './sap-ai-error';
import { sapAIResponseSchema } from './types/completion-response';

type SAPAIConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: FetchFunction;
};

export class SAPAIChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly defaultObjectGenerationMode = 'json';
  readonly supportsImageUrls = true;
  readonly modelId: SAPAIModelId;
  readonly supportsStructuredOutputs = true;

  private readonly config: SAPAIConfig;
  private readonly settings: SAPAISettings;

  constructor(modelId: SAPAIModelId, settings: SAPAISettings, config: SAPAIConfig) {
    this.settings = settings;
    this.config = config;
    this.modelId = modelId;
  }

  // supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>>;

  // supportsUrl(url: URL): boolean {
  //   return url.protocol === 'https:';
  // }
  get supportedUrls(): Record<string, RegExp[]> {
    return {
      'image/*': [
        /^https:\/\/.*\.(?:png|jpg|jpeg|gif|webp)$/i,
        /^data:image\/.*$/,
      ],
    };
  }

  get provider(): string {
    return this.config.provider;
  }

  private getArgs(options: LanguageModelV2CallOptions, streaming: boolean = false) {
    const warnings: LanguageModelV2CallWarning[] = [];
    // Extract tools from mode if available (for tool calling)
    let availableTools: any[] | undefined;

    // Check different mode types that might contain tools
    // const mode = options.mode as any;
    // if (mode?.type === 'object-tool' && mode?.tools) {
    //   availableTools = mode.tools;
    // } else if (mode?.type === 'regular' && mode?.tools) {
    //   availableTools = mode.tools;
    // } else if (mode?.tools) {
    //   availableTools = mode.tools;
    // }
    availableTools = options.tools;

    // Check if model supports structured outputs (OpenAI and Gemini models do, Anthropic doesn't)
    const supportsStructuredOutputs = !this.modelId.startsWith('anthropic--') &&
      !this.modelId.startsWith('claude-');

    const templatingConfig: any = {
      template: convertToSAPMessages(options.prompt),
      defaults: {},
      tools: availableTools?.map(tool => {
        if (tool.type === 'function') {
          return {
            type: tool.type,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            }
          };
        }
        // else {
        //   console.warn('Unexpected tool structure:', tool);
        //   return null;
        // }
        warnings.push({
          type: 'unsupported-tool',
          tool: tool,
        });
        return null;
      }).filter(Boolean) // Remove null entries
    };

    // Only add response_format for models that support it AND when no tools are available
    // (tools require flexible response format for tool calls)
    if (supportsStructuredOutputs && !availableTools?.length) {
      templatingConfig.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'chat_completion_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['assistant'] },
              content: { type: 'string' }
            },
            required: ['role', 'content'],
            additionalProperties: false
          }
        }
      };
    }

    const args = {
      orchestration_config: {
        stream: streaming,
        stream_options: streaming ? {
          include_usage: true
        } : undefined,
        module_configurations: {
          llm_module_config: {
            model_name: this.modelId,
            model_version: this.settings.modelVersion ?? 'latest',
            model_params: {
              temperature: options.temperature ?? this.settings.modelParams?.temperature ?? 0.7,
              max_tokens: options.maxOutputTokens ?? this.settings.modelParams?.maxTokens ?? 1000,
              top_p: options.topP ?? this.settings.modelParams?.topP,
              frequency_penalty: options.frequencyPenalty ?? this.settings.modelParams?.frequencyPenalty,
              presence_penalty: options.presencePenalty ?? this.settings.modelParams?.presencePenalty,
              stop: options.stopSequences,
              n: this.settings.modelParams?.n ?? 1
            }
          },
          templating_module_config: templatingConfig
        }
      }
    };

    return { args, warnings };
  }

  async doGenerate(
    options: LanguageModelV2CallOptions,
  ): Promise<{
    content: LanguageModelV2Content[];
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelV2Usage;
    response: { body: unknown; }
    warnings: LanguageModelV2CallWarning[];
  }> {
    const { args, warnings } = this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.baseURL,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: sapAIFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        sapAIResponseSchema as any,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { module_results } = response as any;
    const firstChoice = module_results.llm.choices[0];
    const usage = module_results.llm.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Build content array for V2 format
    const content: LanguageModelV2Content[] = [];

    // Add text content if present
    if (firstChoice.message.content && typeof firstChoice.message.content === 'string') {
      content.push({
        type: 'text',
        text: firstChoice.message.content,
      });
    }

    // Add tool calls to content if present
    if (firstChoice.message.tool_calls) {
      for (const toolCall of firstChoice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolCall.function.arguments, // Keep as string - AI SDK will parse it
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
      response: {
        body: response,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV2CallOptions,
  ): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    //rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
    warnings: LanguageModelV2CallWarning[];
  }> {
    const { args, warnings } = this.getArgs(options, true);

    args.orchestration_config.stream = true;
    args.orchestration_config.stream_options = { include_usage: true };

    //const headers = combineHeaders(this.config.headers(), options.headers ?? {});

    // Try streaming first, fallback to non-streaming if not supported
    try {
      const response = await fetch(this.config.baseURL, {
        method: 'POST',
        headers: {
          //...headers,
          ...this.config.headers(),
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(args),
        signal: options.abortSignal,
      });

      if (!response.ok) {
        // throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        throw await sapAIFailedResponseHandler(response).parseError();
      }

      const stream = this.createStreamFromSSE(response, warnings);

      return { stream, warnings };
    } catch (error) {
      throw error;
    }
  }


    //   const contentType = response.headers.get('content-type') || '';

    //   // Check if response is actually streaming (Server-Sent Events)
    //   if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
    //     return {
    //       stream: this.createStreamFromSSE(response),
    //       // rawCall: { rawPrompt: args, rawSettings: {} },
    //       warnings,
    //     };
    //   }
    // } catch (error) {
    //   console.warn('Streaming not supported, falling back to non-streaming:', error);
    // }

    // Fallback to non-streaming implementation
  //   const response = await this.doGenerate(options);

  //   return {
  //     stream: new ReadableStream({
  //       start(controller) {
  //         // Simulate streaming by sending the text character by character
  //         const text = response.text;
  //         let index = 0;

  //         const sendNext = () => {
  //           if (index < text.length) {
  //             const chunk = text.slice(index, index + 10); // Send 10 chars at a time
  //             controller.enqueue({
  //               type: 'text-delta',
  //               textDelta: chunk,
  //             });
  //             index += 10;
  //             setTimeout(sendNext, 10); // Small delay to simulate streaming
  //           } else {
  //             if (response.toolCalls) {
  //               for (const toolCall of response.toolCalls) {
  //                 controller.enqueue({
  //                   type: 'tool-call',
  //                   toolCallType: toolCall.toolCallType,
  //                   toolCallId: toolCall.toolCallId,
  //                   toolName: toolCall.toolName,
  //                   args: toolCall.args,
  //                 });
  //               }
  //             }

  //             controller.enqueue({
  //               type: 'finish',
  //               finishReason: response.finishReason,
  //               usage: response.usage,
  //             });
  //             controller.close();
  //           }
  //         };

  //         sendNext();
  //       },
  //     }),
  //     rawCall: response.rawCall,
  //   };
  // }

  private createStreamFromSSE(response: Response, warnings: LanguageModelV2CallWarning[]): ReadableStream<LanguageModelV2StreamPart> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    return new ReadableStream({
      start: async (controller) => {
        controller.enqueue({
          type: 'stream-start',
          warnings,
        });

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed === '' || trimmed === 'data: [DONE]') continue;

              if (trimmed.startsWith('data: ')) {
                try {
                  const data = JSON.parse(trimmed.slice(6));

                  // Handle different types of streaming data
                  if (data.choices && data.choices[0]) {
                    const choice = data.choices[0];

                    if (choice.delta?.content) {
                      // Extract text from JSON response if needed
                      let textContent: string;
                      try {
                        const parsed = JSON.parse(choice.delta.content);
                        textContent = parsed.content || choice.delta.content;
                      } catch {
                        textContent = choice.delta.content;
                      }

                      controller.enqueue({
                        // type: 'text-delta',
                        // textDelta: textContent,
                        type: 'text-delta',
                        id: this.config.generateId(),
                        delta: textContent,
                      });
                    }

                    if (choice.delta?.tool_calls) {
                      for (const toolCall of choice.delta.tool_calls) {
                        if (toolCall.function?.arguments && toolCall.id) {
                          controller.enqueue({
                            type: 'tool-input-delta',
                            id: toolCall.id,
                            // toolCallId: toolCall.id,
                            // toolName: toolCall.function.name, 
                            delta: toolCall.function.arguments || '',
                          });
                        }
                      }
                    }

                    if (choice.message?.tool_calls) {
                      for (const toolCall of choice.message.tool_calls) {
                          controller.enqueue({
                            type: 'tool-call',
                            toolCallId: toolCall.id,
                            toolName: toolCall.function.name,
                            input: toolCall.function.arguments, // Keep as string - AI SDK will parse it
                          });
                        } 
                      }
                    

                    if (choice.finish_reason) {
                      controller.enqueue({
                        type: 'finish',
                        finishReason: choice.finish_reason as LanguageModelV2FinishReason,
                        usage: {
                          inputTokens: data.usage.prompt_tokens,
                          outputTokens: data.usage.completion_tokens,
                          totalTokens: data.usage.total_tokens,
                          // } : usage ? {
                          //   inputTokens: usage.promptTokens,
                          //   completionTokens: usage.completionTokens,
                          // } : {
                          //   promptTokens: 0,
                          //   completionTokens: 0,
                          // },
                        },
                      });
                    }
                  }

                  // Store usage for later if it's in a separate event
                  // if (data.usage) {
                  //   usage = {
                  //     promptTokens: data.usage.prompt_tokens,
                  //     completionTokens: data.usage.completion_tokens,
                  //   };
                  // }
                } catch (parseError) {
                  console.warn('Failed to parse SSE data:', parseError, 'Raw line:', trimmed);
                }
              }
            }
          }
        } catch (error) {
          //controller.error(error);
          controller.enqueue({
            type: 'error',
            error: error,
          });
        }
      },
    });
  }
}