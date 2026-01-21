/**
 * Dynamic model capability detection for SAP AI Core models.
 *
 * Provides model-specific capability information based on the model ID prefix,
 * following the SAP AI Core naming convention: `vendor--model-name`.
 * @example
 * ```typescript
 * const capabilities = getSAPAIModelCapabilities("anthropic--claude-3.5-sonnet");
 * // { supportsN: false, supportsParallelToolCalls: true, ... }
 * ```
 */

/**
 * Capability information for a SAP AI Core model.
 * Used to determine which features are available for a specific model.
 */
export interface SAPAIModelCapabilities {
  /**
   * Default system message mode for this model.
   * - 'system': Standard system role (most models)
   * - 'developer': Developer role (some reasoning models)
   * - 'user': Prepend to first user message (legacy models)
   */
  readonly defaultSystemMessageMode: "developer" | "system" | "user";

  /**
   * Whether the model supports image inputs (vision capability).
   * @default true
   */
  readonly supportsImageInputs: boolean;

  /**
   * Whether the model supports the `n` parameter for multiple completions.
   * Amazon Bedrock and Anthropic models do not support this parameter.
   * @default true
   */
  readonly supportsN: boolean;

  /**
   * Whether the model supports parallel tool calls in a single response.
   * Most modern models support this, but some older or specialized models may not.
   * @default true
   */
  readonly supportsParallelToolCalls: boolean;

  /**
   * Whether the model supports streaming responses.
   * @default true
   */
  readonly supportsStreaming: boolean;

  /**
   * Whether the model supports structured JSON output (json_schema response format).
   * @default true
   */
  readonly supportsStructuredOutputs: boolean;

  /**
   * Whether the model supports tool/function calling.
   * @default true
   */
  readonly supportsToolCalls: boolean;

  /**
   * The detected vendor for this model.
   */
  readonly vendor: "unknown" | SAPAIModelVendor;
}

/**
 * Model vendor prefixes used in SAP AI Core Orchestration Service.
 * Models are identified as `vendor--model-name`.
 */
export type SAPAIModelVendor =
  | "aicore"
  | "amazon"
  | "anthropic"
  | "azure"
  | "google"
  | "meta"
  | "mistral";

/**
 * Default capabilities for models without specific overrides.
 * @internal
 */
const DEFAULT_CAPABILITIES: SAPAIModelCapabilities = {
  defaultSystemMessageMode: "system",
  supportsImageInputs: true,
  supportsN: true,
  supportsParallelToolCalls: true,
  supportsStreaming: true,
  supportsStructuredOutputs: true,
  supportsToolCalls: true,
  vendor: "unknown",
};

/**
 * Vendor-specific capability overrides.
 * @internal
 */
const VENDOR_CAPABILITIES: Record<SAPAIModelVendor, Partial<SAPAIModelCapabilities>> = {
  aicore: {
    // SAP AI Core open source models (e.g., Llama, Falcon)
    supportsStructuredOutputs: false,
    vendor: "aicore",
  },
  amazon: {
    // Amazon Bedrock models (Nova, Titan)
    supportsN: false,
    vendor: "amazon",
  },
  anthropic: {
    // Anthropic Claude models
    supportsN: false,
    vendor: "anthropic",
  },
  azure: {
    // Azure OpenAI models (GPT-4, GPT-4o, etc.)
    vendor: "azure",
  },
  google: {
    // Google Vertex AI models (Gemini)
    vendor: "google",
  },
  meta: {
    // Meta Llama models
    supportsStructuredOutputs: false,
    vendor: "meta",
  },
  mistral: {
    // Mistral AI models
    vendor: "mistral",
  },
};

/**
 * Model-specific capability overrides for known model patterns.
 * These take precedence over vendor defaults.
 * @internal
 */
