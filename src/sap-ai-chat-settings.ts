/**
 * Settings for configuring SAP AI Core model behavior.
 */
export interface SAPAISettings {
  /**
   * Specific version of the model to use.
   * If not provided, the latest version will be used.
   */
  modelVersion?: string;

  /**
   * Model generation parameters that control the output.
   */
  modelParams?: {
    /**
     * Maximum number of tokens to generate.
     * Higher values allow for longer responses but increase latency and cost.
     * @default 1000
     */
    maxTokens?: number;

    /**
     * Sampling temperature between 0 and 2.
     * Higher values make output more random, lower values more deterministic.
     * @default 0.7
     */
    temperature?: number;

    /**
     * Nucleus sampling parameter between 0 and 1.
     * Controls diversity via cumulative probability cutoff.
     * @default 1
     */
    topP?: number;

    /**
     * Frequency penalty between -2.0 and 2.0.
     * Positive values penalize tokens based on their frequency.
     * @default 0
     */
    frequencyPenalty?: number;

    /**
     * Presence penalty between -2.0 and 2.0.
     * Positive values penalize tokens that have appeared in the text.
     * @default 0
     */
    presencePenalty?: number;

    /**
     * Number of completions to generate.
     * Multiple completions provide alternative responses.
     * @default 1
     */
    n?: number;
  };

  /**
   * Enable safe prompt filtering.
   * When enabled, prompts are checked for harmful content.
   * @default true
   */
  safePrompt?: boolean;

  /**
   * Enable structured outputs.
   * When enabled, responses will be formatted according to provided schemas.
   * @default false
   */
  structuredOutputs?: boolean;
}

/**
 * Supported model IDs in SAP AI Core.
 * Note: Model availability depends on your subscription and region.
 */
export type SAPAIModelId =
  | "amazon--nova-premier"
  | "amazon--nova-pro"
  | "amazon--nova-lite"
  | "amazon--nova-micro"
  | "gpt-4"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "gpt-4.1-nano"
  | "o1"
  | "o1-mini"
  | "o3"
  | "o3-mini"
  | "o4-mini"
  | "gemini-1.5-pro"
  | "gemini-1.5-flash"
  | "gemini-2.0-pro"
  | "gemini-2.0-flash"
  | "gemini-2.0-flash-thinking"
  | "gemini-2.0-flash-lite"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "anthropic--claude-3-haiku"
  | "anthropic--claude-3-sonnet"
  | "anthropic--claude-3-opus"
  | "anthropic--claude-3.5-sonnet"
  | "anthropic--claude-3.7-sonnet"
  | "anthropic--claude-4-sonnet"
  | "anthropic--claude-4-opus"
  | "amazon--titan-text-lite"
  | "amazon--titan-text-express"
  | "alephalpha-pharia-1-7b-control"
  | "meta--llama3-70b-instruct"
  | "meta--llama3.1-70b-instruct"
  | "mistralai--mistral-large-instruct"
  | "mistralai--mistral-small-instruct"
  | "mistralai--pixtral-large-instruct"
  | "ibm--granite-13b-chat"
  | (string & {});
