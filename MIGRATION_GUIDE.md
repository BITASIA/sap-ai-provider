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
// Set AICORE_SERVICE_KEY environment variable
// Provider is now synchronous
const provider = createSAPAIProvider();
```

**Important Changes:**

- Environment variable changed: `SAP_AI_SERVICE_KEY` (v1.x) → `AICORE_SERVICE_KEY` (v2.x)
- Provider creation is now synchronous (no `await` needed)
- Authentication handled automatically by SAP AI SDK

**For complete authentication setup instructions, environment variables, troubleshooting, and security best practices, see the [Environment Setup Guide](./ENVIRONMENT_SETUP.md).**

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

### Authentication Changes:\*\*

- Removed `serviceKey` option from `createSAPAIProvider()`
- Authentication now via `AICORE_SERVICE_KEY` environment variable (local) or `VCAP_SERVICES` (SAP BTP)
- SAP AI SDK handles token management automatically

**Migration:** See **[Environment Setup](./ENVIRONMENT_SETUP.md)** for complete authentication configuration.

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

**Migration:** Authentication is now automatic. Set `AICORE_SERVICE_KEY` environment variable. See **[Environment Setup](./ENVIRONMENT_SETUP.md)** for complete instructions.

```typescript
// ❌ Old v1.x approach (removed)
const provider = await createSAPAIProvider({
  token: "your-oauth-token",
  deploymentId: "your-deployment",
});

// ✅ New v2.x approach (automatic authentication)
const provider = createSAPAIProvider({
  resourceGroup: "default",
  deploymentId: "your-deployment", // optional
});
```

---

## New Features

### 2.0.x Features

V2.0 introduces several powerful features built on top of the official SAP AI SDK. For detailed API documentation and complete examples, see [API_REFERENCE.md](./API_REFERENCE.md).

#### 1. SAP AI SDK Integration

Full integration with `@sap-ai-sdk/orchestration` for authentication and API communication. Authentication is now automatic via `AICORE_SERVICE_KEY` environment variable or `VCAP_SERVICES` service binding.

```typescript
const provider = createSAPAIProvider({
  resourceGroup: "production",
  deploymentId: "d65d81e7c077e583", // Optional - auto-resolved if omitted
});
```

**See:** [API_REFERENCE.md - SAPAIProviderSettings](./API_REFERENCE.md#sapaiprovidersettings)

#### 2. Data Masking (DPI)

Automatically anonymize or pseudonymize sensitive information (emails, phone numbers, names) using SAP's Data Privacy Integration:

```typescript
import { buildDpiMaskingProvider } from "@mymediset/sap-ai-provider";

const model = provider("gpt-4o", {
  masking: {
    masking_providers: [
      buildDpiMaskingProvider({
        method: "anonymization",
        entities: ["profile-email", "profile-person", "profile-phone"],
      }),
    ],
  },
});
```

**See:** [API_REFERENCE.md - Data Masking](./API_REFERENCE.md#data-masking-dpi), [example-data-masking.ts](./examples/example-data-masking.ts)

#### 3. Content Filtering

Filter harmful content using Azure Content Safety or Llama Guard for input/output safety:

```typescript
import { buildAzureContentSafetyFilter } from "@mymediset/sap-ai-provider";

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

**See:** [API_REFERENCE.md - Content Filtering](./API_REFERENCE.md#content-filtering)

#### 4. Response Format Control

Specify structured output formats including JSON schema for deterministic responses:

```typescript
// JSON object response
const model1 = provider("gpt-4o", {
  responseFormat: { type: "json_object" },
});

// JSON schema response (structured output with validation)
const model2 = provider("gpt-4o", {
  responseFormat: {
    type: "json_schema",
    json_schema: {
      name: "user_profile",
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
});
```

**See:** [API_REFERENCE.md - Response Format](./API_REFERENCE.md#response-format)

#### 5. Default Settings

Apply consistent settings across all models created by a provider instance:

```typescript
const provider = createSAPAIProvider({
  defaultSettings: {
    modelParams: { temperature: 0.7, maxTokens: 2000 },
    masking: {
      /* DPI config */
    },
  },
});

// All models inherit default settings
const model1 = provider("gpt-4o"); // temperature=0.7
const model2 = provider("gpt-4o", {
  modelParams: { temperature: 0.3 }, // Override per model
});
```

**See:** [API_REFERENCE.md - Default Settings](./API_REFERENCE.md#default-settings)

#### 6. Enhanced Streaming & Error Handling

Improved streaming support with better error recovery and detailed error messages including request IDs and error locations for debugging.

**See:** [README.md - Streaming](./README.md#streaming), [API_REFERENCE.md - Error Handling](./API_REFERENCE.md#error-handling)

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
