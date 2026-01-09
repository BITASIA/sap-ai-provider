# API Reference

Complete API documentation for the SAP AI Core Provider.

## Table of Contents

- [Provider Factory Functions](#provider-factory-functions)
- [Interfaces](#interfaces)
- [Types](#types)
- [Classes](#classes)
- [Utility Functions](#utility-functions)

---

## Provider Factory Functions

### `createSAPAIProvider(options?)`

Creates an SAP AI Core provider instance with automatic OAuth2 authentication.

**Signature:**

```typescript
async function createSAPAIProvider(
  options?: SAPAIProviderSettings,
): Promise<SAPAIProvider>;
```

**Parameters:**

- `options` (optional): `SAPAIProviderSettings` - Configuration options

**Returns:** `Promise<SAPAIProvider>` - Configured provider instance

**Example:**

```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  deploymentId: "d65d81e7c077e583",
  resourceGroup: "default",
});

const model = provider("gpt-4o");
```

---

### `createSAPAIProviderSync(options)`

Creates an SAP AI Core provider instance synchronously using a pre-acquired token.

**Signature:**

```typescript
function createSAPAIProviderSync(
  options: Omit<SAPAIProviderSettings, "serviceKey"> & { token: string },
): SAPAIProvider;
```

**Parameters:**

- `options.token` (required): `string` - Pre-acquired OAuth2 access token
- `options.baseURL` (optional): `string` - Custom API base URL
- `options.deploymentId` (optional): `string` - SAP AI Core deployment ID
- `options.resourceGroup` (optional): `string` - Resource group name
- `options.completionPath` (optional): `string` - Custom completion endpoint path
- `options.headers` (optional): `Record<string, string>` - Custom HTTP headers
- `options.fetch` (optional): `typeof fetch` - Custom fetch implementation
- `options.defaultSettings` (optional): `SAPAISettings` - Default model settings

**Returns:** `SAPAIProvider` - Configured provider instance

**Use Case:** When you manage OAuth2 tokens yourself or need synchronous initialization.

**Example:**

```typescript
const token = await getMyOAuthToken();
const provider = createSAPAIProviderSync({
  token,
  deploymentId: "my-deployment",
});
```

---

### `sapai`

Default provider instance that uses the `SAP_AI_TOKEN` environment variable.

**Type:** `SAPAIProvider`

**Usage:**

```typescript
import { sapai } from "@mymediset/sap-ai-provider";

// Requires SAP_AI_TOKEN environment variable
const model = sapai("gpt-4o");
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

| Property          | Type                        | Default                                     | Description                                  |
| ----------------- | --------------------------- | ------------------------------------------- | -------------------------------------------- |
| `serviceKey`      | `string \| SAPAIServiceKey` | -                                           | SAP AI Core service key (JSON or object)     |
| `token`           | `string`                    | -                                           | Direct OAuth2 access token                   |
| `deploymentId`    | `string`                    | `'d65d81e7c077e583'`                        | SAP AI Core deployment ID                    |
| `resourceGroup`   | `string`                    | `'default'`                                 | Resource group for isolation                 |
| `baseURL`         | `string`                    | Auto-detected                               | Custom API base URL                          |
| `completionPath`  | `string`                    | `/inference/deployments/{id}/v2/completion` | Completion endpoint path                     |
| `headers`         | `Record<string, string>`    | `{}`                                        | Custom HTTP headers                          |
| `fetch`           | `typeof fetch`              | `globalThis.fetch`                          | Custom fetch implementation                  |
| `defaultSettings` | `SAPAISettings`             | -                                           | Default model settings applied to all models |

**Example:**

```typescript
const settings: SAPAIProviderSettings = {
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  deploymentId: "custom-deployment",
  resourceGroup: "production",
  headers: {
    "X-App-Version": "1.0.0",
  },
  defaultSettings: {
    modelParams: {
      temperature: 0.7,
    },
  },
};
```

---

### `SAPAISettings`

Model-specific configuration options.

**Properties:**

| Property            | Type                   | Default    | Description                      |
| ------------------- | ---------------------- | ---------- | -------------------------------- |
| `modelVersion`      | `string`               | `'latest'` | Specific model version           |
| `modelParams`       | `ModelParams`          | -          | Model generation parameters      |
| `safePrompt`        | `boolean`              | `true`     | Enable safe prompt filtering     |
| `structuredOutputs` | `boolean`              | `false`    | Enable structured output format  |
| `masking`           | `MaskingModuleConfig`  | -          | Data masking configuration (DPI) |
| `responseFormat`    | `ResponseFormatConfig` | -          | Response format specification    |

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
  safePrompt: true,
  structuredOutputs: true,
};
```

---

### `ModelParams`

Fine-grained model behavior parameters.

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

**Example:**

```typescript
const serviceKey: SAPAIServiceKey = {
  serviceurls: {
    AI_API_URL: "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com",
  },
  clientid: "sb-...",
  clientsecret: "...",
  url: "https://....authentication.eu10.hana.ondemand.com",
  identityzone: "...",
  appname: "my-app",
  "credential-type": "binding-secret",
};
```

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
  request: { body: unknown };
  response: { timestamp: Date; modelId: string };
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
  request: { body: unknown };
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

### Error Types

This provider throws standard Vercel AI SDK errors.

- Use `LoadAPIKeyError` for authentication/setup issues.
- Use `APICallError` for HTTP/API errors; SAP-specific details are preserved in `responseBody`.

**Example:**

```typescript
import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";

try {
  await generateText({ model, prompt: "Hello" });
} catch (error) {
  if (error instanceof LoadAPIKeyError) {
    console.error("Credentials error:", error.message);
  } else if (error instanceof APICallError) {
    console.error("Status:", error.statusCode);
    console.error("Retryable:", error.isRetryable);
    console.error("SAP responseBody:", error.responseBody);
  }
}
```

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

| Variable                | Description                        | Required                     |
| ----------------------- | ---------------------------------- | ---------------------------- |
| `SAP_AI_SERVICE_KEY`    | Full JSON service key from SAP BTP | No (if token provided)       |
| `SAP_AI_TOKEN`          | Direct OAuth2 access token         | No (if service key provided) |
| `SAP_AI_BASE_URL`       | Custom API base URL                | No                           |
| `SAP_AI_DEPLOYMENT_ID`  | Custom deployment ID               | No                           |
| `SAP_AI_RESOURCE_GROUP` | Custom resource group              | No                           |

---

## Error Codes

Common HTTP status codes returned by SAP AI Core:

| Code | Description           | Retryable | Common Causes                         |
| ---- | --------------------- | --------- | ------------------------------------- |
| 400  | Bad Request           | No        | Invalid parameters, malformed request |
| 401  | Unauthorized          | No        | Invalid/expired token                 |
| 403  | Forbidden             | No        | Insufficient permissions              |
| 404  | Not Found             | No        | Invalid model ID or deployment        |
| 429  | Too Many Requests     | Yes       | Rate limit exceeded                   |
| 500  | Internal Server Error | Yes       | Service issue                         |
| 502  | Bad Gateway           | Yes       | Network/proxy issue                   |
| 503  | Service Unavailable   | Yes       | Service temporarily down              |
| 504  | Gateway Timeout       | Yes       | Request timeout                       |

---

## Version Information

- **API Version:** v2 (with v1 legacy support)
- **SDK Version:** Vercel AI SDK v5+
- **Node Version:** >= 18

---

## Related Documentation

- [README.md](./README.md) - Getting started guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Internal architecture
- [TESTING.md](./TESTING.md) - Testing guide
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
