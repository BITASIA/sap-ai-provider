# SAP AI Core Provider for Vercel AI SDK

[![npm](https://img.shields.io/npm/v/@mymediset/sap-ai-provider/latest?label=npm&color=blue)](https://www.npmjs.com/package/@mymediset/sap-ai-provider)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A community provider for SAP AI Core that integrates seamlessly with the Vercel AI SDK. This provider enables you to use SAP's enterprise-grade AI models through the familiar Vercel AI SDK interface.

## Table of Contents

- [Important Note](#important-note)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Authentication](#authentication)
- [Basic Usage](#basic-usage)
- [Supported Models](#supported-models)
- [Configuration Options](#configuration-options)
- [Advanced Features](#advanced-features)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Performance & Best Practices](#performance--best-practices)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## Important Note

> **Third-Party Provider**: This SAP AI Core provider (`@mymediset/sap-ai-provider`) is developed and maintained by Mymediset, not by SAP SE. While it integrates with official SAP AI Core services, it is not an official SAP product. For official SAP AI solutions, please refer to the [SAP AI Core Documentation](https://help.sap.com/docs/ai-core).

## Features

- 🔐 **Automatic OAuth Authentication** - Handles SAP AI Core authentication seamlessly
- 🎯 **Tool Calling Support** - Full function calling capabilities
- 🖼️ **Multi-modal Input** - Support for text and image inputs
- 📡 **Streaming Support** - Real-time text generation with Server-Sent Events
- 🏗️ **Structured Outputs** - JSON schema-based structured responses
- 🔧 **TypeScript Support** - Full type safety and IntelliSense
- 🎨 **Multiple Models** - Support for 40+ models including GPT-4, Claude, Gemini, and more

## Quick Start

```bash
npm install @mymediset/sap-ai-provider ai
```

```typescript
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
import { generateText } from 'ai';

// Create provider with your SAP AI Core service key
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

// Generate text with GPT-4
const result = await generateText({
  model: provider('gpt-4o'),
  prompt: 'Explain quantum computing in simple terms.'
});

console.log(result.text);
```

## Installation

Install the package and its peer dependencies:

```bash
npm install @mymediset/sap-ai-provider ai zod
```

Or with other package managers:

```bash
# Yarn
yarn add @mymediset/sap-ai-provider ai zod

# pnpm
pnpm add @mymediset/sap-ai-provider ai zod
```

## Authentication

The provider supports multiple authentication methods. Choose the one that best fits your setup:

### 1. Service Key (Recommended)

Get your service key from SAP BTP and use it directly:

```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY // JSON string from SAP BTP
});
```

### 2. Environment Variables

Set the service key as an environment variable:

```bash
# .env
SAP_AI_SERVICE_KEY={"serviceurls":{"AI_API_URL":"https://..."},"clientid":"...","clientsecret":"...","url":"..."}
```

```typescript
import 'dotenv/config';

const provider = await createSAPAIProvider(); // Automatically uses SAP_AI_SERVICE_KEY
```

### 3. Direct Token (Advanced)

For advanced users who manage tokens themselves:

```typescript
const provider = await createSAPAIProvider({
  token: 'your-oauth-token',
  baseURL: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2'
});
```

## Basic Usage

### Text Generation

Generate text with any supported model:

```typescript
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
import { generateText } from 'ai';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const result = await generateText({
  model: provider('gpt-4o'),
  prompt: 'Write a short story about a robot learning to paint.'
});

console.log(result.text);
```

### Chat Conversations

Create interactive chat experiences:

```typescript
import { generateText } from 'ai';

const result = await generateText({
  model: provider('claude-3.5-sonnet'),
  messages: [
    { role: 'system', content: 'You are a helpful coding assistant.' },
    { role: 'user', content: 'How do I implement binary search in TypeScript?' }
  ]
});
```

### Orchestration v2 endpoint

SAP Orchestration v2 uses the completion endpoint `POST /v2/completion` (see docs: https://api.sap.com/api/ORCHESTRATION_API_v2/resource/Orchestrated_Completion).

This provider defaults to a v2-compliant path under deployments. If your landscape expects the top-level v2 endpoint, override via `completionPath`:

```ts
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY!,
  // Top-level v2 endpoint under your baseURL
  completionPath: "/v2/completion",
});
```

### Streaming Responses

Stream text as it's generated for real-time experiences:

```typescript
import { streamText } from 'ai';

const result = await streamText({
  model: provider('gpt-4o'),
  prompt: 'Explain machine learning concepts.'
});

for await (const delta of result.textStream) {
  process.stdout.write(delta);
}
```

You can also use Vercel AI SDK's `streamText` helper:

```ts
import { streamText } from 'ai';

const { textStream } = await streamText({
  model: provider('gpt-4o'),
  prompt: 'Write a story about a cat.',
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
```

### API versions and deprecation

- v2 endpoint: `POST /v2/completion` (recommended)
- v1 endpoint: `POST /completion` (deprecated; decommission on 31 Oct 2026)

Recommended usage (v2 by default): leave `completionPath` unset or set to `/v2/completion`.

```ts
// v2 (recommended)
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY!,
  // If your baseURL is the host root (without /v2), set completionPath explicitly:
  // baseURL: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com',
  // completionPath: '/v2/completion',
});

// v1 (legacy – will be decommissioned on 31 Oct 2026)
const providerV1 = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY!,
  // Ensure baseURL does not include '/v2' when targeting v1
  baseURL: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com',
  completionPath: '/completion',
});
```

### Model Configuration

Customize model behavior with detailed settings:

```typescript
const model = provider('gpt-4o', {
  modelParams: {
    temperature: 0.3,        // More focused responses
    maxTokens: 2000,         // Longer responses
    topP: 0.9,              // Nucleus sampling
    frequencyPenalty: 0.1,   // Reduce repetition
  }
});

const result = await generateText({
  model,
  prompt: 'Write a technical blog post about TypeScript.'
});
```

## Supported Models

The provider supports a wide range of models available in SAP AI Core:

### OpenAI Models

- `gpt-5`, `gpt-5-mini`, `gpt-5-nano`
- `gpt-4`, `gpt-4o`, `gpt-4o-mini`
- `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- `o1`, `o1-mini`, `o3`, `o3-mini`, `o4-mini`

### Anthropic Models

- `anthropic--claude-3-haiku`, `anthropic--claude-3-sonnet`, `anthropic--claude-3-opus`
- `anthropic--claude-3.5-sonnet`, `anthropic--claude-3.7-sonnet`
- `anthropic--claude-4-sonnet`, `anthropic--claude-4-opus`

### Google Models (gcp-vertexai)

- `gemini-2.0-pro`, `gemini-2.0-flash`, `gemini-2.0-flash-thinking`, `gemini-2.0-flash-lite`
- `gemini-2.5-pro`, `gemini-2.5-flash`

### Amazon Models

- `amazon--nova-premier`, `amazon--nova-pro`, `amazon--nova-lite`, `amazon--nova-micro`
- `amazon--titan-text-lite`, `amazon--titan-text-express`

### Other Models

- `mistralai--mistral-large-instruct`, `mistralai--mistral-small-instruct`
- `meta--llama3-70b-instruct`, `meta--llama3.1-70b-instruct`
- And many more...

Note: Model availability may vary based on your SAP AI Core subscription and region. Some models may require additional configuration or permissions.

## Installation

```bash
npm install @mymediset/sap-ai-provider
```

## Quick Start

### 1. Get Your SAP AI Core Service Key

1. Go to your SAP BTP Cockpit
2. Navigate to your AI Core instance
3. Create a service key for your AI Core instance
4. Copy the service key JSON

### 2. Basic Usage (Direct Model API)

```typescript
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

// Create the provider with your service key
const provider = await createSAPAIProvider({
  serviceKey: "your-sap-ai-core-service-key-json",
});

// Create a model instance
const model = provider("gpt-4o", {
  modelParams: {
    temperature: 0.7,
    maxTokens: 1000,
  },
});

// Generate text
const result = await model.doGenerate({
  prompt: [
    {
      role: "user",
      content: [{ type: "text", text: "Hello, how are you?" }],
    },
  ],
});

// Extract text from content array
const text = result.content
  .filter((item) => item.type === "text")
  .map((item) => item.text)
  .join("");

console.log(text);
```

### 3. Using with Vercel AI SDK (Recommended)

```typescript
import { generateText } from "ai";
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});

const model = provider("gpt-4o");

const result = await generateText({
  model,
  prompt: "Write a short story about a robot learning to paint.",
});

console.log(result.text);
```

## Advanced Features

### Tool Calling (Function Calling)

```typescript
import { generateText } from "ai";
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { tool } from "ai";
import { z } from "zod";

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});

const result = await generateText({
  model: provider("gpt-4o"),
  messages: [{ role: "user", content: "What's the weather like in Tokyo?" }],
  tools: {
    get_weather: tool({
      description: "Get the current weather for a location",
      parameters: z.object({
        location: z
          .string()
          .describe("The city and state, e.g. San Francisco, CA"),
      }),
      execute: async ({ location }) => {
        // Your weather API implementation
        return `The weather in ${location} is sunny and 25°C`;
      },
    }),
  },
});

console.log(result.text);
```

### Multi-modal Input (Images)

```typescript
import { generateText } from "ai";
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});

const result = await generateText({
  model: provider("gpt-4o"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What do you see in this image?" },
        {
          type: "image",
          image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
        },
      ],
    },
  ],
});

console.log(result.text);
```

### Streaming

```typescript
import { streamText } from "ai";
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});

