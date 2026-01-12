# Migration Guide

Guide for migrating between versions of the SAP AI Core Provider.

## Table of Contents

- [Overview](#overview)
- [Version 1.x to 2.x (Breaking Changes)](#version-1x-to-2x-breaking-changes)
- [Breaking Changes](#breaking-changes)
- [Deprecations](#deprecations)
- [New Features](#new-features)
- [API Changes](#api-changes)
- [Migration Checklist](#migration-checklist)

---

## Overview

This guide helps you migrate your application when upgrading to newer versions of the SAP AI Core Provider. It covers breaking changes, deprecations, and new features.

---

## Version 1.x to 2.x (Breaking Changes)

**Version 2.0 is a complete rewrite using the official SAP AI SDK (@sap-ai-sdk/orchestration).**

### Summary of Changes

**Breaking Changes:**

- Provider creation is now **synchronous** (no more `await`)
- Authentication via `AICORE_SERVICE_KEY` environment variable (no more `serviceKey` option)
- Uses official SAP AI SDK for authentication and API communication
- Requires Vercel AI SDK v6.0+

**New Features:**

- Complete SAP AI SDK v2 orchestration integration
- Data masking with SAP Data Privacy Integration (DPI)
- Content filtering (Azure Content Safety, Llama Guard)
- Grounding and translation modules support
- Helper functions for configuration (`buildDpiMaskingProvider`, `buildAzureContentSafetyFilter`, etc.)
- `responseFormat` configuration for structured outputs
- Enhanced streaming support
- Better error messages with detailed context

**Improvements:**

- Automatic authentication handling by SAP AI SDK
- Better type definitions with comprehensive JSDoc
- Improved error handling
- More reliable streaming

### Migration Steps

#### 1. Update Package

```bash
npm install @mymediset/sap-ai-provider@latest ai@latest
```

#### 2. Update Authentication

**Before (v1.x):**

```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});
```

**After (v2.x):**

```typescript
// Set AICORE_SERVICE_KEY environment variable (see ENVIRONMENT_SETUP.md for details)
// Provider is now synchronous
const provider = createSAPAIProvider();
```

For detailed authentication setup, see [Environment Setup](./ENVIRONMENT_SETUP.md#setting-up-aicore_service_key-v20).

#### 3. Update Code (Remove await)

**Before (v1.x):**

```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});

const model = provider("gpt-4o");
const result = await generateText({ model, prompt: "Hello!" });
```

**After (v2.x):**

```typescript
// No await needed
const provider = createSAPAIProvider();

const model = provider("gpt-4o");
const result = await generateText({ model, prompt: "Hello!" });
```

#### 4. Verify Functionality

After updating authentication and removing `await` from provider creation, run your tests and basic examples (`examples/`) to verify generation and streaming work as expected.

#### 5. Optional: Adopt New Features

##### Data Masking (DPI)

**Before (v1.x):** No masking support

**After (v2.x):** Add DPI masking using helper function

```typescript
import "dotenv/config"; // Load environment variables
import {
  createSAPAIProvider,
  buildDpiMaskingProvider,
} from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider({
  defaultSettings: {
    masking: {
      masking_providers: [
        buildDpiMaskingProvider({
          method: "anonymization",
          entities: ["profile-email", "profile-person"],
        }),
      ],
    },
  },
});
```

##### Content Filtering

**New in v2.x:** Azure Content Safety filtering

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

##### Response Format

You can specify structured outputs with response format:

```typescript
const model = provider("gpt-4o", {
  responseFormat: {
    type: "json_schema",
    json_schema: {
      name: "user_data",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      },
    },
  },
});
```

##### Synchronous Provider Creation

In v2.x, provider creation is synchronous by default (no `await` required):

```typescript
const provider = createSAPAIProvider();
```

---

## Breaking Changes

### Version 2.0.x

**Authentication Changes:**

- Removed `serviceKey` option from `createSAPAIProvider()`
- Authentication now handled automatically by SAP AI SDK via:
  - `AICORE_SERVICE_KEY` environment variable (local development)
  - `VCAP_SERVICES` service binding (SAP BTP)

**Synchronous Provider Creation:**

- Provider creation is now synchronous
- Remove `await` from `createSAPAIProvider()` calls

**API Changes:**

- Removed direct OAuth2 token management
- Removed `completionPath` option (routing handled by SAP AI SDK)
- Updated to use SAP AI SDK types directly

---

## Deprecations

### Manual OAuth2 Token Management (Removed in v2.0)

**Status:** Removed in v2.0

**What:** Manual token management and `token` option in provider settings

**Replacement:** Automatic authentication via SAP AI SDK

**Migration:**

Authentication is now handled automatically by the SAP AI SDK. Simply set the `AICORE_SERVICE_KEY` environment variable.

```typescript
// ❌ Old v1.x approach (removed)
const provider = await createSAPAIProvider({
  token: "your-oauth-token",
  deploymentId: "your-deployment",
});

// ✅ New v2.x approach (automatic authentication)
// Set environment variable: AICORE_SERVICE_KEY='{"serviceurls":...}'
const provider = createSAPAIProvider({
  resourceGroup: "default",
  deploymentId: "your-deployment", // optional
});
```

---

## New Features

### 2.0.x Features

#### 1. SAP AI SDK Integration

Full integration with the official SAP AI SDK for authentication and API communication:

```typescript
// Automatic authentication via environment variable
const provider = createSAPAIProvider();

// Or with specific configuration
const provider = createSAPAIProvider({
  resourceGroup: "production",
  deploymentId: "d65d81e7c077e583",
});
```

#### 2. Data Masking (DPI)

Automatically anonymize or pseudonymize sensitive information using helper functions:

```typescript
import "dotenv/config"; // Load environment variables
import {
  createSAPAIProvider,
  buildDpiMaskingProvider,
} from "@mymediset/sap-ai-provider";

const model = provider("gpt-4o", {
  masking: {
    masking_providers: [
      buildDpiMaskingProvider({
        method: "anonymization",
        entities: [
          "profile-email",
          "profile-person",
          {
            type: "profile-phone",
            replacement_strategy: { method: "constant", value: "REDACTED" },
          },
        ],
        allowlist: ["SAP", "BTP"],
      }),
    ],
  },
});
```

#### 3. Content Filtering

Filter harmful content using Azure Content Safety or Llama Guard:

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
            selfHarm: "ALLOW_SAFE",
            sexual: "ALLOW_SAFE",
          }),
        ],
      },
    },
  },
});
```

#### 4. Response Format Control

Specify desired response format for structured outputs:

```typescript
// Text response (default when no tools)
const model1 = provider("gpt-4o", {
  responseFormat: { type: "text" },
});

