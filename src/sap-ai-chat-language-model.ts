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
import { z } from 'zod';
import { convertToSAPMessages } from './convert-to-sap-messages';
import { SAPAIModelId, SAPAISettings } from './sap-ai-chat-settings';
import { sapAIFailedResponseHandler } from './sap-ai-error';
import { sapAIResponseSchema } from './types/completion-response';

type SAPAIConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
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

  supportsUrl(url: URL): boolean {
    return url.protocol === 'https:';
  }

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
    
    availableTools = options.tools;
    
    // Check if model supports structured outputs (OpenAI and Gemini models do, Anthropic doesn't)
    const supportsStructuredOutputs = !this.modelId.startsWith('anthropic--') && 
                                     !this.modelId.startsWith('claude-');
    
    const templatingConfig: any = {
      template: convertToSAPMessages(options.prompt),
      defaults: {},
      tools: availableTools?.map(tool => {
        if (tool.type === 'function') {
          let parameters = tool.parameters;
          
          if (!parameters) {
            const toolAny = tool as any;
            if (toolAny.inputSchema) {
              parameters = toolAny.inputSchema;
            } else if (toolAny.schema) {
              parameters = toolAny.schema;
            } else if (toolAny.function?.parameters) {
              parameters = toolAny.function.parameters;
            }
          }
          
          return {
            type: tool.type,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: parameters || { 
                type: 'object', 
                properties: {},
                required: []
              },
            }
          };
        } else {
          warnings.push({
            type: 'unsupported-tool',
            tool: tool,
          });
          return null;
        }
      }).filter(Boolean)
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
              temperature: this.settings.modelParams?.temperature ?? 0.7,
              max_tokens: this.settings.modelParams?.maxTokens ?? 1000,
              top_p: this.settings.modelParams?.topP,
              frequency_penalty: this.settings.modelParams?.frequencyPenalty,
              presence_penalty: this.settings.modelParams?.presencePenalty,
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
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
    warnings: LanguageModelV2CallWarning[];
  }> {
    const { args, warnings } = this.getArgs(options);
    const headers = combineHeaders(this.config.headers(), options.headers ?? {});

    const { value: response } = await postJsonToApi<z.infer<typeof sapAIResponseSchema>>({
      url: this.config.baseURL,
      headers,
      body: args,
      failedResponseHandler: sapAIFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(sapAIResponseSchema as any),
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
          type: 'text',
          text: text,
        });
      }
    }

    if (firstChoice.message.tool_calls) {
      for (const toolCall of firstChoice.message.tool_calls) {
        content.push({
          type: 'tool-call',
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

  async doStream(
    options: LanguageModelV2CallOptions,
  ): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
  }> {
    const { args, warnings } = this.getArgs(options, true);
    const headers = combineHeaders(this.config.headers(), options.headers ?? {});

    // Try streaming first, fallback to non-streaming if not supported
    try {
      const response = await fetch(this.config.baseURL, {
        method: 'POST',
        headers: {
          ...headers,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(args),
        signal: options.abortSignal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      
      // Check if response is actually streaming (Server-Sent Events)
      if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
        return {
          stream: this.createStreamFromSSE(response),
          rawCall: { rawPrompt: args, rawSettings: {} },
        };
      }
    } catch (error) {
      console.warn('Streaming not supported, falling back to non-streaming:', error);
    }

    // Fallback to non-streaming implementation
    const response = await this.doGenerate(options);
    
    // Extract text from V2 content array
    let text = '';
    for (const content of response.content) {
      if (content.type === 'text') {
        text += content.text;
      }
    }
    
    return {
      stream: new ReadableStream({
        start(controller) {
          // Simulate streaming by sending the text character by character
          let index = 0;
          
          const sendNext = () => {
            if (index < text.length) {
              const chunk = text.slice(index, index + 10); // Send 10 chars at a time
              controller.enqueue({
                type: 'text-delta',
                id: Math.random().toString(36).substring(2),
                delta: chunk,
              });
              index += 10;
              setTimeout(sendNext, 10); // Small delay to simulate streaming
            } else {
              // Send tool calls from content array
              for (const content of response.content) {
                if (content.type === 'tool-call') {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: content.toolCallId,
                    toolName: content.toolName,
                    input: content.input,
                  });
                }
              }
              
              controller.enqueue({
                type: 'finish',
                finishReason: response.finishReason,
                usage: response.usage,
              });
              controller.close();
            }
          };
          
          sendNext();
        },
      }),
      rawCall: response.rawCall,
    };
  }

  private createStreamFromSSE(response: Response): ReadableStream<LanguageModelV2StreamPart> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let usage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;

    return new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              // Send final usage if available
              if (usage) {
                controller.enqueue({
                  type: 'finish',
                  finishReason: 'stop',
                  usage,
                });
              }
              controller.close();
              break;
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
                        type: 'text-delta',
                        id: Math.random().toString(36).substring(2),
                        delta: textContent,
                      });
                    }
                    
                    if (choice.delta?.tool_calls) {
                      for (const toolCall of choice.delta.tool_calls) {
                        controller.enqueue({
                          type: 'tool-call',
                          toolCallId: toolCall.id,
                          toolName: toolCall.function.name,
                          input: toolCall.function.arguments,
                        });
                      }
                    }
                    
                    if (choice.finish_reason) {
                      controller.enqueue({
                        type: 'finish',
                        finishReason: choice.finish_reason as LanguageModelV2FinishReason,
                        usage: data.usage ? {
                          inputTokens: data.usage.prompt_tokens,
                          outputTokens: data.usage.completion_tokens,
                          totalTokens: data.usage.prompt_tokens + data.usage.completion_tokens,
                        } : usage ? {
                          inputTokens: usage.inputTokens,
                          outputTokens: usage.outputTokens,
                          totalTokens: usage.totalTokens,
                        } : {
                          inputTokens: 0,
                          outputTokens: 0,
                          totalTokens: 0,
                        },
                      });
                    }
                  }
                  
                  // Store usage for later if it's in a separate event
                  if (data.usage) {
                    usage = {
                      inputTokens: data.usage.prompt_tokens,
                      outputTokens: data.usage.completion_tokens,
                      totalTokens: data.usage.prompt_tokens + data.usage.completion_tokens,
                    };
                  }
                } catch (parseError) {
                  console.warn('Failed to parse SSE data:', parseError, 'Raw line:', trimmed);
                }
              }
            }
          }
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }
} 