const result = await streamText({
  model: provider("gpt-4o"),
  prompt: "Write a poem about AI.",
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

### Structured Outputs

```typescript
import { generateObject } from "ai";
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { z } from "zod";

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});

const result = await generateObject({
  model: provider("gpt-4o"),
  prompt:
    "Extract the name, age, and email from: John Doe, 30 years old, john@example.com",
  schema: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string(),
  }),
});

console.log(result.object);
```

### Data Masking (SAP Data Privacy Integration - DPI)

Use SAP AI Core's native masking to anonymize or pseudonymize sensitive information before it reaches the model. You can configure it per-call or once at provider creation using `defaultSettings`.

Provider-wide default (recommended):

```typescript
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

const dpiMasking = {
  type: "sap_data_privacy_integration",
  method: "anonymization",
  entities: [
    { type: "profile-email", replacement_strategy: { method: "fabricated_data" } },
    { type: "profile-person", replacement_strategy: { method: "constant", value: "NAME_REDACTED" } },
    { regex: "\\\b[0-9]{4}-[0-9]{4}-[0-9]{3,5}\\\b", replacement_strategy: { method: "constant", value: "REDACTED_ID" } },
  ],
  allowlist: ["SAP"],
  mask_grounding_input: { enabled: false },
};

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  defaultSettings: {
    masking: { masking_providers: [dpiMasking] },
  },
});

// All models from this provider will apply masking unless overridden
const { text } = await generateText({
  model: provider("gpt-4o"),
  messages: [
    {
      role: "user",
      content:
        "Please email Jane Doe (jane.doe@example.com) about order 1234-5678-901 and mention SAP.",
    },
  ],
});
```

Per-call masking (override provider default if needed):

```typescript
const model = provider("gpt-4o", {
  masking: { masking_providers: [dpiMasking] },
});
```

## Configuration Options

### Provider Settings

```typescript
interface SAPAIProviderSettings {
  serviceKey?: string; // SAP AI Core service key JSON
  token?: string; // Direct access token (alternative to serviceKey)
  baseURL?: string; // Custom base URL for API calls
  deploymentId?: string; // SAP AI Core deployment ID (default: 'd65d81e7c077e583')
  resourceGroup?: string; // SAP AI Core resource group (default: 'default')
  defaultSettings?: SAPAISettings; // Defaults applied to all models (e.g., masking)
}
```

### Deployment Configuration

The SAP AI provider uses deployment IDs and resource groups to manage model deployments in SAP AI Core:

#### Deployment ID

- A unique identifier for your model deployment in SAP AI Core
- Default: 'd65d81e7c077e583' (general-purpose deployment)
- Can be found in your SAP AI Core deployment details
- Set via `deploymentId` option or `SAP_AI_DEPLOYMENT_ID` environment variable

#### Resource Group

- Logical grouping of AI resources in SAP AI Core
- Default: 'default'
- Used for resource isolation and access control
- Set via `resourceGroup` option or `SAP_AI_RESOURCE_GROUP` environment variable

#### Production Environments with xsenv

In production environments like SAP BTP, you can use the `xsenv` package to automatically load service credentials:

```typescript
import xsenv from "@sap/xsenv";
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

// Automatically load service credentials from VCAP_SERVICES
const services = xsenv.getServices({
  aicore: { label: "aicore" }
});

const aiCoreServiceKey = services.aicore;

const provider = await createSAPAIProvider({
  serviceKey = aiCoreServiceKey;
});
```

> **Note**: Install `@sap/xsenv` via `npm install @sap/xsenv` before using this method.

Example with custom deployment:

```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  deploymentId: "your-custom-deployment-id",
  resourceGroup: "your-resource-group",
});
```

### Model Settings

```typescript
interface SAPAISettings {
  modelVersion?: string; // Specific model version
  modelParams?: {
    maxTokens?: number; // Maximum tokens to generate
    temperature?: number; // Sampling temperature (0-2)
    topP?: number; // Nucleus sampling parameter
    frequencyPenalty?: number; // Frequency penalty (-2 to 2)
    presencePenalty?: number; // Presence penalty (-2 to 2)
    n?: number; // Number of completions
  };
  safePrompt?: boolean; // Enable safe prompt filtering
  structuredOutputs?: boolean; // Enable structured outputs
  masking?: {
    masking_providers: Array<{
      type?: "sap_data_privacy_integration"; // DPI provider
      method?: "anonymization" | "pseudonymization";
      entities: Array<
        | { type: string; replacement_strategy?: { method: "constant" | "fabricated_data"; value?: string } }
        | { regex: string; replacement_strategy: { method: "constant"; value: string } }
      >;
      allowlist?: string[];
      mask_grounding_input?: { enabled?: boolean };
    }>;
  };
}
```

## Environment Variables

```bash
# Required: Your SAP AI Core service key
SAP_AI_SERVICE_KEY='{"serviceurls":{"AI_API_URL":"..."},"clientid":"...","clientsecret":"..."}'

# Optional: Direct access token (alternative to service key)
SAP_AI_TOKEN='your-access-token'

# Optional: Custom base URL
SAP_AI_BASE_URL='https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com'
```

## Error Handling

The provider includes comprehensive error handling with detailed error messages and automatic retries for certain error types.

### Error Types

```typescript
class SAPAIError extends Error {
  code?: number; // Error code from SAP AI Core
  location?: string; // Where the error occurred
  requestId?: string; // Request ID for tracking
  details?: string; // Additional error details
  response?: Response; // Raw HTTP response
}
```

### Common Error Codes

| HTTP Status | Description           | Retry? | Common Causes                                  |
| ----------- | --------------------- | ------ | ---------------------------------------------- |
| 400         | Bad Request           | No     | Invalid parameters, malformed request          |
| 401         | Unauthorized          | No     | Invalid/expired token, wrong credentials       |
| 403         | Forbidden             | No     | Insufficient permissions, wrong resource group |
| 404         | Not Found             | No     | Invalid model ID, deployment ID                |
| 429         | Too Many Requests     | Yes    | Rate limit exceeded                            |
| 500         | Internal Server Error | Yes    | SAP AI Core service issue                      |
| 502         | Bad Gateway           | Yes    | Network/proxy issue                            |
| 503         | Service Unavailable   | Yes    | Service temporarily down                       |
| 504         | Gateway Timeout       | Yes    | Request timeout                                |

### Error Handling Examples

Basic error handling:

```typescript
import { SAPAIError } from "@mymediset/sap-ai-provider";

try {
  const result = await generateText({
    model: provider("gpt-4o"),
    prompt: "Hello world",
  });
} catch (error) {
  if (error instanceof SAPAIError) {
    console.error("Error Code:", error.code);
    console.error("Request ID:", error.requestId);
    console.error("Location:", error.location);
    console.error("Details:", error.details);

    // Handle specific error types
    if (error.code === 429) {
      console.log("Rate limit exceeded - retrying after delay...");
    } else if (error.code === 401) {
      console.log("Authentication failed - check credentials");
    }
  }
}
```

### Best Practices

1. Use streaming for long responses to avoid token limits
2. Implement request queuing for high-volume applications
3. Monitor usage and adjust rate limits as needed
4. Cache responses when possible
5. Use batch requests efficiently

## Examples

Check out the [examples directory](./examples) for complete working examples:

- [Simple Chat Completion](./examples/example-simple-chat-completion.ts)
- [Tool Calling](./examples/example-chat-completion-tool.ts)
- [Image Recognition](./examples/example-image-recognition.ts)
- [Text Generation](./examples/example-generate-text.ts)
 - [Data Masking (DPI)](./examples/example-data-masking.ts)

## API Reference

### `createSAPAIProvider(options?)`

Creates a SAP AI Core provider instance.

**Parameters:**
- `options` (optional): `SAPAIProviderSettings` - Configuration options

**Returns:** `Promise<SAPAIProvider>` - Configured provider instance

**Example:**
```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  deploymentId: 'custom-deployment',
  resourceGroup: 'production'
});
```

### `SAPAIProviderSettings`

Configuration interface for the provider.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `serviceKey` | `string \| SAPAIServiceKey` | - | SAP AI Core service key from BTP |
| `token` | `string` | - | Direct OAuth token (alternative to serviceKey) |
| `deploymentId` | `string` | `'d65d81e7c077e583'` | SAP AI Core deployment ID |
| `resourceGroup` | `string` | `'default'` | Resource group for resource isolation |
| `baseURL` | `string` | Auto-detected | Custom API base URL |
| `headers` | `Record<string, string>` | `{}` | Custom HTTP headers |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation |

### `SAPAISettings`

Model-specific configuration options.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `modelVersion` | `string` | `'latest'` | Specific model version |
| `modelParams` | `ModelParams` | - | Model generation parameters |
| `safePrompt` | `boolean` | `true` | Enable safe prompt filtering |
| `structuredOutputs` | `boolean` | `false` | Enable structured response format |

### `ModelParams`

Fine-tune model behavior with these parameters:

| Property | Type | Range | Default | Description |
|----------|------|-------|---------|-------------|
| `maxTokens` | `number` | 1-4096+ | `1000` | Maximum tokens to generate |
| `temperature` | `number` | 0-2 | `0.7` | Sampling temperature |
| `topP` | `number` | 0-1 | `1` | Nucleus sampling parameter |
| `frequencyPenalty` | `number` | -2 to 2 | `0` | Frequency penalty |
| `presencePenalty` | `number` | -2 to 2 | `0` | Presence penalty |
| `n` | `number` | 1-10 | `1` | Number of completions |

### `SAPAIError`

Error class for SAP AI Core specific errors.

**Properties:**
- `code?: number` - HTTP status or error code
- `location?: string` - Where the error occurred
- `requestId?: string` - Request ID for tracking
- `details?: string` - Additional error details
- `response?: Response` - Raw HTTP response

**Example:**
```typescript
try {
  const result = await generateText({
    model: provider('gpt-4o'),
    prompt: 'Hello world'
  });
} catch (error) {
  if (error instanceof SAPAIError) {
    console.error('Error Code:', error.code);
    console.error('Request ID:', error.requestId);
  }
}
```

## Troubleshooting

### Common Issues and Solutions

#### Authentication Errors

**Problem:** `401 Unauthorized` or `403 Forbidden`

**Solutions:**
1. Verify your service key is correct and properly formatted JSON
2. Check if your SAP AI Core subscription is active
3. Ensure the client credentials have proper permissions
4. Verify the identity zone and resource group settings

```typescript
// Debug authentication
try {
  const provider = await createSAPAIProvider({
    serviceKey: process.env.SAP_AI_SERVICE_KEY
  });
} catch (error) {
  console.error('Auth failed:', error.message);
}
```

#### Model Not Found

**Problem:** `404 Not Found` when using a model

**Solutions:**
1. Check if the model is available in your SAP AI Core subscription
2. Verify the model ID spelling (case-sensitive)
3. Ensure your deployment supports the requested model
4. Check if the model is available in your region

```typescript
// List available models for your deployment
const availableModels = [
  'gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'gemini-1.5-pro'
];
```

#### Rate Limiting

**Problem:** `429 Too Many Requests`

**Solutions:**
1. Implement exponential backoff retry logic
2. Reduce request frequency
3. Use streaming for long responses
4. Check your SAP AI Core quotas

```typescript
import { SAPAIError } from '@mymediset/sap-ai-provider';

async function retryWithBackoff(fn: () => Promise<any>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof SAPAIError && error.code === 429) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

#### Deployment Issues

**Problem:** Incorrect deployment configuration

**Solutions:**
1. Verify deployment ID in SAP AI Core console
2. Check resource group permissions
3. Ensure deployment is active and healthy

```typescript
// Custom deployment configuration
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  deploymentId: 'your-deployment-id', // Found in SAP AI Core
  resourceGroup: 'your-resource-group'
});
```

#### Network Issues

**Problem:** Connection timeouts or network errors

**Solutions:**
1. Check firewall and proxy settings
2. Verify SAP AI Core service status
3. Use custom fetch with timeout configuration

```typescript
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  fetch: (url, options) => {
    return fetch(url, {
      ...options,
      timeout: 30000 // 30 second timeout
    });
  }
});
```

### Debug Mode

Enable detailed logging for troubleshooting:

```typescript
// Set environment variable for debug output
process.env.DEBUG = 'sap-ai-provider:*';

