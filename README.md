# SAP AI Core Provider for Vercel AI SDK

[![npm](https://img.shields.io/npm/v/@mymediset/sap-ai-provider/latest?label=npm&color=blue)](https://www.npmjs.com/package/@mymediset/sap-ai-provider)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A community provider for SAP AI Core that integrates seamlessly with the Vercel AI SDK. Built on top of the official **@sap-ai-sdk/orchestration** package, this provider enables you to use SAP's enterprise-grade AI models through the familiar Vercel AI SDK interface.

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
- 🎯 **Tool Calling Support** - Full function calling capabilities
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

## Authentication

The SAP AI SDK handles authentication automatically using environment variables or SAP BTP service bindings.

**Quick Setup:**

- **Local development**: Set `AICORE_SERVICE_KEY` environment variable with your service key JSON
- **SAP BTP**: Service binding via `VCAP_SERVICES` (automatic)

For detailed setup instructions, troubleshooting, and security best practices, see:

- [Setting up AICORE_SERVICE_KEY](./ENVIRONMENT_SETUP.md#setting-up-aicore_service_key-v20)
- [Authentication Methods](./ENVIRONMENT_SETUP.md#authentication-methods)
- [Troubleshooting Authentication](./ENVIRONMENT_SETUP.md#troubleshooting)

## Basic Usage

### Text Generation

```typescript
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
import { generateText } from "ai";

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
import { streamText } from "ai";

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

This provider works with models available via SAP AI Core Orchestration (OpenAI, Anthropic, Google Vertex AI, Amazon Bedrock, and selected open-source models).

- Overview: GPT-4 family, Claude 3/4, Gemini 2.x, Amazon Nova, Mistral, Cohere
- Availability varies by tenant and region

For exact identifiers and the authoritative list, see [API Reference: SAPAIModelId](./API_REFERENCE.md#sapaimodelid).

## Advanced Features

The following helper functions are exported by this package for convenient configuration of SAP AI Core features. These builders provide type-safe configuration for data masking, content filtering, grounding, and translation modules.

### Tool Calling

```typescript
import { generateText, tool } from "ai";
import { z } from "zod";

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
import {
  createSAPAIProvider,
  buildDpiMaskingProvider,
} from "@mymediset/sap-ai-provider";

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

### Provider Settings

```typescript
interface SAPAIProviderSettings {
  resourceGroup?: string; // SAP AI Core resource group (default: 'default')
  deploymentId?: string; // Specific deployment ID (auto-resolved if not set)
  warnOnAmbiguousConfig?: boolean; // Emit warnings (default: true)
  // Note: if both `deploymentId` and `resourceGroup` are provided, `deploymentId` takes precedence.
  destination?: HttpDestinationOrFetchOptions; // Custom destination
  defaultSettings?: SAPAISettings; // Default settings for all models
}
```

### Model Settings

```typescript
interface SAPAISettings {
  modelVersion?: string; // Model version (default: 'latest')
  modelParams?: {
    maxTokens?: number; // Maximum tokens to generate
    temperature?: number; // Sampling temperature (0-2)
    topP?: number; // Nucleus sampling (0-1)
    frequencyPenalty?: number; // Frequency penalty (-2 to 2)
    presencePenalty?: number; // Presence penalty (-2 to 2)
    n?: number; // Number of completions
    parallel_tool_calls?: boolean; // Enable parallel tool calls
  };
  masking?: MaskingModule; // Data masking (DPI) configuration
  filtering?: FilteringModule; // Content filtering configuration
}
```

For complete configuration details, see [API Reference - Configuration](./API_REFERENCE.md#sapaiprovidersettings).

## Error Handling

The provider includes structured error handling with detailed context:

This provider throws standard Vercel AI SDK errors (e.g. `APICallError`, `LoadAPIKeyError`).

```typescript
import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";

try {
  const result = await generateText({
    model: provider("gpt-4o"),
    prompt: "Hello world",
  });
} catch (error) {
  if (error instanceof LoadAPIKeyError) {
    console.error("Missing/invalid SAP AI Core credentials:", error.message);
  } else if (error instanceof APICallError) {
    console.error("Status:", error.statusCode);
    console.error("Retryable:", error.isRetryable);

    // SAP-specific metadata is preserved in responseBody
    if (error.responseBody) {
      console.error("SAP responseBody:", error.responseBody);
    }
  }
}
```

For complete error reference and troubleshooting, see:

- [API Reference - Error Codes](./API_REFERENCE.md#error-codes)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)

## Troubleshooting

Common issues and error codes are documented in [API Reference: Error Codes](./API_REFERENCE.md#error-codes). Quick tips:

- Authentication (401): Check `AICORE_SERVICE_KEY` or `VCAP_SERVICES`
- Model not found (404): Confirm tenant/region supports the model ID
- Rate limit (429): Use retries/backoff; prefer streaming for long outputs
- Streaming: Iterate `textStream` as shown; don’t mix `generateText` and `streamText` in one call

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

The `examples/` directory contains complete, runnable examples:

- `example-generate-text.ts` - Basic text generation
- `example-chat-completion-tool.ts` - Function calling with tools
- `example-streaming-chat.ts` - Streaming responses
- `example-image-recognition.ts` - Multi-modal with images
- `example-data-masking.ts` - Data privacy integration

Run any example with:

```bash
npx tsx examples/example-generate-text.ts
```

## Migration from v1

Version 2.0 introduces breaking changes for better integration with the official SAP AI SDK. For a complete migration guide with step-by-step instructions, common issues, and troubleshooting, see the [Migration Guide](./MIGRATION_GUIDE.md).

**Key Changes:**

- Provider creation is now synchronous (no `await` needed)
- Authentication via `AICORE_SERVICE_KEY` environment variable (replaces `serviceKey` parameter)
- Helper functions like `buildDpiMaskingProvider()` for easier configuration

## Important Note

> **Third-Party Provider**: This SAP AI Core provider (`@mymediset/sap-ai-provider`) is developed and maintained by mymediset, not by SAP SE. While it uses the official SAP AI SDK and integrates with SAP AI Core services, it is not an official SAP product.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

Apache License 2.0 - see [LICENSE](LICENSE.md) for details.

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
