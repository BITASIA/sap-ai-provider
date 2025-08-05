import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAPAIChatLanguageModel } from './sap-ai-chat-language-model';
import { SAPAISettings } from './sap-ai-chat-settings';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the convertToSAPMessages function
vi.mock('./convert-to-sap-messages', () => ({
    convertToSAPMessages: vi.fn((messages: any[]) => messages.map((msg: any) => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    })))
}));

// Mock the error handler
vi.mock('./sap-ai-error', () => ({
    sapAIFailedResponseHandler: vi.fn()
}));

describe('SAPAIChatLanguageModel', () => {
    let model: SAPAIChatLanguageModel;
    let mockConfig: any;
    let mockSettings: SAPAISettings;

    beforeEach(() => {
        mockConfig = {
            provider: 'sap-ai',
            baseURL: 'https://api.ai.test.com/v2/inference/deployments/test-deployment/completion',
            headers: () => ({
                'Authorization': 'Bearer test-token',
                'Content-Type': 'application/json',
                'ai-resource-group': 'default'
            }),
            fetch: mockFetch
        };

        mockSettings = {
            modelVersion: 'latest',
            modelParams: {
                temperature: 0.7,
                maxTokens: 1000
            }
        };

        model = new SAPAIChatLanguageModel('gpt-4o', mockSettings, mockConfig);
        mockFetch.mockClear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with correct properties', () => {
            expect(model.specificationVersion).toBe('v2');
            expect(model.defaultObjectGenerationMode).toBe('json');
            expect(model.supportsImageUrls).toBe(true);
            expect(model.modelId).toBe('gpt-4o');
            expect(model.supportsStructuredOutputs).toBe(true);
            expect(model.provider).toBe('sap-ai');
        });
    });

    describe('supportsUrl', () => {
        it('should support HTTPS URLs', () => {
            expect(model.supportsUrl(new URL('https://example.com'))).toBe(true);
        });

        it('should not support HTTP URLs', () => {
            expect(model.supportsUrl(new URL('http://example.com'))).toBe(false);
        });
    });

    describe('doGenerate', () => {
        const createMockResponse = (content: string, toolCalls?: any[]) => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({
                'content-type': 'application/json',
                'content-length': '1000'
            }),
            json: async () => ({
                request_id: 'test-request-id',
                module_results: {
                    llm: {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content,
                                tool_calls: toolCalls
                            },
                            finish_reason: 'stop'
                        }],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 20,
                            total_tokens: 30
                        }
                    },
                    templating: []
                }
            }),
            text: async () => JSON.stringify({
                request_id: 'test-request-id',
                module_results: {
                    llm: {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content,
                                tool_calls: toolCalls
                            },
                            finish_reason: 'stop'
                        }],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 20,
                            total_tokens: 30
                        }
                    },
                    templating: []
                }
            }),
            arrayBuffer: async () => new ArrayBuffer(0),
            blob: async () => new Blob(),
            formData: async () => new FormData(),
            clone: function() { return this; },
            body: null,
            bodyUsed: false,
            redirected: false,
            type: 'basic' as ResponseType,
            url: ''
        });
    

        it('should generate text response', async () => {
            const mockResponse = createMockResponse('Hello, world!');
            mockFetch.mockResolvedValueOnce(mockResponse);

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            const result = await model.doGenerate({
                prompt
            });

            // Check that content contains text
            expect(result.content).toHaveLength(1);
            expect(result.content[0].type).toBe('text');
            expect((result.content[0] as any).text).toBe('Hello, world!');
            expect(result.finishReason).toBe('stop');
            expect(result.usage).toEqual({
                inputTokens: 10,
                outputTokens: 20,
                totalTokens: 30
            });
        });

        it('should handle JSON content parsing', async () => {
            const jsonContent = JSON.stringify({ content: 'Parsed content' });
            const mockResponse = createMockResponse(jsonContent);
            mockFetch.mockResolvedValueOnce(mockResponse);

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            const result = await model.doGenerate({
                prompt
            });

            expect(result.content).toHaveLength(1);
            expect(result.content[0].type).toBe('text');
            expect((result.content[0] as any).text).toBe('Parsed content');
        });

        it('should handle tool calls', async () => {
            const toolCalls = [{
                id: 'call_123',
                type: 'function',
                function: {
                    name: 'get_weather',
                    arguments: '{"location": "San Francisco"}'
                }
            }];

            const mockResponse = createMockResponse('', toolCalls);
            mockFetch.mockResolvedValueOnce(mockResponse);

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'What\'s the weather?' }] }
            ];

            const result = await model.doGenerate({
                prompt,
                tools: [{
                    type: 'function',
                    name: 'get_weather',
                    description: 'Get weather information',
                    inputSchema: {
                        type: 'object' as const,
                        properties: {},
                        additionalProperties: false
                    }
                }]
            });

            // Find tool call in content array
            const toolCall = result.content.find(c => c.type === 'tool-call');
            expect(toolCall).toBeDefined();
            expect(toolCall).toEqual({
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'get_weather',
                input: '{"location": "San Francisco"}'
            });
        });

        it('should include tools in request when provided', async () => {
            const mockResponse = createMockResponse('Hello');
            mockFetch.mockResolvedValueOnce(mockResponse);

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            const tools = [{
                type: 'function' as const,
                name: 'test_tool',
                description: 'Test tool',
                inputSchema: {
                    type: 'object' as const,
                    properties: {},
                    additionalProperties: false
                }
            }];

            await model.doGenerate({
                prompt,
                tools
            });

            const [url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);

            expect(body.orchestration_config.module_configurations.templating_module_config.tools).toEqual([{
                type: 'function',
                function: {
                    name: 'test_tool',
                    description: 'Test tool',
                    parameters: {
                        type: 'object',
                        properties: {},
                        additionalProperties: false
                    }
                }
            }]);
        });

        it('should handle empty content', async () => {
            const mockResponse = createMockResponse('');
            mockFetch.mockResolvedValueOnce(mockResponse);

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            const result = await model.doGenerate({
                prompt
            });

            // Should not add empty text content
            expect(result.content).toHaveLength(0);
        });

        it('should set correct headers', async () => {
            const mockResponse = createMockResponse('Hello');
            mockFetch.mockResolvedValueOnce(mockResponse);

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            await model.doGenerate({
                prompt
            });

            const [url, options] = mockFetch.mock.calls[0];

            expect(options.headers).toEqual(
                expect.objectContaining({
                    'Authorization': 'Bearer test-token',
                    'Content-Type': 'application/json',
                    'ai-resource-group': 'default'
                })
            );
        });

        it('should handle abort signal', async () => {
            const mockResponse = createMockResponse('Hello');
            mockFetch.mockResolvedValueOnce(mockResponse);

            const abortController = new AbortController();
            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            await model.doGenerate({
                prompt,
                abortSignal: abortController.signal
            });

            const [url, options] = mockFetch.mock.calls[0];
            expect(options.signal).toBe(abortController.signal);
        });

        it('should include custom headers', async () => {
            const mockResponse = createMockResponse('Hello');
            mockFetch.mockResolvedValueOnce(mockResponse);

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            await model.doGenerate({
                prompt,
                headers: { 'Custom-Header': 'custom-value' }
            });

            const [url, options] = mockFetch.mock.calls[0];
            expect(options.headers).toEqual(
                expect.objectContaining({
                    'Custom-Header': 'custom-value'
                })
            );
        });
    });

    describe('doStream', () => {
        it('should fall back to non-streaming when streaming fails', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Headers({
                    'content-type': 'application/json'
                }),
                json: async () => ({
                    request_id: 'test-request-id',
                    module_results: {
                        llm: {
                            choices: [{
                                message: {
                                    role: 'assistant',
                                    content: 'Hello, streaming!'
                                },
                                finish_reason: 'stop'
                            }],
                            usage: {
                                prompt_tokens: 10,
                                completion_tokens: 20,
                                total_tokens: 30
                            }
                        },
                        templating: []
                    }
                }),
                text: async () => JSON.stringify({
                    request_id: 'test-request-id',
                    module_results: {
                        llm: {
                            choices: [{
                                message: {
                                    role: 'assistant',
                                    content: 'Hello, streaming!'
                                },
                                finish_reason: 'stop'
                            }],
                            usage: {
                                prompt_tokens: 10,
                                completion_tokens: 20,
                                total_tokens: 30
                            }
                        },
                        templating: []
                    }
                }),
                arrayBuffer: async () => new ArrayBuffer(0),
                blob: async () => new Blob(),
                formData: async () => new FormData(),
                clone: function() { return this; },
                body: null,
                bodyUsed: false,
                redirected: false,
                type: 'basic' as ResponseType,
                url: ''
            };

            mockFetch
                .mockRejectedValueOnce(new Error('Streaming failed'))
                .mockResolvedValueOnce(mockResponse);

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            const result = await model.doStream({
                prompt
            });

            expect(result.stream).toBeInstanceOf(ReadableStream);
            expect(result.rawCall).toBeDefined();
        });

        it('should handle successful streaming response', async () => {
            const mockStreamResponse = {
                ok: true,
                status: 200,
                headers: new Headers([['content-type', 'text/event-stream']]), // ✅ Use Headers constructor
                body: {
                    getReader: () => ({
                        read: vi.fn()
                            .mockResolvedValueOnce({
                                done: false,
                                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n')
                            })
                            .mockResolvedValueOnce({
                                done: false,
                                value: new TextEncoder().encode('data: {"choices":[{"finish_reason":"stop"}]}\n')
                            })
                            .mockResolvedValueOnce({ done: true }),
                        releaseLock: vi.fn()
                    })
                }
            };

            mockFetch.mockResolvedValueOnce(mockStreamResponse);

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            const result = await model.doStream({
                prompt
            });

            expect(result.stream).toBeInstanceOf(ReadableStream);
        });
    });

    describe('error handling', () => {
        it('should handle network errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            await expect(model.doGenerate({
                prompt
            })).rejects.toThrow('Network error');
        });

        it('should handle HTTP errors', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                headers: new Headers(),
                text: async () => 'Unauthorized access'
            });

            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];

            await expect(model.doGenerate({
                prompt
            })).rejects.toThrow();
        });
    });

    describe('request format', () => {
        it('should create correct orchestration config structure', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Headers({
                    'content-type': 'application/json'
                }),
                json: async () => ({
                    request_id: 'test-request-id',
                    module_results: {
                        llm: {
                            choices: [{
                                message: { role: 'assistant', content: 'Test' },
                                finish_reason: 'stop'
                            }],
                            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
                        },
                        templating: []
                    }
                }),
                text: async () => JSON.stringify({
                    request_id: 'test-request-id',
                    module_results: {
                        llm: {
                            choices: [{
                                message: { role: 'assistant', content: 'Test' },
                                finish_reason: 'stop'
                            }],
                            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
                        },
                        templating: []
                    }
                }),
                arrayBuffer: async () => new ArrayBuffer(0),
                blob: async () => new Blob(),
                formData: async () => new FormData(),
                clone: function() { return this; },
                body: null,
                bodyUsed: false,
                redirected: false,
                type: 'basic' as ResponseType,
                url: ''
            };
    
            mockFetch.mockResolvedValueOnce(mockResponse);
    
            const prompt: LanguageModelV2Prompt = [
                { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
            ];
    
            await model.doGenerate({
                prompt
            });
    
            const [url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
    
            expect(body).toHaveProperty('orchestration_config');
            expect(body.orchestration_config).toHaveProperty('module_configurations');
            expect(body.orchestration_config.module_configurations).toHaveProperty('llm_module_config');
            expect(body.orchestration_config.module_configurations).toHaveProperty('templating_module_config');
    
            const llmConfig = body.orchestration_config.module_configurations.llm_module_config;
            expect(llmConfig.model_name).toBe('gpt-4o');
            expect(llmConfig.model_version).toBe('latest');
            expect(llmConfig.model_params).toBeDefined();
        });
    });
});