// Or add custom headers for request tracking
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  headers: {
    'X-Debug': 'true',
    'X-Request-Source': 'my-app'
  }
});
```

### Getting Help

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/BITASIA/sap-ai-provider/issues)
2. Review SAP AI Core [official documentation](https://help.sap.com/docs/ai-core)
3. Create a new issue with:
   - Error message and stack trace
   - Your configuration (without sensitive data)
   - Steps to reproduce
   - Expected vs actual behavior

## Performance & Best Practices

### Optimization Tips

#### 1. Use Appropriate Models

Choose the right model for your use case:

```typescript
// For simple tasks, use smaller/faster models
const quickModel = provider('gpt-4o-mini'); // Fast, cost-effective

// For complex reasoning, use larger models
const powerfulModel = provider('gpt-4o'); // More capable, slower

// For specific domains
const codeModel = provider('claude-3.5-sonnet'); // Great for coding
const visionModel = provider('gpt-4o'); // Best for image analysis
```

#### 2. Implement Caching

Cache responses for repeated queries:

```typescript
const cache = new Map<string, string>();

async function getCachedResponse(prompt: string) {
  if (cache.has(prompt)) {
    return cache.get(prompt);
  }
  
  const result = await generateText({
    model: provider('gpt-4o'),
    prompt
  });
  
  cache.set(prompt, result.text);
  return result.text;
}
```

#### 3. Use Streaming for Long Responses

Stream responses to improve perceived performance:

```typescript
import { streamText } from 'ai';

