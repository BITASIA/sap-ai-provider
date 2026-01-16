/**
 * Configuration constants for documentation validation.
 * Extracted from validate-docs.ts for better maintainability.
 */

/** File path with validation threshold. */
export interface FileThreshold {
  /** File path. */
  file: string;
  /** Threshold count. */
  threshold: number;
}

/** Model ID validation rule. */
export interface ModelValidationRule {
  /** Model count patterns. */
  countPatterns: RegExp[];
  /** Incorrect format pattern with correction. */
  incorrectPattern: null | {
    correctFormat: string;
    pattern: RegExp;
  };
  /** Vendor name. */
  vendor: string;
}

/** Critical exports that must be documented. */
export const CRITICAL_EXPORTS = [
  "createSAPAIProvider",
  "sapai",
  "buildDpiMaskingProvider",
  "buildAzureContentSafetyFilter",
  "buildLlamaGuard38BFilter",
] as const;

/** Files to check for model mention counts. */
export const MODEL_CHECK_FILES: FileThreshold[] = [
  { file: "README.md", threshold: 15 },
  { file: "API_REFERENCE.md", threshold: 20 },
];

/** Files to check for dotenv imports. */
export const DOTENV_CHECK_FILES = [
  "README.md",
  "API_REFERENCE.md",
  "MIGRATION_GUIDE.md",
  "ENVIRONMENT_SETUP.md",
  "TROUBLESHOOTING.md",
] as const;

/** Documentation files for ToC processing and validation. */
export const DOC_FILES = [
  "README.md",
  "API_REFERENCE.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "ENVIRONMENT_SETUP.md",
  "MIGRATION_GUIDE.md",
  "TROUBLESHOOTING.md",
] as const;

/** Required documentation files (includes DOC_FILES + non-markdown files). */
export const REQUIRED_FILES = [...DOC_FILES, "LICENSE.md", ".env.example"] as const;

/** Files to check for version consistency. */
export const VERSION_CHECK_FILES = ["README.md", "MIGRATION_GUIDE.md"] as const;

/** Directories excluded from validation by default. */
export const DEFAULT_EXCLUDED_DIRS = ["node_modules", ".git"] as const;

/** Coverage tolerance percentage for test metrics. */
export const COVERAGE_TOLERANCE_PERCENT = 0.5;

/** Minimum representation threshold for including a header level in ToC (10%). */
export const TOC_DEPTH_THRESHOLD_PERCENT = 0.1;

/** Regex patterns used throughout validation. */
export const REGEX_PATTERNS = {
  // eslint-disable-next-line no-control-regex
  ANSI_COLORS: /\x1b\[[0-9;]*m/g,
  BLOCK_COMMENT_START: /\/\*\*?/,
  CODE_FENCE: /^(`{3,})(\w*)/,
  DIRECT_EXPORT: /export\s+(?:const|function|class|type|interface)\s+(\w+)/g,
  HEADER: /^(#{1,6})\s+(.+)$/,
  INLINE_COMMENT: /\/\/(.*)$/,
  JSDOC_LINK: /\{@(?:link|see)\s+([^}]+)\}/g,
  JSDOC_ONE_LINER: /\/\*\*(?!\*)(?:[^*]|\*(?!\/))*\*\//,
  MD_INTERNAL_LINK: /\[([^\]]+)\]\(((?!https?:\/\/)(?:\.\/)?([^)#]+\.md))(#[^)]+)?\)/g,
  MD_LINK: /\[([^\]]+)\]\(((?!https?:\/\/)([^)#]+))(#[^)]+)?\)/g,
  MD_LINK_NO_PREFIX: /\[([^\]]+)\]\((?!\.\/|https?:\/\/|#)([^)]+\.md[^)]*)\)/g,
  RE_EXPORT: /export\s*\{\s*([^}]+)\s*\}/g,
  URL_PATTERN: /https?:\/\//,
} as const;

/** Model ID validation rules: count patterns and format checks. */
export const MODEL_VALIDATION_RULES: ModelValidationRule[] = [
  {
    countPatterns: [/"gpt-[\d.]+[a-z0-9-]*"/gi, /"o[\d]+-?[a-z]*"/gi],
    incorrectPattern: null,
    vendor: "OpenAI",
  },
  {
    countPatterns: [/"gemini-[\d.]+-[a-z]+"/gi],
    incorrectPattern: null,
    vendor: "Google",
  },
  {
    countPatterns: [/"anthropic--claude-[^"]+"/gi],
    incorrectPattern: {
      correctFormat: "anthropic--claude-*",
      pattern: /(?<!anthropic--)(\bclaude-[\d.]+-(?:sonnet|opus|haiku)\b)/g,
    },
    vendor: "Anthropic",
  },
  {
    countPatterns: [/"amazon--[a-z0-9-]+"/gi],
    incorrectPattern: {
      correctFormat: "amazon--nova-*",
      pattern: /(?<!amazon--)(\bnova-(?:pro|lite|micro|premier)\b)/g,
    },
    vendor: "Amazon",
  },
  {
    countPatterns: [/"meta--llama[^"]+"/gi],
    incorrectPattern: {
      correctFormat: "meta--llama*-instruct",
      pattern: /(?<!meta--)(\bllama[\d.]+(?!-instruct\b)[a-z\d.]*)b/g,
    },
    vendor: "Meta",
  },
  {
    countPatterns: [/"mistralai--[a-z0-9-]+"/gi],
    incorrectPattern: {
      correctFormat: "mistralai--mistral-*-instruct",
      pattern: /(?<!mistralai--)(\bmistralai-mistral-\w+)(?!-instruct\b)/g,
    },
    vendor: "Mistral",
  },
] as const;

/** Source code files to validate for comment quality. */
export const SOURCE_FILES = [
  "src/sap-ai-error.ts",
  "src/sap-ai-language-model.ts",
  "src/sap-ai-provider.ts",
  "src/index.ts",
  "src/sap-ai-settings.ts",
  "src/convert-to-sap-messages.ts",
] as const;
