# API Reference

Complete API documentation for the SAP AI Core Provider.

## Terminology

To avoid confusion, this documentation uses the following terminology consistently:

- **SAP AI Core** - The SAP BTP service that provides AI model hosting and orchestration (the cloud service)
- **SAP AI SDK** - The official `@sap-ai-sdk/orchestration` npm package used for API communication
- **SAP AI Core Provider** or **this provider** - This npm package (`@mymediset/sap-ai-provider`)
- **Tool calling** and **Function calling** - These terms are used interchangeably in AI contexts. This provider uses "tool calling" to align with Vercel AI SDK terminology, but the concepts are identical.

## Table of Contents

- [Provider Factory Functions](#provider-factory-functions)
- [Interfaces](#interfaces)
- [Types](#types)
- [Classes](#classes)
- [Utility Functions](#utility-functions)

---

## Provider Factory Functions

### `createSAPAIProvider(options?)`

Creates an SAP AI Core provider instance.

**Signature:**

```typescript
function createSAPAIProvider(options?: SAPAIProviderSettings): SAPAIProvider;
```

**Parameters:**

- `options` (optional): `SAPAIProviderSettings` - Configuration options

**Returns:** `SAPAIProvider` - Configured provider instance

**Example:**

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider({
  resourceGroup: "default",
  deploymentId: "d65d81e7c077e583",
});

const model = provider("gpt-4o");
```

---

## Interfaces

### `SAPAIProvider`

Main provider interface extending Vercel AI SDK's `ProviderV2`.

**Properties:**

- None (function-based interface)

**Methods:**

#### `provider(modelId, settings?)`

Create a language model instance.

**Signature:**

```typescript
(modelId: SAPAIModelId, settings?: SAPAISettings): SAPAIChatLanguageModel
```

**Parameters:**

- `modelId`: Model identifier (e.g., 'gpt-4o', 'anthropic--claude-3.5-sonnet')
- `settings`: Optional model configuration

**Example:**

```typescript
const model = provider("gpt-4o", {
  modelParams: {
    temperature: 0.7,
    maxTokens: 2000,
  },
});
```

#### `provider.chat(modelId, settings?)`

Explicit method for creating chat models (equivalent to calling provider function).

**Signature:**

```typescript
chat(modelId: SAPAIModelId, settings?: SAPAISettings): SAPAIChatLanguageModel
```

---

### `SAPAIProviderSettings`

Configuration options for the SAP AI Provider.

**Properties:**

| Property          | Type                            | Default       | Description                                  |
| ----------------- | ------------------------------- | ------------- | -------------------------------------------- |
| `resourceGroup`   | `string`                        | `'default'`   | SAP AI Core resource group                   |
| `deploymentId`    | `string`                        | Auto-resolved | SAP AI Core deployment ID                    |
| `destination`     | `HttpDestinationOrFetchOptions` | -             | Custom destination configuration             |
| `defaultSettings` | `SAPAISettings`                 | -             | Default model settings applied to all models |

**Example:**

```typescript
const settings: SAPAIProviderSettings = {
  resourceGroup: "production",
  deploymentId: "d65d81e7c077e583",
  defaultSettings: {
    modelParams: {
      temperature: 0.7,
      maxTokens: 2000,
    },
  },
};
```

---

### `SAPAISettings`

Model-specific configuration options.

**Properties:**

| Property           | Type                   | Default    | Description                                                                                            |
| ------------------ | ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `modelVersion`     | `string`               | `'latest'` | Specific model version                                                                                 |
| `includeReasoning` | `boolean`              | -          | Whether to include assistant reasoning parts in SAP prompt conversion (may contain internal reasoning) |
| `modelParams`      | `ModelParams`          | -          | Model generation parameters                                                                            |
| `masking`          | `MaskingModule`        | -          | Data masking configuration (DPI)                                                                       |
| `filtering`        | `FilteringModule`      | -          | Content filtering configuration                                                                        |
| `responseFormat`   | `ResponseFormatConfig` | -          | Response format specification                                                                          |
| `tools`            | `ChatCompletionTool[]` | -          | Tool definitions in SAP AI SDK format                                                                  |

**Example:**

```typescript
const settings: SAPAISettings = {
  modelVersion: "latest",
  modelParams: {
    temperature: 0.3,
    maxTokens: 2000,
    topP: 0.9,
    frequencyPenalty: 0.1,
    presencePenalty: 0.0,
    n: 1,
    parallel_tool_calls: true,
  },
  tools: [
    {
      type: "function",
      function: {
        name: "calculator",
        description: "Perform calculations",
        parameters: {
          /* JSON Schema */
        },
      },
    },
  ],
};
```

---

### `ModelParams`

Fine-grained model behavior parameters.

Note: Many parameters are model/provider-specific. Some models may ignore or only partially support certain options (e.g., Gemini tool calls limitations, Amazon models not supporting `n`). Always consult the model’s upstream documentation.

**Properties:**

| Property              | Type      | Range   | Default        | Description                                            |
| --------------------- | --------- | ------- | -------------- | ------------------------------------------------------ |
| `maxTokens`           | `number`  | 1-4096+ | `1000`         | Maximum tokens to generate                             |
| `temperature`         | `number`  | 0-2     | Model-specific | Sampling temperature                                   |
| `topP`                | `number`  | 0-1     | `1`            | Nucleus sampling parameter                             |
| `frequencyPenalty`    | `number`  | -2 to 2 | `0`            | Frequency penalty                                      |
| `presencePenalty`     | `number`  | -2 to 2 | `0`            | Presence penalty                                       |
| `n`                   | `number`  | 1-10    | `1`            | Number of completions (not supported by Amazon models) |
| `parallel_tool_calls` | `boolean` | -       | Model-specific | Enable parallel tool execution (OpenAI models)         |

---

### `SAPAIServiceKey`

SAP BTP service key structure.

**Note:** In v2.0+, the service key is provided via the `AICORE_SERVICE_KEY` environment variable (as a JSON string), not as a parameter to `createSAPAIProvider()`.

**Properties:**

| Property          | Type                     | Required | Description                                     |
| ----------------- | ------------------------ | -------- | ----------------------------------------------- |
| `serviceurls`     | `{ AI_API_URL: string }` | Yes      | Service URLs configuration                      |
| `clientid`        | `string`                 | Yes      | OAuth2 client ID                                |
| `clientsecret`    | `string`                 | Yes      | OAuth2 client secret                            |
| `url`             | `string`                 | Yes      | OAuth2 authorization server URL                 |
| `identityzone`    | `string`                 | No       | Identity zone for multi-tenant environments     |
| `identityzoneid`  | `string`                 | No       | Unique identifier for the identity zone         |
| `appname`         | `string`                 | No       | Application name in SAP BTP                     |
| `credential-type` | `string`                 | No       | Type of credential (typically "binding-secret") |

**For setup instructions and examples, see [Environment Setup Guide](./ENVIRONMENT_SETUP.md).**

---

### `MaskingModuleConfig`

Data masking configuration using SAP Data Privacy Integration (DPI).

**Properties:**

| Property            | Type                      | Description                       |
| ------------------- | ------------------------- | --------------------------------- |
| `masking_providers` | `MaskingProviderConfig[]` | List of masking service providers |

---

### `DpiConfig`

SAP Data Privacy Integration masking configuration.

**Properties:**

| Property               | Type                                    | Description                            |
| ---------------------- | --------------------------------------- | -------------------------------------- |
| `type`                 | `'sap_data_privacy_integration'`        | Provider type                          |
| `method`               | `'anonymization' \| 'pseudonymization'` | Masking method                         |
| `entities`             | `DpiEntityConfig[]`                     | Entities to mask                       |
| `allowlist`            | `string[]`                              | Strings that should not be masked      |
| `mask_grounding_input` | `{ enabled?: boolean }`                 | Whether to mask grounding module input |

**Example:**

```typescript
const masking: MaskingModuleConfig = {
  masking_providers: [
    {
      type: "sap_data_privacy_integration",
      method: "anonymization",
      entities: [
        {
          type: "profile-email",
          replacement_strategy: { method: "fabricated_data" },
        },
        {
          type: "profile-person",
          replacement_strategy: { method: "constant", value: "REDACTED" },
        },
        {
          regex: "\\b[0-9]{4}-[0-9]{4}-[0-9]{3,5}\\b",
          replacement_strategy: { method: "constant", value: "ID_REDACTED" },
        },
      ],
      allowlist: ["SAP", "BTP"],
    },
  ],
};
```

---

## Types

### `SAPAIModelId`

Supported model identifiers.

**Note:** The models listed below are representative examples. Actual model availability depends on your SAP AI Core tenant configuration, region, and subscription. Refer to your SAP AI Core configuration or the [SAP AI Core documentation](https://help.sap.com/docs/ai-core) for the definitive list of models available in your environment.

**Type:**

```typescript
type SAPAIModelId =
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
  | "amazon--nova-premier"
  | "amazon--nova-pro"
  | "amazon--nova-lite"
  | "amazon--nova-micro"
  | "amazon--titan-text-lite"
  | "amazon--titan-text-express"
  | "meta--llama3-70b-instruct"
  | "meta--llama3.1-70b-instruct"
  | "mistralai--mistral-large-instruct"
  | "mistralai--mistral-small-instruct"
  | "mistralai--pixtral-large-instruct"
  | "ibm--granite-13b-chat"
  | "alephalpha-pharia-1-7b-control"
  | (string & {}); // Allow custom model IDs
```

---

### `DpiEntities`

Standard entity types recognized by SAP DPI.

**Available Types:**

- `profile-person` - Person names
- `profile-org` - Organization names
- `profile-location` - Locations
- `profile-email` - Email addresses
- `profile-phone` - Phone numbers
- `profile-address` - Physical addresses
- `profile-sapids-internal` - Internal SAP IDs
- `profile-url` - URLs
- `profile-nationalid` - National ID numbers
- `profile-iban` - IBAN numbers
- `profile-ssn` - Social Security Numbers
- `profile-credit-card-number` - Credit card numbers
- `profile-passport` - Passport numbers
- `profile-driverlicense` - Driver's license numbers
- And many more (see type definition)

---

## Classes

### `SAPAIChatLanguageModel`

Implementation of Vercel AI SDK's `LanguageModelV2` interface.

**Properties:**

| Property                      | Type           | Description                    |
| ----------------------------- | -------------- | ------------------------------ |
| `specificationVersion`        | `'v2'`         | API specification version      |
| `defaultObjectGenerationMode` | `'json'`       | Default object generation mode |
| `supportsImageUrls`           | `true`         | Image URL support flag         |
| `supportsStructuredOutputs`   | `true`         | Structured output support      |
| `modelId`                     | `SAPAIModelId` | Current model identifier       |
| `provider`                    | `string`       | Provider name ('sap-ai')       |

**Methods:**

#### `doGenerate(options)`

Generate a single completion (non-streaming).

**Signature:**

```typescript
async doGenerate(
  options: LanguageModelV2CallOptions
): Promise<{
  content: LanguageModelV2Content[];
  finishReason: LanguageModelV2FinishReason;
  usage: LanguageModelV2Usage;
  rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
  warnings: LanguageModelV2CallWarning[];
}>
```

**Example:**

```typescript
const result = await model.doGenerate({
  prompt: [{ role: "user", content: [{ type: "text", text: "Hello!" }] }],
});
```

#### `doStream(options)`

Generate a streaming completion.

**Signature:**

```typescript
async doStream(
  options: LanguageModelV2CallOptions
): Promise<{
  stream: ReadableStream<LanguageModelV2StreamPart>;
  rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
}>
```

**Example:**

```typescript
const { stream } = await model.doStream({
  prompt: [
    { role: "user", content: [{ type: "text", text: "Write a story" }] },
  ],
});
```

---

### Error Handling

The provider uses standard Vercel AI SDK error types for consistent error handling across providers.

#### Error Types

**`APICallError`** - Thrown for HTTP/API errors (from `@ai-sdk/provider`)

Properties:

- `message`: Error description with helpful context
- `statusCode`: HTTP status code (401, 403, 429, 500, etc.)
- `url`: Request URL
- `requestBodyValues`: Request body (for debugging)
- `responseHeaders`: Response headers
- `responseBody`: Raw response body (contains SAP error details)
- `isRetryable`: Whether the error can be retried (true for 429, 5xx)

**`LoadAPIKeyError`** - Thrown for authentication/configuration errors (from `@ai-sdk/provider`)

Properties:

- `message`: Error description with setup instructions

#### SAP-Specific Error Details

SAP AI Core error details are preserved in `APICallError.responseBody` as JSON:

```typescript
{
  error: {
    message: string;
    code?: number;
    location?: string;
    request_id?: string;
  }
}
```

#### Error Handling Examples

```typescript
import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";

try {
  const result = await generateText({
    model: provider("gpt-4o"),
    prompt: "Hello",
  });
} catch (error) {
  if (error instanceof LoadAPIKeyError) {
    // Authentication/setup issue
    console.error("Setup error:", error.message);
    // Check AICORE_SERVICE_KEY environment variable
  } else if (error instanceof APICallError) {
    // API/HTTP error
    console.error("API error:", error.message);
    console.error("Status:", error.statusCode);
    console.error("Retryable:", error.isRetryable);

    // Parse SAP error details
    try {
      const sapError = JSON.parse(error.responseBody);
      console.error("SAP Error Code:", sapError.error.code);
      console.error("Location:", sapError.error.location);
      console.error("Request ID:", sapError.error.request_id);
    } catch {}
  }
}
```

#### Common Error Scenarios

| Status Code | Error Type      | Retryable | Quick Fix                    |
| ----------- | --------------- | --------- | ---------------------------- |
| 401/403     | LoadAPIKeyError | No        | Check `AICORE_SERVICE_KEY`   |
| 404         | APICallError    | No        | Verify model/deployment ID   |
| 429         | APICallError    | Yes       | Automatic retry with backoff |
| 500-504     | APICallError    | Yes       | Automatic retry with backoff |

**For detailed troubleshooting of each error type, see [Troubleshooting Guide](./TROUBLESHOOTING.md).**

---

### `OrchestrationErrorResponse`

Type representing SAP AI SDK error response structure (for advanced usage).

**Type:**

```typescript
type OrchestrationErrorResponse = {
  error:
    | {
        message: string;
        code?: number;
        location?: string;
        request_id?: string;
      }
    | Array<{
        message: string;
        code?: number;
        location?: string;
        request_id?: string;
      }>;
};
```

This type is primarily used internally for error conversion but is exported for advanced use cases.

---

## Utility Functions

### `convertToSAPMessages(prompt)`

Converts Vercel AI SDK prompt format to SAP AI Core message format.

**Signature:**

```typescript
function convertToSAPMessages(prompt: LanguageModelV2Prompt): SAPMessage[];
```

**Parameters:**

- `prompt`: Vercel AI SDK prompt array

**Returns:** SAP AI Core compatible message array

**Supported Features:**

- Text messages (system, user, assistant)
- Multi-modal messages (text + images)
- Tool calls and tool results
- Conversation history

**Throws:** `UnsupportedFunctionalityError` for unsupported message types

**Example:**

```typescript
import { convertToSAPMessages } from "@mymediset/sap-ai-provider";

const prompt = [
  { role: "system", content: "You are helpful" },
  { role: "user", content: "Hello!" },
];

const sapMessages = convertToSAPMessages(prompt);
```

---

### `buildDpiMaskingProvider(config)`

Creates a DPI (Data Privacy Integration) masking provider configuration for anonymizing or pseudonymizing sensitive data.

**Signature:**

```typescript
function buildDpiMaskingProvider(
  config: DpiMaskingConfig,
): DpiMaskingProviderConfig;
```

**Parameters:**

- `config.method`: Masking method - `"anonymization"` or `"pseudonymization"`
- `config.entities`: Array of entity types to mask (strings or objects with replacement strategies)

**Returns:** DPI masking provider configuration object

**Example:**

```typescript
import "dotenv/config"; // Load environment variables
import { buildDpiMaskingProvider } from "@mymediset/sap-ai-provider";

const dpiMasking = buildDpiMaskingProvider({
  method: "anonymization",
  entities: [
    "profile-email",
    "profile-person",
    {
      type: "profile-phone",
      replacement_strategy: { method: "constant", value: "REDACTED" },
    },
  ],
});

const provider = createSAPAIProvider({
  defaultSettings: {
    masking: {
      masking_providers: [dpiMasking],
    },
  },
});
```

---

### `buildAzureContentSafetyFilter(type, config?)`

Creates an Azure Content Safety filter configuration for input or output content filtering.

**Signature:**

```typescript
function buildAzureContentSafetyFilter(
  type: "input" | "output",
  config?: AzureContentSafetyFilterParameters,
): AzureContentSafetyFilterReturnType;
```

**Parameters:**

- `type`: Filter type - `"input"` (before model) or `"output"` (after model)
- `config`: Optional safety levels for each category (default: `ALLOW_SAFE_LOW` for all)
  - `hate`: Hate speech filter level
  - `violence`: Violence content filter level
  - `selfHarm`: Self-harm content filter level
  - `sexual`: Sexual content filter level

**Filter Levels:** `ALLOW_SAFE`, `ALLOW_SAFE_LOW`, `ALLOW_SAFE_LOW_MEDIUM`, or block all

**Returns:** Azure Content Safety filter configuration

**Example:**

```typescript
import "dotenv/config"; // Load environment variables
import { buildAzureContentSafetyFilter } from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider({
  defaultSettings: {
    filtering: {
      input: {
        filters: [
          buildAzureContentSafetyFilter("input", {
            hate: "ALLOW_SAFE",
            violence: "ALLOW_SAFE_LOW_MEDIUM",
            selfHarm: "ALLOW_SAFE",
            sexual: "ALLOW_SAFE",
          }),
        ],
      },
    },
  },
});
```

---

### `buildLlamaGuard38BFilter(type, categories)`

Creates a Llama Guard 3 8B filter configuration for content safety filtering.

**Signature:**

```typescript
function buildLlamaGuard38BFilter(
  type: "input" | "output",
  categories: [LlamaGuard38BCategory, ...LlamaGuard38BCategory[]],
): LlamaGuard38BFilterReturnType;
```

**Parameters:**

- `type`: Filter type - `"input"` or `"output"`
- `categories`: Array of at least one category to filter (e.g., `"hate"`, `"violence"`, `"elections"`)

**Returns:** Llama Guard 3 8B filter configuration

**Example:**

```typescript
import "dotenv/config"; // Load environment variables
import { buildLlamaGuard38BFilter } from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider({
  defaultSettings: {
    filtering: {
      input: {
        filters: [buildLlamaGuard38BFilter("input", ["hate", "violence"])],
      },
    },
  },
});
```

---

### `buildDocumentGroundingConfig(config)`

Creates a document grounding configuration for retrieval-augmented generation (RAG).

**Signature:**

```typescript
function buildDocumentGroundingConfig(
  config: DocumentGroundingServiceConfig,
): GroundingModule;
```

**Parameters:**

- `config`: Document grounding service configuration

**Returns:** Full grounding module configuration

**Example:**

```typescript
import "dotenv/config"; // Load environment variables
import { buildDocumentGroundingConfig } from "@mymediset/sap-ai-provider";

const groundingConfig = buildDocumentGroundingConfig({
  // Document grounding configuration
  // See SAP AI SDK documentation for details
});

const provider = createSAPAIProvider({
  defaultSettings: {
    grounding: groundingConfig,
  },
});
```

---

### `buildTranslationConfig(type, config)`

Creates a translation configuration for input/output translation using SAP Document Translation service.

**Signature:**

```typescript
function buildTranslationConfig(
  type: "input" | "output",
  config: TranslationConfigParams,
): TranslationReturnType;
```

**Parameters:**

- `type`: Translation type - `"input"` (before model) or `"output"` (after model)
- `config`: Translation configuration
  - `sourceLanguage`: Source language code (auto-detected if omitted)
  - `targetLanguage`: Target language code (required)
  - `translateMessagesHistory`: Whether to translate message history (optional)

**Returns:** SAP Document Translation configuration

**Example:**

```typescript
import "dotenv/config"; // Load environment variables
import { buildTranslationConfig } from "@mymediset/sap-ai-provider";

// Translate user input from German to English
const inputTranslation = buildTranslationConfig("input", {
  sourceLanguage: "de-DE",
  targetLanguage: "en-US",
});

// Translate model output from English to German
const outputTranslation = buildTranslationConfig("output", {
  targetLanguage: "de-DE",
});

const provider = createSAPAIProvider({
  defaultSettings: {
    translation: {
      input: inputTranslation,
      output: outputTranslation,
    },
  },
});
```

---

## Response Formats

### Text Response

**Type:**

```typescript
{
  type: "text";
}
```

Default response format for text-only outputs.

---

### JSON Object Response

**Type:**

```typescript
{
  type: "json_object";
}
```

Instructs the model to return valid JSON.

---

### JSON Schema Response

**Type:**

```typescript
{
  type: 'json_schema';
  json_schema: {
    name: string;
    description?: string;
    schema?: unknown;
    strict?: boolean | null;
  };
}
```

Instructs the model to follow a specific JSON schema.

**Example:**

```typescript
const settings: SAPAISettings = {
  responseFormat: {
    type: "json_schema",
    json_schema: {
      name: "user_profile",
      description: "User profile information",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      },
      strict: true,
    },
  },
};
```

---

## Environment Variables

| Variable             | Description                                 | Required    |
| -------------------- | ------------------------------------------- | ----------- |
| `AICORE_SERVICE_KEY` | SAP AI Core service key JSON (local)        | Yes (local) |
| `VCAP_SERVICES`      | Service bindings (auto-detected on SAP BTP) | Yes (BTP)   |

---

## Error Codes

Complete reference for HTTP status codes returned by SAP AI Core. For detailed troubleshooting of each error, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

### Error Code Reference Table

| Code | Description           | Type            | Retryable | Common Causes                         | Quick Fix                                       | Details                                                                               |
| ---- | --------------------- | --------------- | --------- | ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| 400  | Bad Request           | APICallError    | No        | Invalid parameters, malformed request | Validate configuration against TypeScript types | [→ Troubleshooting](./TROUBLESHOOTING.md#problem-400-bad-request)                     |
| 401  | Unauthorized          | LoadAPIKeyError | No        | Invalid/expired token                 | Check AICORE_SERVICE_KEY environment variable   | [→ Troubleshooting](./TROUBLESHOOTING.md#problem-authentication-failed-or-401-errors) |
| 403  | Forbidden             | APICallError    | No        | Insufficient permissions              | Verify service key has required roles           | [→ Troubleshooting](./TROUBLESHOOTING.md#problem-403-forbidden)                       |
| 404  | Not Found             | APICallError    | No        | Invalid model ID or deployment        | Verify deployment ID and model name             | [→ Troubleshooting](./TROUBLESHOOTING.md#problem-404-modeldeployment-not-found)       |
| 429  | Too Many Requests     | APICallError    | Yes       | Rate limit exceeded                   | Automatic retry with exponential backoff        | [→ Troubleshooting](./TROUBLESHOOTING.md#problem-429-rate-limit-exceeded)             |
| 500  | Internal Server Error | APICallError    | Yes       | Service issue                         | Automatic retry, check SAP AI Core status       | [→ Troubleshooting](./TROUBLESHOOTING.md#problem-500502503504-server-errors)          |
| 502  | Bad Gateway           | APICallError    | Yes       | Network/proxy issue                   | Automatic retry                                 | [→ Troubleshooting](./TROUBLESHOOTING.md#problem-500502503504-server-errors)          |
| 503  | Service Unavailable   | APICallError    | Yes       | Service temporarily down              | Automatic retry                                 | [→ Troubleshooting](./TROUBLESHOOTING.md#problem-500502503504-server-errors)          |
| 504  | Gateway Timeout       | APICallError    | Yes       | Request timeout                       | Automatic retry, reduce request complexity      | [→ Troubleshooting](./TROUBLESHOOTING.md#problem-500502503504-server-errors)          |

### Error Handling Strategy

The provider automatically handles retryable errors (429, 500-504) with exponential backoff. For non-retryable errors, your application should handle them appropriately.

**See also:**

- [Error Handling Examples](#error-handling) - Code examples for catching and handling errors
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Detailed solutions for each error type

---

## Version Information

For the current package version, see [package.json](./package.json).

### Dependencies

- **Vercel AI SDK:** v6.0+ (`ai` package)
- **SAP AI SDK:** ^2.4.0 (`@sap-ai-sdk/orchestration`)
- **Node.js:** >= 18

> **Note:** For exact dependency versions, always refer to `package.json` in the repository root.

---

## Related Documentation

- [README.md](./README.md) - Getting started, quick start, and feature overview
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Authentication setup and environment configuration
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Migration from v1.x with troubleshooting
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Internal architecture, component design, and request flows
- [CURL_API_TESTING_GUIDE.md](./CURL_API_TESTING_GUIDE.md) - Low-level API testing and debugging
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Development setup and contribution guidelines
