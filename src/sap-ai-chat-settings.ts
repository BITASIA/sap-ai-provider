
export interface SAPAISettings {
  modelVersion?: string;
  modelParams?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    n?: number;
  };
  safePrompt?: boolean;
  structuredOutputs?: boolean;
}

export type SAPAIModelId = 
| 'amazon--nova-premier'
| 'amazon--nova-pro'
| 'amazon--nova-lite'
| 'amazon--nova-micro'
| 'gpt-4'
| 'gpt-4o'
| 'gpt-4o-mini'
| 'gpt-4.1'
| 'gpt-4.1-mini'
| 'gpt-4.1-nano'
| 'o1'
| 'o1-mini'
| 'o3'
| 'o3-mini'
| 'o4-mini'
| 'gemini-1.5-pro'
| 'gemini-1.5-flash'
| 'gemini-2.0-pro'
| 'gemini-2.0-flash'
| 'gemini-2.0-flash-thinking'
| 'gemini-2.0-flash-lite'
| 'gemini-2.5-pro'
| 'gemini-2.5-flash'
| 'anthropic--claude-3-haiku'
| 'anthropic--claude-3-sonnet'
| 'anthropic--claude-3-opus'
| 'anthropic--claude-3.5-sonnet'
| 'anthropic--claude-3.7-sonnet'
| 'anthropic--claude-4-sonnet'
| 'anthropic--claude-4-opus'
| 'amazon--titan-text-lite'
| 'amazon--titan-text-express'
| 'alephalpha-pharia-1-7b-control'
| 'meta--llama3-70b-instruct'
| 'meta--llama3.1-70b-instruct'
| 'mistralai--mistral-large-instruct'
| 'mistralai--mistral-small-instruct'
| 'mistralai--pixtral-large-instruct'
| 'ibm--granite-13b-chat'
| (string & {});