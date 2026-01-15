# SAP AI Core Provider for Vercel AI SDK

[![npm](https://img.shields.io/npm/v/@mymediset/sap-ai-provider/latest?label=npm&color=blue)](https://www.npmjs.com/package/@mymediset/sap-ai-provider)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel%20AI%20SDK-6.0+-black.svg)](https://sdk.vercel.ai/docs)
[![Language Model](https://img.shields.io/badge/Language%20Model-V3-green.svg)](https://sdk.vercel.ai/docs/ai-sdk-core/provider-interfaces)

A community provider for SAP AI Core that integrates seamlessly with the Vercel AI SDK. Built on top of the official **@sap-ai-sdk/orchestration** package, this provider enables you to use SAP's enterprise-grade AI models through the familiar Vercel AI SDK interface.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Quick Reference](#quick-reference)
- [Installation](#installation)
- [Provider Creation](#provider-creation)
  - [Option 1: Factory Function (Recommended for Custom Configuration)](#option-1-factory-function-recommended-for-custom-configuration)
  - [Option 2: Default Instance (Quick Start)](#option-2-default-instance-quick-start)
- [Authentication](#authentication)
- [Basic Usage](#basic-usage)
  - [Text Generation](#text-generation)
  - [Chat Conversations](#chat-conversations)
  - [Streaming Responses](#streaming-responses)
  - [Model Configuration](#model-configuration)
- [Supported Models](#supported-models)
- [Advanced Features](#advanced-features)
  - [Tool Calling](#tool-calling)
  - [Multi-modal Input (Images)](#multi-modal-input-images)
  - [Data Masking (SAP DPI)](#data-masking-sap-dpi)
  - [Content Filtering](#content-filtering)
  - [Document Grounding (RAG)](#document-grounding-rag)
  - [Translation](#translation)
- [Configuration Options](#configuration-options)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Performance](#performance)
- [Security](#security)
- [Debug Mode](#debug-mode)
- [Examples](#examples)
- [Migration Guides](#migration-guides)
  - [Upgrading from v3.x to v4.x](#upgrading-from-v3x-to-v4x)
  - [Upgrading from v2.x to v3.x](#upgrading-from-v2x-to-v3x)
  - [Upgrading from v1.x to v2.x](#upgrading-from-v1x-to-v2x)
- [Important Note](#important-note)
- [Contributing](#contributing)
- [Resources](#resources)
  - [Documentation](#documentation)
  - [Community](#community)
  - [Related Projects](#related-projects)
- [License](#license)

## Features

- 🔐 **Simplified Authentication** - Uses SAP AI SDK's built-in credential handling
- 🎯 **Tool Calling Support** - Full tool/function calling capabilities
- 🧠 **Reasoning-Safe by Default** - Assistant reasoning parts are not forwarded unless enabled
- 🖼️ **Multi-modal Input** - Support for text and image inputs
- 📡 **Streaming Support** - Real-time text generation with structured V3 blocks
- 🔒 **Data Masking** - Built-in SAP DPI integration for privacy
- 🛡️ **Content Filtering** - Azure Content Safety and Llama Guard support
- 🔧 **TypeScript Support** - Full type safety and IntelliSense
- 🎨 **Multiple Models** - Support for GPT-4, Claude, Gemini, Nova, and more
- ⚡ **Language Model V3** - Latest Vercel AI SDK specification with enhanced streaming

## Quick Start

```bash
npm install @mymediset/sap-ai-provider ai
```

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
import { generateText } from "ai";
import { APICallError } from "@ai-sdk/provider";

// Create provider (authentication via AICORE_SERVICE_KEY env var)
const provider = createSAPAIProvider();

try {
  // Generate text with gpt-4o
  const result = await generateText({
    model: provider("gpt-4o"),
    prompt: "Explain quantum computing in simple terms.",
  });

  console.log(result.text);
} catch (error) {
  if (error instanceof APICallError) {
    console.error("SAP AI Core API error:", error.message);
    console.error("Status:", error.statusCode);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

> **Note:** Requires `AICORE_SERVICE_KEY` environment variable. See [Environment Setup](./ENVIRONMENT_SETUP.md) for configuration.

## Quick Reference

| Task                | Code Pattern                                          | Documentation                                                 |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| **Install**         | `npm install @mymediset/sap-ai-provider ai`           | [Installation](#installation)                                 |
| **Auth Setup**      | Add `AICORE_SERVICE_KEY` to `.env`                    | [Environment Setup](./ENVIRONMENT_SETUP.md)                   |
| **Create Provider** | `createSAPAIProvider()` or use `sapai`                | [Provider Creation](#provider-creation)                       |
| **Text Generation** | `generateText({ model: provider("gpt-4o"), prompt })` | [Basic Usage](#text-generation)                               |
| **Streaming**       | `streamText({ model: provider("gpt-4o"), prompt })`   | [Streaming](#streaming-responses)                             |
| **Tool Calling**    | `generateText({ tools: { myTool: tool({...}) } })`    | [Tool Calling](#tool-calling)                                 |
| **Error Handling**  | `catch (error instanceof APICallError)`               | [API Reference](./API_REFERENCE.md#error-handling--reference) |
| **Choose Model**    | See 80+ models (GPT, Claude, Gemini, Llama)           | [Models](./API_REFERENCE.md#models)                           |

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
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider({
  resourceGroup: "production",
  deploymentId: "your-deployment-id", // Optional
});
```

### Option 2: Default Instance (Quick Start)

```typescript
import "dotenv/config"; // Load environment variables
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

1. Create a `.env` file: `cp .env.example .env`
2. Add your SAP AI Core service key JSON to `AICORE_SERVICE_KEY`
3. Import in code: `import "dotenv/config";`

**For complete setup instructions, SAP BTP deployment, troubleshooting, and advanced scenarios, see the [Environment Setup Guide](./ENVIRONMENT_SETUP.md).**

## Basic Usage

### Text Generation

**Complete example:** [examples/example-generate-text.ts](./examples/example-generate-text.ts)

```typescript
const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "Write a short story about a robot learning to paint.",
});
console.log(result.text);
```

**Run it:** `npx tsx examples/example-generate-text.ts`

### Chat Conversations

**Complete example:** [examples/example-simple-chat-completion.ts](./examples/example-simple-chat-completion.ts)

Note: assistant `reasoning` parts are dropped by default. Set `includeReasoning: true` on the model settings if you explicitly want to forward them.

```typescript
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

**Run it:** `npx tsx examples/example-simple-chat-completion.ts`

### Streaming Responses

**Complete example:** [examples/example-streaming-chat.ts](./examples/example-streaming-chat.ts)

```typescript
const result = streamText({
  model: provider("gpt-4o"),
  prompt: "Explain machine learning concepts.",
});

for await (const delta of result.textStream) {
  process.stdout.write(delta);
}
```

**Run it:** `npx tsx examples/example-streaming-chat.ts`

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

This provider supports all models available through SAP AI Core Orchestration service, including:

**Popular models:**

- **OpenAI**: gpt-4o, gpt-4o-mini, gpt-4.1, o1, o3 (recommended for multi-tool apps)
- **Anthropic Claude**: anthropic--claude-3.5-sonnet, anthropic--claude-4-opus
- **Google Gemini**: gemini-2.5-pro, gemini-2.0-flash

⚠️ **Important:** Google Gemini models have a 1 tool limit per request.

- **Amazon Nova**: amazon--nova-pro, amazon--nova-lite
- **Open Source**: mistralai--mistral-large-instruct, meta--llama3.1-70b-instruct

> **Note:** Model availability depends on your SAP AI Core tenant configuration, region, and subscription.

**To discover available models in your environment:**

```bash
curl "https://<AI_API_URL>/v2/lm/deployments" -H "Authorization: Bearer $TOKEN"
```

For complete model details, capabilities comparison, and limitations, see **[API Reference: SAPAIModelId](./API_REFERENCE.md#sapaimodelid)**.

## Advanced Features

The following helper functions are exported by this package for convenient configuration of SAP AI Core features. These builders provide type-safe configuration for data masking, content filtering, grounding, and translation modules.

### Tool Calling

> **Note on Terminology:** This documentation uses "tool calling" (Vercel AI SDK convention), equivalent to "function calling" in OpenAI documentation. Both terms refer to the same capability of models invoking external functions.

📖 **Complete guide:** [API Reference - Tool Calling](./API_REFERENCE.md#tool-calling-function-calling)  
**Complete example:** [examples/example-chat-completion-tool.ts](./examples/example-chat-completion-tool.ts)

```typescript
const weatherTool = tool({
  description: "Get weather for a location",
  inputSchema: z.object({ location: z.string() }),
  execute: (args) => `Weather in ${args.location}: sunny, 72°F`,
});

const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "What's the weather in Tokyo?",
  tools: { getWeather: weatherTool },
  maxSteps: 3,
});
```

**Run it:** `npx tsx examples/example-chat-completion-tool.ts`

⚠️ **Important:** Gemini models support only 1 tool per request. For multi-tool applications, use GPT-4o, Claude, or Amazon Nova models. See [API Reference - Tool Calling](./API_REFERENCE.md#tool-calling-function-calling) for complete model comparison.

### Multi-modal Input (Images)

**Complete example:** [examples/example-image-recognition.ts](./examples/example-image-recognition.ts)

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

**Run it:** `npx tsx examples/example-image-recognition.ts`

### Data Masking (SAP DPI)

Use SAP's Data Privacy Integration to mask sensitive data:

```typescript
import { buildDpiMaskingProvider } from "@mymediset/sap-ai-provider";

const dpiConfig = buildDpiMaskingProvider({
  method: "anonymization",
  entities: ["profile-email", "profile-person", "profile-phone"],
});
```

**Full documentation:** [API_REFERENCE.md - Data Masking](./API_REFERENCE.md#builddpimaskingproviderconfig)

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

**Full documentation:** [API_REFERENCE.md - Content Filtering](./API_REFERENCE.md#buildazurecontentsafetyfiltertype-config)

### Document Grounding (RAG)

Ground LLM responses in your own documents using vector databases.

**Complete example:** [examples/example-document-grounding.ts](./examples/example-document-grounding.ts)  
**Complete documentation:** [API Reference - Document Grounding](./API_REFERENCE.md#builddocumentgroundingconfigconfig)

```typescript
const provider = createSAPAIProvider({
  defaultSettings: {
    grounding: buildDocumentGroundingConfig({
      filters: [
        {
          id: "vector-store-1", // Your vector database ID
          data_repositories: ["*"], // Search all repositories
        },
      ],
      placeholders: {
        input: ["?question"],
        output: "groundingOutput",
      },
    }),
  },
});

// Queries are now grounded in your documents
const model = provider("gpt-4o");
```

**Run it:** `npx tsx examples/example-document-grounding.ts`

### Translation

Automatically translate user queries and model responses.

**Complete example:** [examples/example-translation.ts](./examples/example-translation.ts)  
**Complete documentation:** [API Reference - Translation](./API_REFERENCE.md#buildtranslationconfigtype-config)

```typescript
const provider = createSAPAIProvider({
  defaultSettings: {
    translation: {
      // Translate user input from German to English
      input: buildTranslationConfig("input", {
        sourceLanguage: "de",
        targetLanguage: "en",
      }),
      // Translate model output from English to German
      output: buildTranslationConfig("output", {
        targetLanguage: "de",
      }),
    },
  },
});

// Model handles German input/output automatically
const model = provider("gpt-4o");
```

**Run it:** `npx tsx examples/example-translation.ts`

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

**Quick Example:**

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
    // SAP-specific metadata in responseBody
    const sapError = JSON.parse(error.responseBody ?? "{}");
    console.error("Request ID:", sapError.error?.request_id);
  }
}
```

**Complete reference:**

- **[API Reference - Error Handling](./API_REFERENCE.md#error-handling-examples)** - Complete examples with all error properties
- **[API Reference - HTTP Status Codes](./API_REFERENCE.md#http-status-code-reference)** - Status code reference table
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

Error code reference table: [API Reference - HTTP Status Codes](./API_REFERENCE.md#http-status-code-reference)

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
- Log request IDs from `error.responseBody` (parse JSON for `request_id`) to correlate with backend traces.
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

> **Note:** Examples require `AICORE_SERVICE_KEY` environment variable. See [Environment Setup](./ENVIRONMENT_SETUP.md) for configuration.

## Migration Guides

### Upgrading from v3.x to v4.x

Version 4.0 migrates from **LanguageModelV2** to **LanguageModelV3** specification (AI SDK 6.0+). **See the [Migration Guide](./MIGRATION_GUIDE.md#version-3x-to-4x-breaking-changes) for complete upgrade instructions.**

**Key changes:**

- **Finish Reason**: Changed from string to object (`result.finishReason.unified`)
- **Usage Structure**: Nested format with detailed token breakdown (`result.usage.inputTokens.total`)
- **Stream Events**: Structured blocks (`text-start`, `text-delta`, `text-end`) instead of simple deltas
- **Warning Types**: Updated format with `feature` field for categorization

**Impact by user type:**

- High-level API users (`generateText`/`streamText`): ✅ Minimal impact (likely no changes)
- Direct provider users: ⚠️ Update type imports (`LanguageModelV2` → `LanguageModelV3`)
- Custom stream parsers: ⚠️ Update parsing logic for V3 structure

### Upgrading from v2.x to v3.x

Version 3.0 standardizes error handling to use Vercel AI SDK native error types. **See the [Migration Guide](./MIGRATION_GUIDE.md#v2x--v30) for complete upgrade instructions.**

**Key changes:**

- `SAPAIError` removed → Use `APICallError` from `@ai-sdk/provider`
- Error properties: `error.code` → `error.statusCode`
- Automatic retries for rate limits (429) and server errors (5xx)

### Upgrading from v1.x to v2.x

Version 2.0 uses the official SAP AI SDK. **See the [Migration Guide](./MIGRATION_GUIDE.md#v1x--v20) for complete upgrade instructions.**

**Key changes:**

- Authentication via `AICORE_SERVICE_KEY` environment variable
- Synchronous provider creation: `createSAPAIProvider()` (no await)
- Helper functions from SAP AI SDK

**For detailed migration instructions with code examples, see the [complete Migration Guide](./MIGRATION_GUIDE.md).**

## Important Note

> **Third-Party Provider**: This SAP AI Core provider (`@mymediset/sap-ai-provider`) is developed and maintained by mymediset, not by SAP SE. While it uses the official SAP AI SDK and integrates with SAP AI Core services, it is not an official SAP product.

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

## Resources

### Documentation

- [Migration Guide](./MIGRATION_GUIDE.md) - Version upgrade instructions (v1.x → v2.x → v3.x → v4.x)
- [API Reference](./API_REFERENCE.md) - Complete API documentation with all types and functions
- [Environment Setup](./ENVIRONMENT_SETUP.md) - Authentication and configuration setup
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
- [Architecture](./ARCHITECTURE.md) - Internal architecture, design decisions, and request flows
- [curl API Testing](./CURL_API_TESTING_GUIDE.md) - Direct API testing for debugging

### Community

- 🐛 [Issue Tracker](https://github.com/BITASIA/sap-ai-provider/issues) - Report bugs and request features
- 💬 [Discussions](https://github.com/BITASIA/sap-ai-provider/discussions) - Ask questions and share ideas

### Related Projects

- [Vercel AI SDK](https://sdk.vercel.ai/) - The AI SDK this provider extends
- [SAP AI SDK](https://sap.github.io/ai-sdk/) - Official SAP Cloud SDK for AI
- [SAP AI Core Documentation](https://help.sap.com/docs/ai-core) - Official SAP AI Core docs

## License

Apache License 2.0 - see [LICENSE](./LICENSE.md) for details.
