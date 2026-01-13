# Migration Guide

Guide for migrating between versions of the SAP AI Core Provider.

## Table of Contents

- [Overview](#overview)
- [Version 2.x to 3.x (Breaking Changes)](#version-2x-to-3x-breaking-changes)
- [Version 1.x to 2.x (Breaking Changes)](#version-1x-to-2x-breaking-changes)

---

## Overview

This guide helps you migrate your application when upgrading to newer versions of the SAP AI Core Provider. It covers breaking changes, deprecations, and new features.

---

## Version 2.x to 3.x (Breaking Changes)

**Version 3.0 standardizes error handling to use Vercel AI SDK native error types.**

### Summary of Changes

**Breaking Changes:**

- `SAPAIError` class removed from exports
- All errors now use `APICallError` from `@ai-sdk/provider`
- Error handling is now fully compatible with AI SDK ecosystem

**Benefits:**

- Automatic retry with exponential backoff for rate limits and server errors
- Consistent error handling across all AI SDK providers
- Better integration with AI SDK tooling and frameworks
- Improved error messages with SAP-specific metadata preserved

### Migration Steps

#### 1. Update Package

```bash
npm install @mymediset/sap-ai-provider@3.0.0-rc.1
```

#### 2. Update Error Handling

**Before (v2.x):**

```typescript
import { SAPAIError } from "@mymediset/sap-ai-provider";

try {
  const result = await generateText({ model, prompt });
} catch (error) {
  if (error instanceof SAPAIError) {
    console.error("SAP AI Error:", error.code, error.message);
    console.error("Request ID:", error.requestId);
  }
}
```

**After (v3.x):**

```typescript
import { APICallError } from "@ai-sdk/provider";

try {
  const result = await generateText({ model, prompt });
} catch (error) {
  if (error instanceof APICallError) {
    console.error("API Error:", error.statusCode, error.message);
    console.error("Response:", error.responseBody);
    // SAP-specific metadata is in responseBody JSON
    const sapError = JSON.parse(error.responseBody || "{}");
    console.error("Request ID:", sapError.error?.request_id);
  }
}
```

#### 3. SAP Error Metadata Access

SAP AI Core error metadata (request ID, code, location) is preserved in the `responseBody` field:

```typescript
catch (error) {
  if (error instanceof APICallError) {
    const sapError = JSON.parse(error.responseBody || '{}');
    console.error({
      statusCode: error.statusCode,
      message: sapError.error?.message,
      code: sapError.error?.code,
      location: sapError.error?.location,
      requestId: sapError.error?.request_id
    });
  }
}
```

#### 4. Automatic Retries

V3 now leverages AI SDK's built-in retry mechanism for transient errors (429, 500, 503). No code changes needed - retries happen automatically with exponential backoff.

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

**Key Changes:**

- Environment variable: `SAP_AI_SERVICE_KEY` → `AICORE_SERVICE_KEY`
- Provider creation: Now synchronous (remove `await`)
- Token management: Automatic (SAP AI SDK handles OAuth2)

**Complete setup instructions:** [Environment Setup Guide](./ENVIRONMENT_SETUP.md)

#### 3. Update Code (Remove await)

```typescript
// v1.x: Async
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
});

// v2.x: Synchronous
const provider = createSAPAIProvider();

// Rest of your code remains the same
const model = provider("gpt-4o");
const result = await generateText({ model, prompt: "Hello!" });
```

#### 4. Verify Functionality

After updating authentication and removing `await` from provider creation, run your tests and basic examples (`examples/`) to verify generation and streaming work as expected.

#### 5. Optional: Adopt New Features

V2.0 introduces powerful features. See [API_REFERENCE.md](./API_REFERENCE.md) for complete documentation and [examples/](./examples/) for working code.

**Key new capabilities:**

- **Data Masking (DPI)**: Anonymize sensitive data (emails, names, phone numbers) - see [example-data-masking.ts](./examples/example-data-masking.ts)
- **Content Filtering**: Azure Content Safety, Llama Guard - see [API_REFERENCE.md#content-filtering](./API_REFERENCE.md#content-filtering)
- **Response Format**: Structured outputs with JSON schema - see [API_REFERENCE.md#response-format](./API_REFERENCE.md#response-format)
- **Default Settings**: Apply consistent settings across all models - see [API_REFERENCE.md#default-settings](./API_REFERENCE.md#default-settings)
- **Grounding & Translation**: Document grounding, language translation modules

For detailed examples, see the [New Features](#new-features) section below.

---

## Breaking Changes

### Version 3.0.x

| Change                 | Details                                                                                | Migration                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **SAPAIError Removed** | `SAPAIError` class no longer exported                                                  | Use `APICallError` from `@ai-sdk/provider` instead. SAP metadata preserved in `responseBody`. |
| **Error Types**        | All errors now use AI SDK standard types                                               | Import `APICallError` from `@ai-sdk/provider`, not from this package.                         |
| **Error Properties**   | `error.code` → `error.statusCode`, `error.requestId` → parse from `error.responseBody` | Access SAP metadata via `JSON.parse(error.responseBody)`.                                     |

### Version 2.0.x

| Change                   | Details                                                            | Migration                                                                                                   |
| ------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Authentication**       | `serviceKey` option removed; now uses `AICORE_SERVICE_KEY` env var | Set environment variable, remove `serviceKey` from code. See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) |
| **Synchronous Provider** | `createSAPAIProvider()` no longer async                            | Remove `await` from provider creation                                                                       |
| **Removed Options**      | `token`, `completionPath`, `baseURL`, `headers`, `fetch`           | Use SAP AI SDK automatic handling                                                                           |
| **Token Management**     | Manual OAuth2 removed                                              | Automatic via SAP AI SDK                                                                                    |

---

## Deprecations

### Manual OAuth2 Token Management (Removed in v2.0)

**Status:** Removed in v2.0  
**Replacement:** Automatic authentication via SAP AI SDK with `AICORE_SERVICE_KEY` environment variable  
**Migration:** See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for setup instructions

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

const dpiConfig = buildDpiMaskingProvider({
  method: "anonymization",
  entities: ["profile-email", "profile-person", "profile-phone"],
});
```

**Full documentation:** [API_REFERENCE.md - Data Masking](./API_REFERENCE.md#builddpimaskingproviderconfig), [example-data-masking.ts](./examples/example-data-masking.ts)

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

**Full documentation:** [API_REFERENCE.md - Content Filtering](./API_REFERENCE.md#buildazurecontentsafetyfiltertype-config)

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

### Added APIs (v2.0+)

| API                                     | Purpose                 | Example                                                                 |
| --------------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `buildDpiMaskingProvider()`             | Data masking helper     | `buildDpiMaskingProvider({ method: "anonymization", entities: [...] })` |
| `buildAzureContentSafetyFilter()`       | Azure content filtering | `buildAzureContentSafetyFilter("input", { hate: "ALLOW_SAFE" })`        |
| `buildLlamaGuard38BFilter()`            | Llama Guard filtering   | `buildLlamaGuard38BFilter("input")`                                     |
| `buildDocumentGroundingConfig()`        | Document grounding      | `buildDocumentGroundingConfig({ ... })`                                 |
| `buildTranslationConfig()`              | Translation module      | `buildTranslationConfig({ ... })`                                       |
| `SAPAISettings.responseFormat`          | Structured outputs      | `{ type: "json_schema", json_schema: {...} }`                           |
| `SAPAISettings.masking`                 | Masking configuration   | `{ masking_providers: [...] }`                                          |
| `SAPAISettings.filtering`               | Content filtering       | `{ input: { filters: [...] } }`                                         |
| `SAPAIProviderSettings.defaultSettings` | Provider defaults       | `{ defaultSettings: { modelParams: {...} } }`                           |

**See [API_REFERENCE.md](./API_REFERENCE.md) for complete documentation.**

### Modified APIs

**`createSAPAIProvider`** - Now synchronous:

```typescript
// v1.x: Async with serviceKey
await createSAPAIProvider({
  serviceKey,
  token,
  deploymentId,
  baseURL,
  headers,
  fetch,
});

// v2.x: Synchronous with SAP AI SDK
createSAPAIProvider({
  resourceGroup,
  deploymentId,
  destination,
  defaultSettings,
});
```

### Removed APIs

- `serviceKey` option → Use `AICORE_SERVICE_KEY` env var
- `token` option → Automatic authentication
- `baseURL`, `completionPath`, `headers`, `fetch` → Handled by SAP AI SDK

---

## Migration Checklist

### Upgrading from 2.x to 3.x

- [ ] Update package: `npm install @mymediset/sap-ai-provider@3.0.0-rc.1`
- [ ] Replace `SAPAIError` imports with `APICallError` from `@ai-sdk/provider`
- [ ] Update error handling code to use `error.statusCode` instead of `error.code`
- [ ] Update error metadata access to parse `error.responseBody` JSON for SAP details
- [ ] Remove any custom retry logic (now automatic with AI SDK)
- [ ] Run tests to verify error handling works correctly
- [ ] Test automatic retry behavior with rate limits (429) and server errors (500, 503)

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

| Issue                         | Cause                     | Solution                                                                                                  |
| ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Type errors after upgrade** | Stale build cache         | `npm run clean && npm run build && npm run type-check`                                                    |
| **Authentication failures**   | Missing/incorrect env var | Verify `AICORE_SERVICE_KEY` is set. See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)                    |
| **Masking errors**            | Incorrect configuration   | Use `buildDpiMaskingProvider()` helper. See [example-data-masking.ts](./examples/example-data-masking.ts) |

For detailed troubleshooting, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

## Rollback Instructions

If you need to rollback to a previous version:

### Rollback to 2.x

```bash
npm install @mymediset/sap-ai-provider@2.1.0
```

**Note:** Version 2.x exports `SAPAIError` class for error handling.

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
