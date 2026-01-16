# API Reference

Complete API documentation for the SAP AI Core Provider.

## Terminology

To avoid confusion, this documentation uses the following terminology
consistently:

- **SAP AI Core** - The SAP BTP service that provides AI model hosting and
  orchestration (the cloud service)
- **SAP AI SDK** - The official `@sap-ai-sdk/orchestration` npm package used for
  API communication
- **SAP AI Core Provider** or **this provider** - This npm package
  (`@mymediset/sap-ai-provider`)
- **Tool calling** - The capability of models to invoke external functions
  (equivalent to "function calling")

## Table of Contents

- [Terminology](#terminology)
- [Provider Factory Functions](#provider-factory-functions)
  - [`createSAPAIProvider(options?)`](#createsapaiprovideroptions)
  - [`sapai`](#sapai)
- [Models](#models)
  - [Supported Models](#supported-models)
  - [Model Capabilities Comparison](#model-capabilities-comparison)
  - [Model Selection Guide by Use Case](#model-selection-guide-by-use-case)
  - [Performance vs Quality Trade-offs](#performance-vs-quality-trade-offs)
- [Tool Calling (Function Calling)](#tool-calling-function-calling)
  - [Overview](#overview)
  - [Basic Tool Calling Example](#basic-tool-calling-example)
  - [Model-Specific Tool Limitations](#model-specific-tool-limitations)
  - [Tool Definition Format](#tool-definition-format)
  - [Parallel Tool Calls](#parallel-tool-calls)
  - [Multi-Turn Tool Conversations](#multi-turn-tool-conversations)
  - [Error Handling with Tools](#error-handling-with-tools)
  - [Streaming with Tools](#streaming-with-tools)
  - [Advanced: Tool Choice Control](#advanced-tool-choice-control)
  - [Best Practices](#best-practices)
  - [Related Documentation](#related-documentation)
- [Interfaces](#interfaces)
  - [`SAPAIProvider`](#sapaiprovider)
    - [`provider(modelId, settings?)`](#providermodelid-settings)
    - [`provider.chat(modelId, settings?)`](#providerchatmodelid-settings)
  - [`SAPAIProviderSettings`](#sapaiprovidersettings)
  - [`SAPAISettings`](#sapaisettings)
  - [`ModelParams`](#modelparams)
  - [`SAPAIServiceKey`](#sapaiservicekey)
  - [`MaskingModuleConfig`](#maskingmoduleconfig)
  - [`DpiConfig`](#dpiconfig)
- [Types](#types)
  - [`SAPAIModelId`](#sapaimodelid)
  - [`DpiEntities`](#dpientities)
- [Classes](#classes)
  - [`SAPAILanguageModel`](#sapailanguagemodel)
    - [`doGenerate(options)`](#dogenerateoptions)
    - [`doStream(options)`](#dostreamoptions)
  - [Error Handling & Reference](#error-handling-reference)
    - [Error Types](#error-types)
    - [SAP-Specific Error Details](#sap-specific-error-details)
    - [Error Handling Examples](#error-handling-examples)
    - [HTTP Status Code Reference](#http-status-code-reference)
    - [Error Handling Strategy](#error-handling-strategy)
  - [`OrchestrationErrorResponse`](#orchestrationerrorresponse)
- [Utility Functions](#utility-functions)
  - [`convertToSAPMessages(prompt)`](#converttosapmessagesprompt)
  - [`buildDpiMaskingProvider(config)`](#builddpimaskingproviderconfig)
  - [`buildAzureContentSafetyFilter(type, config?)`](#buildazurecontentsafetyfiltertype-config)
  - [`buildLlamaGuard38BFilter(type, categories)`](#buildllamaguard38bfiltertype-categories)
  - [`buildDocumentGroundingConfig(config)`](#builddocumentgroundingconfigconfig)
  - [`buildTranslationConfig(type, config)`](#buildtranslationconfigtype-config)
- [Response Formats](#response-formats)
  - [Text Response](#text-response)
  - [JSON Object Response](#json-object-response)
  - [JSON Schema Response](#json-schema-response)
- [Environment Variables](#environment-variables)
- [Version Information](#version-information)
  - [Dependencies](#dependencies)
- [Related Documentation](#related-documentation-1)

## Provider Factory Functions

> **Architecture Context:** For provider factory pattern implementation details,
> see [Architecture - Provider Pattern](./ARCHITECTURE.md#provider-pattern).

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

### `sapai`

Default SAP AI provider instance with automatic configuration.

**Type:**

```typescript
const sapai: SAPAIProvider;
```

**Description:**

A pre-configured provider instance that uses automatic authentication from:

- `AICORE_SERVICE_KEY` environment variable (local development)
- `VCAP_SERVICES` service binding (SAP BTP Cloud Foundry)

This is the quickest way to get started without explicit provider creation.

**Example:**

```typescript
import "dotenv/config"; // Load environment variables
import { sapai } from "@mymediset/sap-ai-provider";
import { generateText } from "ai";
import { APICallError } from "@ai-sdk/provider";

try {
  // Use directly without creating a provider
  const result = await generateText({
    model: sapai("gpt-4o"),
    prompt: "Explain quantum computing",
  });

  console.log(result.text);
} catch (error) {
  if (error instanceof APICallError) {
    console.error("API error:", error.message, "- Status:", error.statusCode);
  }
  throw error;
}
```

**When to use:**

- ✅ Quick prototypes and simple applications
- ✅ Default configuration is sufficient
- ✅ No need for custom resource groups or deployment IDs

**When to use `createSAPAIProvider()` instead:**

- Need custom `resourceGroup` or `deploymentId`
- Want explicit configuration control
- Need multiple provider instances with different settings

---

## Models

> **Architecture Context:** For model integration and message conversion
> details, see [Architecture - Model Support](./ARCHITECTURE.md#model-support).

### Supported Models

The SAP AI Core Provider supports all models available through SAP AI Core's
Orchestration service via the `@sap-ai-sdk/orchestration` package.

> **Note:** The models listed below are representative examples. Actual model
> availability depends on your SAP AI Core tenant configuration, region, and
> subscription. Refer to your SAP AI Core configuration or the
> [SAP AI Core documentation](https://help.sap.com/docs/ai-core) for the
> definitive list of models available in your environment.

**About Model Availability:**

This library re-exports the `ChatModel` type from `@sap-ai-sdk/orchestration`,
which is dynamically maintained by SAP AI SDK. The actual list of available
models depends on:

- Your SAP AI Core tenant configuration
- Your region and subscription
- Currently deployed models in your environment

**Representative Model Examples** (non-exhaustive):

**OpenAI (Azure):**

- `gpt-4o`, `gpt-4o-mini` - Latest GPT-4 with vision & tools (recommended)
- `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` - Latest GPT-4 variants
- `o1`, `o3`, `o3-mini`, `o4-mini` - Reasoning models

**Google Vertex AI:**

- `gemini-2.0-flash`, `gemini-2.0-flash-lite` - Fast inference
- `gemini-2.5-flash`, `gemini-2.5-pro` - Latest Gemini
- ⚠️ **Important**: Gemini models support **only 1 tool per request**

**Anthropic (AWS Bedrock):**

- `anthropic--claude-3.5-sonnet`, `anthropic--claude-3.7-sonnet` - Enhanced
  Claude 3
- `anthropic--claude-4-sonnet`, `anthropic--claude-4-opus` - Latest Claude 4

**Amazon Bedrock:**

- `amazon--nova-pro`, `amazon--nova-lite`, `amazon--nova-micro`,
  `amazon--nova-premier`

**Open Source (AI Core):**

- `mistralai--mistral-large-instruct`, `mistralai--mistral-small-instruct`
- `meta--llama3.1-70b-instruct`
- `cohere--command-a-reasoning`

**Discovering Available Models:**

To list models available in your SAP AI Core tenant:

```bash
# Get access token
export TOKEN=$(curl -X POST "https://<AUTH_URL>/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=<CLIENT_ID>" \
  -d "client_secret=<CLIENT_SECRET>" | jq -r '.access_token')

# List deployments
curl "https://<AI_API_URL>/v2/lm/deployments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "AI-Resource-Group: default" | jq '.resources[].details.resources.backend_details.model.name'
```

Or use **SAP AI Launchpad UI**:

1. Navigate to ML Operations → Deployments
2. Filter by "Orchestration" scenario
3. View available model configurations

**See Also:**

- [SAP AI Core Models Documentation](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/models-and-scenarios)
- [Model Capabilities Comparison](#model-capabilities-comparison) (below)

**⚠️ Important Model Limitations:**

- **Gemini models** (all versions): Support **only 1 tool per request**. For
  applications requiring multiple tools, use OpenAI models (gpt-4o, gpt-4.1) or
  Claude models instead.
- **Amazon models**: Do not support the `n` parameter (number of completions).
- See
  [CURL_API_TESTING_GUIDE.md - Tool Calling](./CURL_API_TESTING_GUIDE.md#tool-calling-example)
  for complete model capabilities comparison.

### Model Capabilities Comparison

Quick reference for choosing the right model for your use case:

| Model Family    | Tool Calling | Vision | Streaming | Max Tools  | Max Tokens | Notes                           |
| --------------- | ------------ | ------ | --------- | ---------- | ---------- | ------------------------------- |
| **GPT-4o**      | ✅           | ✅     | ✅        | Unlimited  | 16,384     | **Recommended** - Full features |
| **GPT-4o-mini** | ✅           | ✅     | ✅        | Unlimited  | 16,384     | Fast, cost-effective            |
| **GPT-4.1**     | ✅           | ✅     | ✅        | Unlimited  | 16,384     | Latest GPT-4                    |
| **Gemini 2.0**  | ⚠️           | ✅     | ✅        | **1 only** | 32,768     | Tool limitation                 |
| **Gemini 1.5**  | ⚠️           | ✅     | ✅        | **1 only** | 32,768     | Tool limitation                 |
| **Claude 3.5**  | ✅           | ✅     | ✅        | Unlimited  | 8,192      | High quality                    |
| **Claude 4**    | ✅           | ✅     | ✅        | Unlimited  | 8,192      | Latest Claude                   |
| **Amazon Nova** | ✅           | ✅     | ✅        | Unlimited  | 8,192      | No `n` parameter support        |
| **o1/o3**       | ⚠️           | ❌     | ✅        | Limited    | 16,384     | Reasoning models                |
| **Llama 3.1**   | ✅           | ❌     | ✅        | Unlimited  | 8,192      | Open source                     |
| **Mistral**     | ✅           | ⚠️     | ✅        | Unlimited  | 8,192      | Pixtral has vision              |

**Legend:**

- ✅ Fully supported
- ⚠️ Limited support (see notes)
- ❌ Not supported

**Choosing a model:**

- **Multiple tools required?** → Use GPT-4o, Claude, or Amazon Nova (avoid
  Gemini)
- **Vision needed?** → Use GPT-4o, Gemini, Claude, or Pixtral
- **Cost-sensitive?** → Use GPT-4o-mini or Gemini Flash
- **Maximum context?** → Use Gemini (32k tokens)
- **Open source?** → Use Llama or Mistral

### Model Selection Guide by Use Case

Quick reference for selecting models based on your application requirements:

| Use Case                      | Recommended Models                            | Avoid                         | Notes                                |
| ----------------------------- | --------------------------------------------- | ----------------------------- | ------------------------------------ |
| **Multi-tool applications**   | GPT-4o, GPT-4.1, Claude 3.5+, Amazon Nova     | Gemini (all versions)         | Gemini limited to 1 tool per request |
| **Vision + multi-modal**      | GPT-4o, GPT-4.1, Gemini 2.0, Claude 3.5+      | Llama, o1/o3 reasoning models | Best image understanding             |
| **Cost-effective production** | GPT-4o-mini, Gemini 2.0 Flash, Claude 3 Haiku | GPT-4.1, Claude 4 Opus        | Balance of quality and cost          |
| **Long context (>8k tokens)** | Gemini 1.5/2.0 (32k), GPT-4o/4.1 (16k)        | Older GPT-4, Amazon models    | Check token limits                   |
| **Reasoning-heavy tasks**     | o1, o3, Claude 4 Opus, GPT-4.1                | Fast/Mini variants            | Slower but higher quality            |
| **Real-time streaming**       | GPT-4o-mini, Gemini Flash, Claude Haiku       | o1/o3 reasoning models        | Optimized for low latency            |
| **Open-source/self-hosted**   | Llama 3.1, Mistral Large                      | Proprietary models            | Deployment flexibility               |
| **Enterprise compliance**     | Amazon Nova, Claude 4, GPT-4.1                | Community models              | Better audit trails                  |

### Performance vs Quality Trade-offs

| Model Tier                                           | Speed    | Quality    | Cost     | Best For                         |
| ---------------------------------------------------- | -------- | ---------- | -------- | -------------------------------- |
| **Nano/Micro** (GPT-4.1-nano, Nova-micro)            | ⚡⚡⚡⚡ | ⭐⭐       | 💰       | Simple classification, keywords  |
| **Mini/Lite** (GPT-4o-mini, Gemini Flash, Nova-lite) | ⚡⚡⚡   | ⭐⭐⭐     | 💰💰     | Production apps, chat, summaries |
| **Standard** (GPT-4o, Claude 3.5, Gemini Pro)        | ⚡⚡     | ⭐⭐⭐⭐   | 💰💰💰   | Complex reasoning, analysis      |
| **Premium** (Claude 4 Opus, GPT-4.1, o3)             | ⚡       | ⭐⭐⭐⭐⭐ | 💰💰💰💰 | Research, critical decisions     |

---

## Tool Calling (Function Calling)

Tool calling enables AI models to invoke functions and use external tools during
text generation. This is essential for building agentic AI applications that can
perform actions like database queries, API calls, calculations, or data
retrieval.

### Overview

When you provide tools to the model, it can decide to call one or more tools
based on the conversation context. The provider handles:

- Converting tool definitions to SAP AI Core format
- Parsing tool call responses from the AI model
- Managing multi-turn conversations with tool results
- Handling parallel tool calls (model-dependent)

### Basic Tool Calling Example

```typescript
import { generateText } from "ai";
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { z } from "zod";

const provider = createSAPAIProvider();

const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "What's the weather in Tokyo and 5+3?",
  tools: {
    getWeather: {
      description: "Get weather for a city",
      parameters: z.object({
        city: z.string().describe("City name"),
      }),
      execute: async ({ city }) => {
        // Your implementation
        return { temp: 72, conditions: "sunny" };
      },
    },
    calculator: {
      description: "Perform calculations",
      parameters: z.object({
        expression: z.string().describe("Math expression"),
      }),
      execute: async ({ expression }) => {
        return { result: eval(expression) };
      },
    },
  },
});

console.log(result.text); // "It's sunny and 72°F in Tokyo. 5+3 equals 8."
console.log(result.toolCalls); // Array of tool invocations
console.log(result.toolResults); // Array of tool results
```

### Model-Specific Tool Limitations

⚠️ **Important:** Not all models support tool calling equally:

| Model Family   | Tool Support | Max Tools  | Parallel Calls | Notes                                   |
| -------------- | ------------ | ---------- | -------------- | --------------------------------------- |
| GPT-4o/4.1     | ✅ Full      | Unlimited  | ✅ Yes         | Recommended for multi-tool applications |
| GPT-4o-mini    | ✅ Full      | Unlimited  | ✅ Yes         | Cost-effective with full tool support   |
| Claude 3.5/4   | ✅ Full      | Unlimited  | ✅ Yes         | Excellent tool calling accuracy         |
| Amazon Nova    | ✅ Full      | Unlimited  | ✅ Yes         | Full support across all Nova variants   |
| **Gemini 1.5** | ⚠️ Limited   | **1 only** | ❌ No          | Single tool per request limitation      |
| **Gemini 2.0** | ⚠️ Limited   | **1 only** | ❌ No          | Single tool per request limitation      |
| Llama 3.1      | ✅ Full      | Unlimited  | ⚠️ Limited     | Varies by deployment                    |
| Mistral        | ✅ Full      | Unlimited  | ✅ Yes         | Good tool calling support               |
| o1/o3          | ⚠️ Limited   | Limited    | ❌ No          | Reasoning models have tool restrictions |

**Key Takeaway:** For applications requiring multiple tools, use **GPT-4o**,
**Claude**, or **Amazon Nova** models. Avoid Gemini for multi-tool scenarios.

### Tool Definition Format

Tools are defined using Zod schemas (recommended) or JSON Schema:

```typescript
import { z } from "zod";

// Zod schema (recommended)
const weatherTool = {
  description: "Get current weather for a location",
  parameters: z.object({
    city: z.string().describe("City name"),
    units: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  execute: async ({ city, units }) => {
    // Implementation
  },
};

// JSON Schema (alternative)
const calculatorTool = {
  type: "function",
  function: {
    name: "calculator",
    description: "Perform mathematical calculations",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Math expression to evaluate",
        },
      },
      required: ["expression"],
    },
  },
  execute: async (params) => {
    // Implementation
  },
};
```

### Parallel Tool Calls

Some models (GPT-4o, Claude, Amazon Nova) can call multiple tools
simultaneously:

```typescript
const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "What's the weather in Tokyo, London, and Paris?",
  tools: { getWeather },
  modelParams: {
    parallel_tool_calls: true, // Enable parallel execution
  },
});

// Model can call getWeather 3 times in parallel
```

⚠️ **Important:** Set `parallel_tool_calls: false` when using Gemini models or
when tool execution order matters.

### Multi-Turn Tool Conversations

The AI SDK automatically handles multi-turn conversations when tools are
involved:

```typescript
const result = await generateText({
  model: provider("gpt-4o"),
  messages: [
    { role: "user", content: "Book a flight to Paris" },
  ],
  tools: {
    searchFlights: {
      description: "Search for available flights",
      parameters: z.object({
        destination: z.string(),
        date: z.string(),
      }),
      execute: async ({ destination, date }) => {
        return { flights: [...] };
      },
    },
    bookFlight: {
      description: "Book a specific flight",
      parameters: z.object({
        flightId: z.string(),
      }),
      execute: async ({ flightId }) => {
        return { confirmation: "ABC123" };
      },
    },
  },
});

// Conversation flow:
// 1. User: "Book a flight to Paris"
// 2. Model calls: searchFlights({ destination: "Paris", date: "..." })
// 3. Model receives: { flights: [...] }
// 4. Model calls: bookFlight({ flightId: "..." })
// 5. Model receives: { confirmation: "ABC123" }
// 6. Model responds: "Your flight is booked. Confirmation: ABC123"
```

### Error Handling with Tools

Handle tool execution errors gracefully:

```typescript
const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "What's the weather?",
  tools: {
    getWeather: {
      description: "Get weather",
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => {
        try {
          const response = await fetch(`https://api.weather.com/${city}`);
          if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
          }
          return await response.json();
        } catch (error) {
          // Return error message that the model can understand
          return {
            error: true,
            message: `Failed to get weather: ${error.message}`,
          };
        }
      },
    },
  },
});
```

### Streaming with Tools

Tool calls work with streaming responses:

```typescript
const result = await streamText({
  model: provider("gpt-4o"),
  prompt: "Calculate 5+3 and tell me about it",
  tools: { calculator },
});

for await (const part of result.textStream) {
  process.stdout.write(part); // Stream text as it's generated
}

console.log(result.toolCalls); // Available after stream completes
```

### Advanced: Tool Choice Control

Control when the model should use tools:

```typescript
const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "What's 5+3?",
  tools: { calculator },
  toolChoice: "required", // Force tool usage
  // toolChoice: "auto" // (default) Let model decide
  // toolChoice: "none" // Disable tools for this request
});
```

### Best Practices

1. **Model Selection:** Use GPT-4o, Claude, or Amazon Nova for multi-tool
   applications
2. **Tool Descriptions:** Write clear, specific descriptions of what each tool
   does
3. **Parameter Schemas:** Use descriptive field names and include descriptions
4. **Error Handling:** Return error objects that models can interpret, not just
   throw exceptions
5. **Tool Naming:** Use camelCase names (e.g., `getWeather`, not `get_weather`)
6. **Parallel Calls:** Enable only when tool execution order doesn't matter
7. **Testing:** Test with Gemini to ensure your app works with the 1-tool
   limitation

### Related Documentation

- [CURL_API_TESTING_GUIDE.md - Tool Calling Examples](./CURL_API_TESTING_GUIDE.md#tool-calling-example) -
  Direct API testing
- [ARCHITECTURE.md - Tool Calling Flow](./ARCHITECTURE.md#tool-calling-flow) -
  Internal implementation details
- [Vercel AI SDK - Tool Calling Docs](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling) -
  Upstream documentation

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
(modelId: SAPAIModelId, settings?: SAPAISettings): SAPAILanguageModel
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

Explicit method for creating chat models (equivalent to calling provider
function).

**Signature:**

```typescript
chat(modelId: SAPAIModelId, settings?: SAPAISettings): SAPAILanguageModel
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

Note: Many parameters are model/provider-specific. Some models may ignore or
only partially support certain options (e.g., Gemini tool calls limitations,
Amazon models not supporting `n`). Always consult the model’s upstream
documentation.

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

> **Note:** In v2.0+, the service key is provided via the `AICORE_SERVICE_KEY`
> environment variable (as a JSON string), not as a parameter to
> `createSAPAIProvider()`.

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

**For setup instructions and examples, see
[Environment Setup Guide](./ENVIRONMENT_SETUP.md).**

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

Model identifier type for SAP AI Core models.

**Type:**

```typescript
export type SAPAIModelId = ChatModel; // Re-exported from @sap-ai-sdk/orchestration
```

**Description:**

Re-exports the `ChatModel` type from `@sap-ai-sdk/orchestration`, which is
dynamically maintained by SAP AI SDK.

**For complete model information, see the [Models](#models) section above**,
including:

- Available model list (OpenAI, Google, Anthropic, Amazon, Open Source)
- Model capabilities comparison
- Selection guide by use case
- Performance trade-offs

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

### `SAPAILanguageModel`

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
  prompt: [{ role: "user", content: [{ type: "text", text: "Write a story" }] }],
});
```

---

### Error Handling & Reference

> **Architecture Details:** For internal error conversion logic and retry
> mechanisms, see
> [Architecture - Error Handling](./ARCHITECTURE.md#error-handling).

The provider uses standard Vercel AI SDK error types for consistent error
handling across providers.

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

**`LoadAPIKeyError`** - Thrown for authentication/configuration errors (from
`@ai-sdk/provider`)

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

#### HTTP Status Code Reference

Complete reference for status codes returned by SAP AI Core:

| Code | Description           | Error Type        | Auto-Retry | Common Causes                  | Recommended Action                              | Guide                                                                       |
| :--: | :-------------------- | :---------------- | :--------: | :----------------------------- | :---------------------------------------------- | :-------------------------------------------------------------------------- |
| 400  | Bad Request           | `APICallError`    |     ❌     | Invalid parameters             | Validate configuration against TypeScript types | [→ Guide](./TROUBLESHOOTING.md#problem-400-bad-request)                     |
| 401  | Unauthorized          | `LoadAPIKeyError` |     ❌     | Invalid/expired credentials    | Check `AICORE_SERVICE_KEY` environment variable | [→ Guide](./TROUBLESHOOTING.md#problem-authentication-failed-or-401-errors) |
| 403  | Forbidden             | `APICallError`    |     ❌     | Insufficient permissions       | Verify service key has required roles           | [→ Guide](./TROUBLESHOOTING.md#problem-403-forbidden)                       |
| 404  | Not Found             | `APICallError`    |     ❌     | Invalid model ID or deployment | Verify deployment ID and model name             | [→ Guide](./TROUBLESHOOTING.md#problem-404-modeldeployment-not-found)       |
| 429  | Too Many Requests     | `APICallError`    |     ✅     | Rate limit exceeded            | Automatic exponential backoff                   | [→ Guide](./TROUBLESHOOTING.md#problem-429-rate-limit-exceeded)             |
| 500  | Internal Server Error | `APICallError`    |     ✅     | Service issue                  | Automatic retry, check SAP AI Core status       | [→ Guide](./TROUBLESHOOTING.md#problem-500502503504-server-errors)          |
| 502  | Bad Gateway           | `APICallError`    |     ✅     | Network/proxy issue            | Automatic retry                                 | [→ Guide](./TROUBLESHOOTING.md#problem-500502503504-server-errors)          |
| 503  | Service Unavailable   | `APICallError`    |     ✅     | Service temporarily down       | Automatic retry                                 | [→ Guide](./TROUBLESHOOTING.md#problem-500502503504-server-errors)          |
| 504  | Gateway Timeout       | `APICallError`    |     ✅     | Request timeout                | Automatic retry, reduce request complexity      | [→ Guide](./TROUBLESHOOTING.md#problem-500502503504-server-errors)          |

#### Error Handling Strategy

The provider automatically handles retryable errors (429, 500-504) with
exponential backoff. For non-retryable errors, your application should handle
them appropriately.

**See also:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed solutions
to each error type.

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

This type is primarily used internally for error conversion but is exported for
advanced use cases.

---

## Utility Functions

> **Architecture Context:** For message transformation flow and format details,
> see [Architecture - Message Conversion](./ARCHITECTURE.md#message-conversion).

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

Creates a DPI (Data Privacy Integration) masking provider configuration for
anonymizing or pseudonymizing sensitive data.

**Signature:**

```typescript
function buildDpiMaskingProvider(config: DpiMaskingConfig): DpiMaskingProviderConfig;
```

**Parameters:**

- `config.method`: Masking method - `"anonymization"` or `"pseudonymization"`
- `config.entities`: Array of entity types to mask (strings or objects with
  replacement strategies)

**Returns:** DPI masking provider configuration object

**Example:**

**Complete example:**
[examples/example-data-masking.ts](./examples/example-data-masking.ts)

```typescript
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

**Run it:** `npx tsx examples/example-data-masking.ts`

---

### `buildAzureContentSafetyFilter(type, config?)`

Creates an Azure Content Safety filter configuration for input or output content
filtering.

**Signature:**

```typescript
function buildAzureContentSafetyFilter(type: "input" | "output", config?: AzureContentSafetyFilterParameters): AzureContentSafetyFilterReturnType;
```

**Parameters:**

- `type`: Filter type - `"input"` (before model) or `"output"` (after model)
- `config`: Optional safety levels for each category (default: `ALLOW_SAFE_LOW`
  for all)
  - `hate`: Hate speech filter level
  - `violence`: Violence content filter level
  - `selfHarm`: Self-harm content filter level
  - `sexual`: Sexual content filter level

**Filter Levels:** `ALLOW_SAFE`, `ALLOW_SAFE_LOW`, `ALLOW_SAFE_LOW_MEDIUM`, or
block all

**Returns:** Azure Content Safety filter configuration

**Example:**

```typescript
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
function buildLlamaGuard38BFilter(type: "input" | "output", categories: [LlamaGuard38BCategory, ...LlamaGuard38BCategory[]]): LlamaGuard38BFilterReturnType;
```

**Parameters:**

- `type`: Filter type - `"input"` or `"output"`
- `categories`: Array of at least one category to filter (e.g., `"hate"`,
  `"violence"`, `"elections"`)

**Returns:** Llama Guard 3 8B filter configuration

**Example:**

```typescript
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

Creates a document grounding configuration for retrieval-augmented generation
(RAG).

**Signature:**

```typescript
function buildDocumentGroundingConfig(config: DocumentGroundingServiceConfig): GroundingModule;
```

**Parameters:**

- `config`: Document grounding service configuration

**Returns:** Full grounding module configuration

**Example:**

**Complete example:**
[examples/example-document-grounding.ts](./examples/example-document-grounding.ts)

```typescript
const groundingConfig = buildDocumentGroundingConfig({
  filters: [
    {
      id: "vector-store-1", // Your vector database ID
      data_repositories: ["*"], // Search all repositories
    },
  ],
  placeholders: {
    input: ["?question"], // Placeholder for user question
    output: "groundingOutput", // Placeholder for grounding output
  },
  metadata_params: ["file_name", "document_id"], // Optional metadata
});

const provider = createSAPAIProvider({
  defaultSettings: {
    grounding: groundingConfig,
  },
});

// Now queries will be grounded in your documents
const model = provider("gpt-4o");
```

**Run it:** `npx tsx examples/example-document-grounding.ts`

**See also:**
[`examples/example-document-grounding.ts`](./examples/example-document-grounding.ts)

---

### `buildTranslationConfig(type, config)`

Creates a translation configuration for input/output translation using SAP
Document Translation service.

**Signature:**

```typescript
function buildTranslationConfig(type: "input" | "output", config: TranslationConfigParams): TranslationReturnType;
```

**Parameters:**

- `type`: Translation type - `"input"` (before model) or `"output"` (after
  model)
- `config`: Translation configuration
  - `sourceLanguage`: Source language code (auto-detected if omitted)
  - `targetLanguage`: Target language code (required)
  - `translateMessagesHistory`: Whether to translate message history (optional)

**Returns:** SAP Document Translation configuration

**Example:**

**Complete example:**
[examples/example-translation.ts](./examples/example-translation.ts)

```typescript
// Translate user input from German to English
const inputTranslation = buildTranslationConfig("input", {
  sourceLanguage: "de",
  targetLanguage: "en",
});

// Translate model output from English to German
const outputTranslation = buildTranslationConfig("output", {
  targetLanguage: "de",
});

const provider = createSAPAIProvider({
  defaultSettings: {
    translation: {
      input: inputTranslation,
      output: outputTranslation,
    },
  },
});

// Now the model handles German input/output automatically
const model = provider("gpt-4o");
```

**Run it:** `npx tsx examples/example-translation.ts`

**See also:**
[`examples/example-translation.ts`](./examples/example-translation.ts)

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

## Version Information

For the current package version, see [package.json](./package.json).

### Dependencies

- **Vercel AI SDK:** v6.0+ (`ai` package)
- **SAP AI SDK:** ^2.4.0 (`@sap-ai-sdk/orchestration`)
- **Node.js:** >= 18

> **Note:** For exact dependency versions, always refer to `package.json` in the
> repository root.

---

## Related Documentation

- [README.md](./README.md) - Getting started, quick start, and feature overview
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Authentication setup and
  environment configuration
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Migration from v1.x with
  troubleshooting
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Internal architecture, component
  design, and request flows
- [CURL_API_TESTING_GUIDE.md](./CURL_API_TESTING_GUIDE.md) - Low-level API
  testing and debugging
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Development setup and contribution
  guidelines