const MODEL_SPECIFIC_CAPABILITIES: {
  capabilities: Partial<SAPAIModelCapabilities>;
  pattern: RegExp;
}[] = [
  // Claude 2.x models have limited tool calling support
  {
    capabilities: {
      supportsParallelToolCalls: false,
      supportsStructuredOutputs: false,
    },
    pattern: /^anthropic--claude-2/,
  },
  // Amazon Titan models have limited capabilities
  {
    capabilities: {
      supportsImageInputs: false,
      supportsParallelToolCalls: false,
      supportsStructuredOutputs: false,
      supportsToolCalls: false,
    },
    pattern: /^amazon--titan/,
  },
  // Llama 2 models have limited capabilities
  {
    capabilities: {
      supportsImageInputs: false,
      supportsStructuredOutputs: false,
      supportsToolCalls: false,
    },
    pattern: /^(meta--llama-2|aicore--llama-2)/,
  },
  // Llama 3.1+ models support tools
  {
    capabilities: {
      supportsImageInputs: false,
      supportsToolCalls: true,
    },
    pattern: /^(meta--llama-3\.[1-9]|aicore--llama-3\.[1-9])/,
  },
  // Gemini 1.0 has limited structured output support
  {
    capabilities: {
      supportsStructuredOutputs: false,
    },
    pattern: /^google--gemini-1\.0/,
  },
  // Mistral Small/Tiny have limited capabilities
  {
    capabilities: {
      supportsStructuredOutputs: false,
    },
    pattern: /^mistral--(mistral-small|mistral-tiny)/,
  },
];

/**
 * Extracts the vendor prefix from a SAP AI Core model ID.
 *
 * SAP AI Core uses the convention `vendor--model-name` for model identification.
 * @param modelId - The full model identifier (e.g., "anthropic--claude-3.5-sonnet").
 * @returns The vendor prefix, or "unknown" if not recognized.
 * @example
 * ```typescript
 * getModelVendor("anthropic--claude-3.5-sonnet"); // "anthropic"
 * getModelVendor("gpt-4o"); // "unknown"
 * ```
 */
export function getModelVendor(modelId: string): "unknown" | SAPAIModelVendor {
  const vendorMatch = /^([a-z]+)--/.exec(modelId.toLowerCase());
  if (!vendorMatch) {
    return "unknown";
  }

  const vendor = vendorMatch[1] as SAPAIModelVendor;
  if (vendor in VENDOR_CAPABILITIES) {
    return vendor;
  }

  return "unknown";
}

/**
 * Gets the capability information for a specific SAP AI Core model.
 *
 * Capabilities are determined by:
 * 1. Model-specific patterns (highest priority)
 * 2. Vendor defaults
 * 3. Global defaults (lowest priority)
 * @param modelId - The full model identifier (e.g., "anthropic--claude-3.5-sonnet").
 * @returns The model's capabilities.
 * @example
 * ```typescript
 * const capabilities = getSAPAIModelCapabilities("amazon--nova-pro");
 * if (!capabilities.supportsN) {
 *   // Don't use n parameter for this model
 * }
 * ```
 */
export function getSAPAIModelCapabilities(modelId: string): SAPAIModelCapabilities {
  const vendor = getModelVendor(modelId);
  const normalizedModelId = modelId.toLowerCase();

  // Start with defaults
  let capabilities: SAPAIModelCapabilities = { ...DEFAULT_CAPABILITIES };

  // Apply vendor-specific overrides
  if (vendor !== "unknown") {
    capabilities = {
      ...capabilities,
      ...VENDOR_CAPABILITIES[vendor],
    };
  }

  // Apply model-specific overrides (highest priority)
  for (const { capabilities: modelCapabilities, pattern } of MODEL_SPECIFIC_CAPABILITIES) {
    if (pattern.test(normalizedModelId)) {
      capabilities = {
        ...capabilities,
        ...modelCapabilities,
      };
      break; // First match wins
    }
  }

  // Ensure vendor is set
  capabilities = {
    ...capabilities,
    vendor,
  };

  return capabilities;
}

/**
 * Checks if a model supports a specific capability.
 *
 * Convenience function for checking individual capabilities.
 * @param modelId - The full model identifier.
 * @param capability - The capability to check.
 * @returns True if the model supports the capability.
 * @example
 * ```typescript
 * if (modelSupports("anthropic--claude-3.5-sonnet", "supportsN")) {
 *   // Use n parameter
 * }
 * ```
 */
export function modelSupports(
  modelId: string,
  capability: keyof Omit<SAPAIModelCapabilities, "defaultSystemMessageMode" | "vendor">,
): boolean {
  const capabilities = getSAPAIModelCapabilities(modelId);
  return capabilities[capability];
}
