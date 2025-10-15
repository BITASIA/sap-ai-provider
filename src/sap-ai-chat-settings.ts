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
     */
    maxTokens?: number;

    /**
     * Sampling temperature between 0 and 2.
     * Higher values make output more random, lower values more deterministic.
     * No default; omitted when unspecified or unsupported by the target model.
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

    /**
     * Controls whether the model is allowed to execute tool calls in parallel.
     * When set to false, tool calls will be serialized.
     * This maps to SAP/OpenAI param `parallel_tool_calls`.
     */
    parallelToolCalls?: boolean;
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

  /**
   * Masking configuration for SAP AI Core orchestration.
   * When provided, sensitive information in prompts can be anonymized or
   * pseudonymized by SAP Data Privacy Integration (DPI).
   */
  masking?: MaskingModuleConfig;

  /**
   * Response format for templating prompt (OpenAI-compatible).
   * When set, this will be sent to orchestration under
   * config.modules.prompt_templating.prompt.response_format (v2)
   * or orchestration_config.module_configurations.templating_module_config.response_format (legacy).
   */
  responseFormat?:
    | { type: "text" }
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          description?: string;
          schema?: unknown;
          strict?: boolean | null;
        };
      };
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

/**
 * Orchestration masking module configuration.
 */
export type MaskingModuleConfig = {
  /**
   * List of masking service providers. At least one is required.
   */
  masking_providers: MaskingProviderConfig[];
};

export type MaskingProviderConfig = DpiConfig;

/**
 * SAP Data Privacy Integration (DPI) masking provider configuration.
 * Supports anonymization or pseudonymization with standard and custom entities.
 */
export type DpiConfig = {
  /** Type of masking service provider */
  type: "sap_data_privacy_integration";
  /** Type of masking method to be used */
  method: "anonymization" | "pseudonymization";
  /** List of entities to be masked */
  entities: DpiEntityConfig[];
  /** List of strings that should not be masked */
  allowlist?: string[];
  /** Controls whether the input to the grounding module will be masked */
  mask_grounding_input?: {
    enabled?: boolean;
  };
};

export type DpiEntityConfig = DPIStandardEntity | DPICustomEntity;

export type DPIStandardEntity = {
  type: DpiEntities;
  /**
   * Replacement strategy to be used for the entity
   */
  replacement_strategy?: DPIMethodConstant | DPIMethodFabricatedData;
};
export type DpiEntities =
  | "profile-person"
  | "profile-org"
  | "profile-university"
  | "profile-location"
  | "profile-email"
  | "profile-phone"
  | "profile-address"
  | "profile-sapids-internal"
  | "profile-sapids-public"
  | "profile-url"
  | "profile-username-password"
  | "profile-nationalid"
  | "profile-iban"
  | "profile-ssn"
  | "profile-credit-card-number"
  | "profile-passport"
  | "profile-driverlicense"
  | "profile-nationality"
  | "profile-religious-group"
  | "profile-political-group"
  | "profile-pronouns-gender"
  | "profile-ethnicity"
  | "profile-gender"
  | "profile-sexual-orientation"
  | "profile-trade-union"
  | "profile-sensitive-data";

export type DPIMethodConstant = {
  method: "constant";
  /**
   * Value to be used for replacement
   * @example "NAME_REDACTED"
   */
  value: string;
};

export type DPIMethodFabricatedData = {
  method: "fabricated_data";
};

export type DPICustomEntity = {
  /**
   * Regular expression to match the entity
   */
  regex: string;
  /**
   * Replacement strategy to be used for the entity
   */
  replacement_strategy: DPIMethodConstant;
};