const stream = await streamText({
  model: provider('gpt-4o'),
  prompt: 'Write a detailed technical report...'
});

// Process chunks as they arrive
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

#### 4. Optimize Token Usage

Reduce costs and latency by managing token usage:

```typescript
const model = provider('gpt-4o', {
  modelParams: {
    maxTokens: 500,      // Limit response length
    temperature: 0.3,    // More focused responses
  }
});

// Use system messages to set context efficiently
const result = await generateText({
  model,
  messages: [
    { 
      role: 'system', 
      content: 'Be concise. Answer in 2-3 sentences.' 
    },
    { 
      role: 'user', 
      content: userQuestion 
    }
  ]
});
```

#### 5. Batch Processing

Process multiple requests efficiently:

```typescript
async function processQuestions(questions: string[]) {
  const promises = questions.map(question => 
    generateText({
      model: provider('gpt-4o-mini'),
      prompt: question
    })
  );
  
  // Process in parallel but limit concurrency
  const results = await Promise.allSettled(promises);
  return results;
}
```

#### 6. Error Handling and Retries

Implement robust error handling:

```typescript
import { SAPAIError } from '@mymediset/sap-ai-provider';

async function robustGenerate(prompt: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateText({
        model: provider('gpt-4o'),
        prompt
      });
    } catch (error) {
      if (error instanceof SAPAIError) {
        // Retry on rate limits and server errors
        if ([429, 500, 502, 503, 504].includes(error.code || 0)) {
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
      }
      throw error;
    }
  }
}
```

