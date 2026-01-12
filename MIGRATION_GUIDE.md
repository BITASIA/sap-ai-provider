# Migration Guide

Guide for migrating between versions of the SAP AI Core Provider.

## Table of Contents

- [Overview](#overview)
- [Version 1.0.x to 1.1.x](#version-10x-to-11x)
- [Breaking Changes](#breaking-changes)
- [Deprecations](#deprecations)
- [New Features](#new-features)
- [API Changes](#api-changes)
- [Migration Checklist](#migration-checklist)

---

## Overview

This guide helps you migrate your application when upgrading to newer versions of the SAP AI Core Provider. It covers breaking changes, deprecations, and new features.

---

## Version 1.0.x to 1.1.x

### Summary of Changes

**Breaking Changes:**

- None

**New Features:**

- Orchestration v2 API support
- Data masking with SAP Data Privacy Integration (DPI)
- `responseFormat` configuration
- `createSAPAIProviderSync` for synchronous initialization
- Enhanced streaming support
- `completionPath` option for custom endpoints

**Improvements:**

- Better error messages
- Improved type definitions
- Enhanced JSDoc documentation
- Backward-compatible v1 API fallback

### Migration Steps

#### 1. Update Package

```bash
npm install @mymediset/sap-ai-provider@latest
```

#### 2. No Code Changes Required

The 1.1.x release is fully backward compatible with 1.0.x. Your existing code will continue to work without modifications.

```typescript
// ✅ This code works in both 1.0.x and 1.1.x
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});

const model = provider("gpt-4o");
const result = await generateText({ model, prompt: "Hello!" });
```

#### 3. Optional: Adopt New Features

##### Data Masking (DPI)

**Before (1.0.x):** No masking support

**After (1.1.x):** Add DPI masking

```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  defaultSettings: {
    masking: {
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
          ],
        },
      ],
    },
  },
});
```

##### Response Format

**Before (1.0.x):** No explicit response format control

**After (1.1.x):** Specify response format

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

**Before (1.0.x):** Only async initialization

**After (1.1.x):** Synchronous option available

```typescript
// When you already have a token
const provider = createSAPAIProviderSync({
  token: "your-oauth-token",
  deploymentId: "your-deployment",
});
```

---

## Breaking Changes

### None in Current Versions

All versions maintain backward compatibility. No breaking changes have been introduced.

---

## Deprecations

### API Endpoint v1 (Deprecated)

**Status:** Deprecated, decommission on **October 31, 2026**

**What:** The v1 completion endpoint `POST /completion`

**Replacement:** Use v2 endpoint `POST /v2/completion` (default in 1.1.x)

**Migration:**

The provider automatically uses v2 by default. To explicitly target v1 (not recommended):

```typescript
// Legacy v1 (deprecated)
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  baseURL: "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com",
  completionPath: "/completion", // v1 endpoint
});

// ✅ Recommended: v2 (default)
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  // Uses v2 by default
});
```

---

## New Features

### 1.1.x Features

#### 1. Data Masking (DPI)

Automatically anonymize or pseudonymize sensitive information:

```typescript
const model = provider("gpt-4o", {
  masking: {
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
            regex: "\\b[0-9]{4}-[0-9]{4}\\b",
            replacement_strategy: { method: "constant", value: "ID_REDACTED" },
          },
        ],
        allowlist: ["SAP", "BTP"],
      },
    ],
  },
});
```

#### 2. Response Format Control

Specify desired response format:

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

#### 3. Default Settings

Apply settings to all models created by a provider:

```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  defaultSettings: {
    modelParams: {
      temperature: 0.7,
      maxTokens: 2000,
    },
    // safePrompt is currently reserved (no effect)
    // Use `responseFormat` for structured outputs.
    masking: {
      /* DPI config */
    },
  },
});

// All models inherit default settings
const model1 = provider("gpt-4o"); // Has temperature=0.7, maxTokens=2000
const model2 = provider("claude-3.5-sonnet"); // Same defaults

// Override per model
const model3 = provider("gpt-4o", {
  modelParams: {
    temperature: 0.3, // Overrides default
  },
});
```

#### 4. Custom Completion Path

Target different endpoints:

```typescript
// Default: /inference/deployments/{id}/v2/completion
const provider1 = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});

// Top-level v2 endpoint
const provider2 = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  baseURL: "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com",
  completionPath: "/v2/completion",
});

// Custom path
const provider3 = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  completionPath: "/custom/completion",
});
```

#### 5. Enhanced Streaming

Improved streaming support with better error handling:

```typescript
import { streamText } from "ai";

const { textStream } = await streamText({
  model: provider("gpt-4o"),
  prompt: "Write a story",
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
```

#### 6. Improved Error Messages

More detailed error information:

```typescript
import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";

try {
  await generateText({ model, prompt });
} catch (error) {
  if (error instanceof LoadAPIKeyError) {
    console.error("Missing/invalid SAP AI Core credentials:", error.message);
  } else if (error instanceof APICallError) {
    console.error({
      statusCode: error.statusCode,
      isRetryable: error.isRetryable,
      message: error.message,
      responseBody: error.responseBody,
    });
  }
}
```

---

## API Changes

### Added APIs

#### `createSAPAIProviderSync`

New synchronous provider creation function:

```typescript
function createSAPAIProviderSync(
  options: Omit<SAPAIProviderSettings, "serviceKey"> & { token: string },
): SAPAIProvider;
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
  masking?: MaskingModuleConfig;
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

#### `SAPAIProviderSettings.completionPath`

New property for custom endpoint paths:

```typescript
interface SAPAIProviderSettings {
  // ... existing properties ...
  completionPath?: string;
}
```

#### Error Details

The provider no longer exposes a custom `SAPAIError` type.

- Use `APICallError.responseBody` to inspect SAP-specific error metadata.
- Use `APICallError.statusCode` and `APICallError.isRetryable` for retry behavior.

```typescript
import { APICallError } from "@ai-sdk/provider";

try {
  await generateText({ model, prompt });
} catch (error) {
  if (error instanceof APICallError) {
    console.error(error.statusCode);
    console.error(error.isRetryable);
    console.error(error.responseBody);
  }
}
```

### Modified APIs

#### `createSAPAIProvider`

Enhanced with new options:

```typescript
// Before (1.0.x)
async function createSAPAIProvider(options?: {
  serviceKey?: string | SAPAIServiceKey;
  token?: string;
  deploymentId?: string;
  resourceGroup?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}): Promise<SAPAIProvider>;

// After (1.1.x) - Backward compatible, with additions
async function createSAPAIProvider(options?: {
  serviceKey?: string | SAPAIServiceKey;
  token?: string;
  deploymentId?: string;
  resourceGroup?: string;
  baseURL?: string;
  completionPath?: string; // NEW
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  defaultSettings?: SAPAISettings; // NEW
}): Promise<SAPAIProvider>;
```

---

## Migration Checklist

### Upgrading from 1.0.x to 1.1.x

- [ ] Update package: `npm install @mymediset/sap-ai-provider@latest`
- [ ] Run tests to verify existing functionality
- [ ] Review new features (masking, responseFormat, etc.)
- [ ] Consider adopting default settings for cleaner code
- [ ] Update documentation if using custom configurations
- [ ] Check if you want to migrate to v2 endpoint explicitly (already default)
- [ ] Consider adding data masking for sensitive data
- [ ] Review error handling to leverage new error details
- [ ] Update TypeScript types if using them directly

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

### Issue 2: Changed Default Behavior

**Problem:** Different default behavior

**Solution:** The defaults haven't changed. If you experience issues, explicitly set values:

```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  deploymentId: "d65d81e7c077e583", // Explicit default
  resourceGroup: "default", // Explicit default
});
```

### Issue 3: Masking Errors

**Problem:** Errors when using masking

**Solution:** Ensure your SAP AI Core instance supports DPI:

```typescript
// Check if masking is available in your instance
try {
  const model = provider("gpt-4o", {
    masking: {
      /* config */
    },
  });
} catch (error) {
  console.error("Masking not available:", error);
  // Fall back to non-masked model
}
```

---

## Rollback Instructions

If you need to rollback to a previous version:

### Rollback to 1.0.x

```bash
npm install @mymediset/sap-ai-provider@1.0.3
```

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

- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API documentation
- [CHANGELOG.md](./CHANGELOG.md) - Full change history
- [README.md](./README.md) - Getting started guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