// JSON object response
const model2 = provider("gpt-4o", {
  responseFormat: { type: "json_object" },
});

// JSON schema response (structured output)
const model3 = provider("gpt-4o", {
  responseFormat: {
    type: "json_schema",
    json_schema: {
      name: "user_profile",
      description: "User profile data",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
          email: { type: "string", format: "email" },
        },
        required: ["name"],
      },
      strict: true,
    },
  },
});
```

#### 5. Default Settings

Apply settings to all models created by a provider:

```typescript
const provider = createSAPAIProvider({
  defaultSettings: {
    modelParams: {
      temperature: 0.7,
      maxTokens: 2000,
    },
    masking: {
      /* DPI config */
    },
  },
});

// All models inherit default settings
const model1 = provider("gpt-4o"); // Has temperature=0.7, maxTokens=2000
const model2 = provider("anthropic--claude-3.5-sonnet"); // Same defaults

// Override per model
const model3 = provider("gpt-4o", {
  modelParams: {
    temperature: 0.3, // Overrides default
  },
});
```

#### 6. Enhanced Streaming

Improved streaming support with better error handling:

```typescript
import "dotenv/config"; // Load environment variables
import { streamText } from "ai";

const result = streamText({
  model: provider("gpt-4o"),
  prompt: "Write a story",
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

#### 7. Improved Error Messages

More detailed error information:

```typescript
import "dotenv/config"; // Load environment variables
import { SAPAIError } from "@mymediset/sap-ai-provider";

try {
  await generateText({ model, prompt });
} catch (error) {
  if (error instanceof SAPAIError) {
    console.error({
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      location: error.location,
    });
  }
}
```

---

## API Changes

### Added APIs

#### Helper Functions (v2.0+)

New helper functions exported from the SAP AI SDK:

```typescript
// Data masking
buildDpiMaskingProvider(config: DpiConfig): DpiMaskingProvider

// Content filtering
buildAzureContentSafetyFilter(type: 'input' | 'output', config: AzureContentSafetyConfig): Filter
buildLlamaGuard38BFilter(type: 'input' | 'output'): Filter

// Grounding and translation
buildDocumentGroundingConfig(config: GroundingConfig): GroundingModule
buildTranslationConfig(config: TranslationConfig): TranslationModule
```

#### `SAPAISettings.responseFormat`

New property for controlling response format:

```typescript
interface SAPAISettings {
  // ... existing properties ...
  responseFormat?:
    | { type: 'text' }
    | { type: 'json_object' }
    | { type: 'json_schema'; json_schema: { ... } };
}
```

#### `SAPAISettings.masking`

New property for data masking configuration:

```typescript
interface SAPAISettings {
  // ... existing properties ...
  masking?: MaskingModule;
}
```

#### `SAPAISettings.filtering`

New property for content filtering configuration:

```typescript
interface SAPAISettings {
  // ... existing properties ...
  filtering?: FilteringModule;
}
```

#### `SAPAIProviderSettings.defaultSettings`

New property for provider-wide default settings:

```typescript
interface SAPAIProviderSettings {
  // ... existing properties ...
  defaultSettings?: SAPAISettings;
}
```

### Modified APIs

#### `createSAPAIProvider`

Now synchronous and uses SAP AI SDK for authentication:

```typescript
// Before (v1.x) - Async with serviceKey
async function createSAPAIProvider(options?: {
  serviceKey?: string | SAPAIServiceKey;
  token?: string;
  deploymentId?: string;
  resourceGroup?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}): Promise<SAPAIProvider>;

// After (v2.x) - Synchronous with SAP AI SDK
function createSAPAIProvider(options?: {
  resourceGroup?: string; // default: 'default'
  deploymentId?: string; // optional, auto-resolved if not provided
  destination?: HttpDestinationOrFetchOptions; // optional custom destination
  defaultSettings?: SAPAISettings; // optional default settings
}): SAPAIProvider;
```

### Removed APIs

#### `serviceKey` option (v2.0+)

Authentication is now handled by the SAP AI SDK via `AICORE_SERVICE_KEY` environment variable.

#### `token` option (v2.0+)

Manual token management is no longer supported. Use SAP AI SDK's automatic authentication.

#### `baseURL`, `completionPath`, `headers`, `fetch` options (v2.0+)

These low-level options are no longer needed. The SAP AI SDK handles routing and configuration.

---

## Migration Checklist

### Upgrading from 1.x to 2.x

- [ ] Update packages: `npm install @mymediset/sap-ai-provider@latest ai@latest`
- [ ] Set `AICORE_SERVICE_KEY` environment variable (remove `serviceKey` from code)
- [ ] Remove `await` from `createSAPAIProvider()` calls (now synchronous)
- [ ] Remove `serviceKey`, `token`, `baseURL`, `completionPath` options from provider settings
- [ ] Update masking configuration to use `buildDpiMaskingProvider()` helper
- [ ] Update filtering configuration to use helper functions if applicable
- [ ] Run tests to verify existing functionality
- [ ] Review new features (content filtering, grounding, translation)
- [ ] Consider adopting default settings for cleaner code
- [ ] Update documentation to reflect v2 API
- [ ] Update TypeScript imports if using advanced types

### Testing Checklist

After migration:

- [ ] Provider initialization works
- [ ] Text generation works
- [ ] Streaming works
- [ ] Tool calling works (if used)
- [ ] Multi-modal inputs work (if used)
- [ ] Structured outputs work (if used)
- [ ] Error handling works correctly
- [ ] Performance is acceptable
- [ ] All tests pass

---

## Common Migration Issues

### Issue 1: Type Errors After Upgrade

**Problem:** TypeScript errors after upgrading

**Solution:** Rebuild your project and update type definitions:

```bash
npm run clean
npm run build
npm run type-check
```

### Issue 2: Authentication Errors

**Problem:** Authentication failures after upgrading to v2.x

**Solution:** Ensure `AICORE_SERVICE_KEY` environment variable is set correctly:

```bash
# .env file
AICORE_SERVICE_KEY='{"serviceurls":{"AI_API_URL":"https://..."},"clientid":"...","clientsecret":"...","url":"..."}'
```

On SAP BTP, ensure the AI Core service is bound to your application (VCAP_SERVICES).

### Issue 3: Masking Configuration Errors

**Problem:** Errors when using masking configuration

**Solution:** Use the helper function `buildDpiMaskingProvider()`:

```typescript
import "dotenv/config"; // Load environment variables
import { buildDpiMaskingProvider } from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider({
  defaultSettings: {
    masking: {
      masking_providers: [
        buildDpiMaskingProvider({
          method: "anonymization",
          entities: ["profile-email", "profile-person"],
        }),
      ],
    },
  },
});
```

---

## Rollback Instructions

If you need to rollback to a previous version:

### Rollback to 1.x

```bash
npm install @mymediset/sap-ai-provider@1.0.3 ai@5
```

**Note:** Version 1.x uses a different authentication approach and async provider creation.

### Verify Installation

```bash
npm list @mymediset/sap-ai-provider
```

### Clear Cache

```bash
rm -rf node_modules
rm package-lock.json
npm install
```

---

## Getting Help

If you encounter issues during migration:

1. **Check Documentation:**
   - [README.md](./README.md)
   - [API_REFERENCE.md](./API_REFERENCE.md)
   - [TROUBLESHOOTING](./README.md#troubleshooting) section

2. **Search Issues:**
   - [GitHub Issues](https://github.com/BITASIA/sap-ai-provider/issues)

3. **Create New Issue:**
   - Include: Version numbers, error messages, code samples
   - Tag as: `migration`, `question`, or `bug`

4. **Community:**
   - Check discussions for similar issues
   - Ask questions with detailed context

---

## Related Documentation

- [README.md](./README.md) - Getting started and feature overview
- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API documentation for v2.x
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Authentication setup for both v1 and v2
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture (v2 implementation)
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Development and contribution guidelines
