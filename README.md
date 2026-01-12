# SAP AI Core Provider for Vercel AI SDK

[![npm](https://img.shields.io/npm/v/@mymediset/sap-ai-provider/latest?label=npm&color=blue)](https://www.npmjs.com/package/@mymediset/sap-ai-provider)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A community provider for SAP AI Core that integrates seamlessly with the Vercel AI SDK. Built on top of the official **@sap-ai-sdk/orchestration** package, this provider enables you to use SAP's enterprise-grade AI models through the familiar Vercel AI SDK interface.

> **Note on Terminology:** This documentation uses "tool calling" to align with Vercel AI SDK conventions. This is equivalent to "function calling" - both terms refer to the same capability of models invoking external functions.

## ⚠️ Breaking Changes in v2.0

Version 2.0 is a complete rewrite using the official SAP AI SDK. Key changes:

- **Authentication**: Now uses `AICORE_SERVICE_KEY` environment variable (SAP AI SDK standard)
- **Provider creation**: Now synchronous - `createSAPAIProvider()` instead of `await createSAPAIProvider()`
- **No more `serviceKey` option**: Authentication is handled automatically by the SAP AI SDK
- **New helper functions**: Use `buildDpiMaskingProvider()`, `buildAzureContentSafetyFilter()` etc. from the SDK

**Upgrading from v1.x?** See the [Migration Guide](./MIGRATION_GUIDE.md) for detailed instructions.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Authentication](#authentication)
- [Basic Usage](#basic-usage)
- [Supported Models](#supported-models)
- [Advanced Features](#advanced-features)
- [Configuration Options](#configuration-options)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [Migration from v1](#migration-from-v1)
- [Contributing](#contributing)
- [License](#license)

## Features

- 🔐 **Automatic Authentication** - Uses SAP AI SDK's built-in credential handling
- 🎯 **Tool Calling Support** - Full tool/function calling capabilities
- 🧠 **Reasoning-Safe by Default** - Assistant reasoning parts are not forwarded unless enabled
- 🖼️ **Multi-modal Input** - Support for text and image inputs
- 📡 **Streaming Support** - Real-time text generation
- 🔒 **Data Masking** - Built-in SAP DPI integration for privacy
- 🛡️ **Content Filtering** - Azure Content Safety and Llama Guard support
- 🔧 **TypeScript Support** - Full type safety and IntelliSense
- 🎨 **Multiple Models** - Support for GPT-4, Claude, Gemini, Nova, and more

## Quick Start

```bash
npm install @mymediset/sap-ai-provider ai
```

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { generateText } from "ai";

// Create provider (authentication via AICORE_SERVICE_KEY env var)
const provider = createSAPAIProvider();

// Generate text with gpt-4o
const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "Explain quantum computing in simple terms.",
});

console.log(result.text);
```

> **Setup:** Create a `.env` file with your `AICORE_SERVICE_KEY`. You can copy from `.env.example`: `cp .env.example .env`  
> **Full Setup Guide:** See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for detailed authentication configuration.

## Installation

**Requirements:** Node.js 18+ and Vercel AI SDK 6.0+

```bash
npm install @mymediset/sap-ai-provider ai
```

Or with other package managers:

```bash
# Yarn
yarn add @mymediset/sap-ai-provider ai

# pnpm
pnpm add @mymediset/sap-ai-provider ai
```

## Provider Creation

You can create an SAP AI provider in two ways:

### Option 1: Factory Function (Recommended for Custom Configuration)

```typescript
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider({
  resourceGroup: "production",
  deploymentId: "your-deployment-id", // Optional
});
```

### Option 2: Default Instance (Quick Start)

```typescript
import { sapai } from "@mymediset/sap-ai-provider";
import { generateText } from "ai";

// Use directly with auto-detected configuration
const result = await generateText({
  model: sapai("gpt-4o"),
  prompt: "Hello!",
});
```

The `sapai` export provides a convenient default provider instance with automatic configuration from environment variables or service bindings.

## Authentication

Authentication is handled automatically by the SAP AI SDK using the `AICORE_SERVICE_KEY` environment variable.

**Quick Setup:**

```bash
export AICORE_SERVICE_KEY='{"serviceurls":{"AI_API_URL":"..."},...}'
```

```typescript
const provider = createSAPAIProvider();
```

**→ For complete setup, authentication methods, and troubleshooting, see [Environment Setup Guide](./ENVIRONMENT_SETUP.md).**

## Basic Usage

### Text Generation

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { generateText } from "ai";

const provider = createSAPAIProvider();

const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "Write a short story about a robot learning to paint.",
});

console.log(result.text);
```

### Chat Conversations

Note: assistant `reasoning` parts are dropped by default. Set `includeReasoning: true` on the model settings if you explicitly want to forward them.

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { generateText } from "ai";

const provider = createSAPAIProvider();

const result = await generateText({
  model: provider("anthropic--claude-3.5-sonnet"),
  messages: [
    { role: "system", content: "You are a helpful coding assistant." },
    {
      role: "user",
      content: "How do I implement binary search in TypeScript?",
    },
  ],
});
```

### Streaming Responses

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { streamText } from "ai";

const provider = createSAPAIProvider();

const result = streamText({
  model: provider("gpt-4o"),
  prompt: "Explain machine learning concepts.",
});

for await (const delta of result.textStream) {
  process.stdout.write(delta);
}
```

### Model Configuration

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { generateText } from "ai";

const provider = createSAPAIProvider();

const model = provider("gpt-4o", {
  // Optional: include assistant reasoning parts (chain-of-thought).
  // Best practice is to keep this disabled.
  includeReasoning: false,
  modelParams: {
    temperature: 0.3,
    maxTokens: 2000,
    topP: 0.9,
  },
});

const result = await generateText({
  model,
  prompt: "Write a technical blog post about TypeScript.",
});
```

## Supported Models

This provider supports all models available in your SAP AI Core tenant, including:

**Popular models:** GPT-4o, GPT-4.1, Claude 3.5 Sonnet, Gemini 2.0, Amazon Nova

**Model availability** varies by tenant, region, and subscription. Some models have specific limitations (e.g., Gemini supports only one tool per request).

For the complete list of model identifiers and capabilities, see **[API Reference: SAPAIModelId](./API_REFERENCE.md#sapaimodelid)**.

## Advanced Features

The following helper functions are exported by this package for convenient configuration of SAP AI Core features. These builders provide type-safe configuration for data masking, content filtering, grounding, and translation modules.

### Tool Calling

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { generateText, tool } from "ai";
import { z } from "zod";

const provider = createSAPAIProvider();

const weatherSchema = z.object({
  location: z.string(),
});

const weatherTool = tool({
  description: "Get weather for a location",
  inputSchema: weatherSchema,
  execute: (args: z.infer<typeof weatherSchema>) => {
    const { location } = args;
    return `Weather in ${location}: sunny, 72°F`;
  },
});

const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "What's the weather in Tokyo?",
  tools: { getWeather: weatherTool },
  maxSteps: 3,
});

console.log(result.text);
```

> Known limitations: Gemini models currently support only one function tool per request. For multiple tools, use OpenAI models (e.g., `gpt-4o`) or consolidate tools.

### Multi-modal Input (Images)

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { generateText } from "ai";

const provider = createSAPAIProvider();

const result = await generateText({
  model: provider("gpt-4o"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What do you see in this image?" },
        { type: "image", image: new URL("https://example.com/image.jpg") },
      ],
    },
  ],
});
```

### Data Masking (SAP DPI)

Use SAP's Data Privacy Integration to mask sensitive data:

```typescript
import "dotenv/config"; // Load environment variables
import {
  createSAPAIProvider,
  buildDpiMaskingProvider,
} from "@mymediset/sap-ai-provider";
import { generateText } from "ai";

const dpiConfig = buildDpiMaskingProvider({
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
      masking_providers: [dpiConfig],
    },
  },
});

const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "Email john@example.com about the meeting.",
});
```

### Content Filtering

```typescript
import "dotenv/config"; // Load environment variables
import {
  createSAPAIProvider,
  buildAzureContentSafetyFilter,
} from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider({
  defaultSettings: {
    filtering: {
      input: {
        filters: [
          buildAzureContentSafetyFilter("input", {
            hate: "ALLOW_SAFE",
            violence: "ALLOW_SAFE_LOW_MEDIUM",
          }),
        ],
      },
    },
  },
});
```

## Configuration Options

The provider and models can be configured with various settings for authentication, model parameters, data masking, content filtering, and more.

**Common Configuration:**

- `resourceGroup`: SAP AI Core resource group (default: 'default')
- `deploymentId`: Specific deployment ID (auto-resolved if not set)
- `modelParams`: Temperature, maxTokens, topP, and other generation parameters
- `masking`: SAP Data Privacy Integration (DPI) configuration
- `filtering`: Content safety filters (Azure Content Safety, Llama Guard)

For complete configuration reference including all available options, types, and examples, see **[API Reference - Configuration](./API_REFERENCE.md#sapaiprovidersettings)**.

## Error Handling

The provider uses standard Vercel AI SDK error types for consistent error handling.

**Basic Error Handling:**

```typescript
import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";

