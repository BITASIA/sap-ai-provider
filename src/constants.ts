/**
 * Constants used throughout the SAP AI Provider
 */

// Default configuration values
export const DEFAULT_DEPLOYMENT_ID = "d65d81e7c077e583";
export const DEFAULT_RESOURCE_GROUP = "default";
export const DEFAULT_MODEL_VERSION = "latest";
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 1000;
export const DEFAULT_TOP_P = 1;
export const DEFAULT_FREQUENCY_PENALTY = 0;
export const DEFAULT_PRESENCE_PENALTY = 0;
export const DEFAULT_N_COMPLETIONS = 1;

// Base URL configuration
export const DEFAULT_BASE_URL =
  "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2";
export const API_VERSION = "v2";

// HTTP status codes for error handling
export const HTTP_STATUS_CODES = {
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// Environment variable names
export const ENV_VARS = {
  SERVICE_KEY: "SAP_AI_SERVICE_KEY",
  TOKEN: "SAP_AI_TOKEN",
  DEPLOYMENT_ID: "SAP_AI_DEPLOYMENT_ID",
  RESOURCE_GROUP: "SAP_AI_RESOURCE_GROUP",
} as const;

// Provider configuration
export const PROVIDER_NAME = "sap-ai";
export const ERROR_NAME = "SAPAIError";

// Model capabilities
export const MODEL_PREFIXES = {
  ANTHROPIC: "anthropic--",
  CLAUDE: "claude-",
  AMAZON: "amazon--",
} as const;

// Content types
export const CONTENT_TYPES = {
  JSON: "application/json",
  FORM_URLENCODED: "application/x-www-form-urlencoded",
} as const;

// OAuth configuration
export const OAUTH_GRANT_TYPE = "client_credentials";
export const OAUTH_ENDPOINT = "/oauth/token";

// Function limits for clean code
export const FUNCTION_LIMITS = {
  MAX_LINES: 50,
  MAX_COMPLEXITY: 10,
  MAX_DEPTH: 4,
  MAX_PARAMETERS: 4,
} as const;

// Time conversion
export const MILLISECONDS_PER_SECOND = 1000;