### Production Considerations

#### Environment Variables

Use environment-specific configurations:

```typescript
// .env.production
SAP_AI_SERVICE_KEY={"serviceurls":...}
SAP_AI_DEPLOYMENT_ID=production-deployment
SAP_AI_RESOURCE_GROUP=production

// .env.development  
SAP_AI_SERVICE_KEY={"serviceurls":...}
SAP_AI_DEPLOYMENT_ID=dev-deployment
SAP_AI_RESOURCE_GROUP=development
```

#### Monitoring and Logging

Add comprehensive logging:

```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  headers: {
    'X-App-Version': process.env.APP_VERSION,
    'X-Environment': process.env.NODE_ENV
  }
});

// Log successful requests
const result = await generateText({
  model: provider('gpt-4o'),
  prompt: userInput
});

console.log('AI Request:', {
  model: 'gpt-4o',
  tokensUsed: result.usage?.totalTokens,
  responseTime: Date.now() - startTime
});
```

#### Security Best Practices

1. **Never expose service keys in client-side code**
2. **Use environment variables for credentials**
3. **Implement request validation and sanitization**
4. **Set up proper CORS policies**
5. **Monitor API usage and set up alerts**

```typescript
// Server-side only
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';

// Validate and sanitize user input
function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML
    .substring(0, 1000);   // Limit length
}

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    const sanitizedPrompt = sanitizeInput(prompt);
    
    const provider = await createSAPAIProvider({
      serviceKey: process.env.SAP_AI_SERVICE_KEY
    });
    
    const result = await generateText({
      model: provider('gpt-4o'),
      prompt: sanitizedPrompt
    });
    
    return Response.json({ text: result.text });
  } catch (error) {
    console.error('AI Generation failed:', error);
    return Response.json(
      { error: 'Generation failed' }, 
      { status: 500 }
    );
  }
}
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Type Checking

```bash
npm run type-check
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

Apache License 2.0 - see [LICENSE](LICENSE.md) for details.

## Support

- 📖 [Documentation](https://github.com/BITASIA/sap-ai-provider)
- 🐛 [Issue Tracker](https://github.com/BITASIA/sap-ai-provider/issues)

## Related

- [Vercel AI SDK](https://sdk.vercel.ai/) - The AI SDK this provider extends
- [SAP AI Core Documentation](https://help.sap.com/docs/ai-core) - Official SAP AI Core docs
- [SAP BTP](https://www.sap.com/products/technology-platform.html) - SAP Business Technology Platform