try {
  const result = await generateText({
    model: provider("gpt-4o"),
    prompt: "Hello world",
  });
} catch (error) {
  if (error instanceof LoadAPIKeyError) {
    console.error("Authentication issue:", error.message);
  } else if (error instanceof APICallError) {
    console.error("API error:", error.statusCode, error.message);
  }
}
```

**For complete error reference, status codes, and detailed troubleshooting:**

- **[API Reference - Error Handling](./API_REFERENCE.md#error-handling)** - Error types and error codes reference table
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Detailed solutions for each error type

## Troubleshooting

**Quick Reference:**

- **Authentication (401)**: Check `AICORE_SERVICE_KEY` or `VCAP_SERVICES`
- **Model not found (404)**: Confirm tenant/region supports the model ID
- **Rate limit (429)**: Automatic retry with exponential backoff
- **Streaming**: Iterate `textStream` correctly; don't mix `generateText` and `streamText`

**For comprehensive troubleshooting, see [Troubleshooting Guide](./TROUBLESHOOTING.md)** with detailed solutions for:

- [Authentication Failed (401)](./TROUBLESHOOTING.md#problem-authentication-failed-or-401-errors)
- [Model Not Found (404)](./TROUBLESHOOTING.md#problem-404-modeldeployment-not-found)
- [Rate Limit (429)](./TROUBLESHOOTING.md#problem-429-rate-limit-exceeded)
- [Server Errors (500-504)](./TROUBLESHOOTING.md#problem-500502503504-server-errors)
- [Streaming Issues](./TROUBLESHOOTING.md#streaming-issues)
- [Tool Calling Problems](./TROUBLESHOOTING.md#tool-calling-issues)

Error code reference table: [API Reference - Error Codes](./API_REFERENCE.md#error-codes)

## Performance

- Prefer streaming (`streamText`) for long outputs to reduce latency and memory.
- Tune `modelParams` carefully: lower `temperature` for deterministic results; set `maxTokens` to expected response size.
- Use `defaultSettings` at provider creation for shared knobs across models to avoid per-call overhead.
- Avoid unnecessary history: keep `messages` concise to reduce prompt size and cost.

## Security

- Do not commit `.env` or credentials; use environment variables and secrets managers.
- Treat `AICORE_SERVICE_KEY` as sensitive; avoid logging it or including in crash reports.
- Mask PII with DPI: configure `masking.masking_providers` using `buildDpiMaskingProvider()`.
- Validate and sanitize tool outputs before executing any side effects.

## Debug Mode

- Use the curl guide `CURL_API_TESTING_GUIDE.md` to diagnose raw API behavior independent of the SDK.
- Log request IDs from `SAPAIError` to correlate with backend traces.
- Temporarily enable verbose logging in your app around provider calls; redact secrets.

## Examples

The `examples/` directory contains complete, runnable examples demonstrating key features:

| Example                             | Description                 | Key Features                           |
| ----------------------------------- | --------------------------- | -------------------------------------- |
| `example-generate-text.ts`          | Basic text generation       | Simple prompts, synchronous generation |
| `example-simple-chat-completion.ts` | Simple chat conversation    | System messages, user prompts          |
| `example-chat-completion-tool.ts`   | Tool calling with functions | Weather API tool, function execution   |
| `example-streaming-chat.ts`         | Streaming responses         | Real-time text generation, SSE         |
| `example-image-recognition.ts`      | Multi-modal with images     | Vision models, image analysis          |
| `example-data-masking.ts`           | Data privacy integration    | DPI masking, anonymization             |

**Running Examples:**

```bash
npx tsx examples/example-generate-text.ts
```

**Note:** Examples require `AICORE_SERVICE_KEY` environment variable. See [Environment Setup](./ENVIRONMENT_SETUP.md) for configuration.

## Migration from v1

Version 2.0 introduces breaking changes for better integration with the official SAP AI SDK. For a complete migration guide with step-by-step instructions, common issues, and troubleshooting, see the [Migration Guide](./MIGRATION_GUIDE.md).

**Key Changes:**

- Provider creation is now synchronous (no `await` needed)
- Authentication via `AICORE_SERVICE_KEY` environment variable (replaces `serviceKey` parameter)
- Helper functions like `buildDpiMaskingProvider()` for easier configuration

## Important Note

> **Third-Party Provider**: This SAP AI Core provider (`@mymediset/sap-ai-provider`) is developed and maintained by mymediset, not by SAP SE. While it uses the official SAP AI SDK and integrates with SAP AI Core services, it is not an official SAP product.

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

Apache License 2.0 - see [LICENSE](./LICENSE.md) for details.

## Support

- 📖 [Documentation](https://github.com/BITASIA/sap-ai-provider)
- 🐛 [Issue Tracker](https://github.com/BITASIA/sap-ai-provider/issues)

## Documentation

### Guides

- [Environment Setup](./ENVIRONMENT_SETUP.md) - Authentication and configuration setup
- [Migration Guide](./MIGRATION_GUIDE.md) - Upgrading from v1.x to v2.x with step-by-step instructions
- [curl API Testing](./CURL_API_TESTING_GUIDE.md) - Direct API testing for debugging

### Reference

- [API Reference](./API_REFERENCE.md) - Complete API documentation with all types and functions
- [Architecture](./ARCHITECTURE.md) - Internal architecture, design decisions, and request flows

### Contributing

- [Contributing Guide](./CONTRIBUTING.md) - How to contribute to this project

## Related

- [Vercel AI SDK](https://sdk.vercel.ai/) - The AI SDK this provider extends
- [SAP AI SDK](https://sap.github.io/ai-sdk/) - Official SAP Cloud SDK for AI
- [SAP AI Core Documentation](https://help.sap.com/docs/ai-core) - Official SAP AI Core docs
