# Migration Guide

Guide for migrating between versions of the SAP AI Core Provider.

## Table of Contents

- [Overview](#overview)
- [Version 3.x to 4.x (Breaking Changes)](#version-3x-to-4x-breaking-changes)
- [Version 2.x to 3.x (Breaking Changes)](#version-2x-to-3x-breaking-changes)
- [Version 1.x to 2.x (Breaking Changes)](#version-1x-to-2x-breaking-changes)

---

## Overview

This guide helps you migrate your application when upgrading to newer versions of the SAP AI Core Provider. It covers breaking changes, deprecations, and new features.

---

## Version 3.x to 4.x (Breaking Changes)

**Version 4.0 migrates from LanguageModelV2 to LanguageModelV3 specification.**

### Summary of Changes

**Breaking Changes:**

- Implements **LanguageModelV3** interface (replacing V2)
- Finish reason changed from `string` to `{ unified: string, raw?: string }`
- Usage structure now nested with detailed token breakdown
- Warning types updated to V3 format with `feature` field
- Stream structure uses explicit text block lifecycle events

**Benefits:**

- Future-proof compatibility with Vercel AI SDK 6+
- Access to new V3 capabilities (agents, advanced streaming)
- Better type safety with structured result types
- Richer streaming with explicit block lifecycle
- Enhanced token usage metadata

### Who Is Affected?

| User Type                                               | Impact         | Action Required                              |
| ------------------------------------------------------- | -------------- | -------------------------------------------- |
| **High-level API users** (`generateText`, `streamText`) | ✅ Minimal     | Verify code still works (likely no changes)  |
| **Direct provider users** (type annotations)            | ⚠️ Minor       | Update import types from V2 to V3            |
| **Custom stream parsers**                               | ⚠️ Significant | Update stream parsing logic for V3 structure |

### Migration Steps

#### 1. Update Package

```bash
npm install @mymediset/sap-ai-provider@^4.0.0
```

#### 2. Update Type Imports (If Using Direct Provider Access)

**Before (v3.x):**

```typescript
import type { LanguageModelV2 } from "@ai-sdk/provider";

const model: LanguageModelV2 = provider("gpt-4o");
```

**After (v4.x):**

```typescript
import type { LanguageModelV3 } from "@ai-sdk/provider";

const model: LanguageModelV3 = provider("gpt-4o");
```

#### 3. Update Stream Parsing (If Manually Parsing Streams)

**Before (v3.x - V2 Streams):**

```typescript
for await (const chunk of stream) {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.textDelta); // Old property name
  }
}
```

**After (v4.x - V3 Streams):**

```typescript
for await (const chunk of stream) {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.delta); // New property name
  }

  // V3 adds structured block lifecycle
  if (chunk.type === "text-start") {
    console.log("Text block started:", chunk.id);
  }

  if (chunk.type === "text-end") {
    console.log("Text block ended:", chunk.id, chunk.text);
  }
}
```

#### 4. Update Finish Reason Access (If Accessing Directly)

**Before (v3.x):**

```typescript
const result = await model.doGenerate(options);
if (result.finishReason === "stop") {
  console.log("Completed normally");
}
```

**After (v4.x):**

```typescript
const result = await model.doGenerate(options);
if (result.finishReason.unified === "stop") {
  console.log("Completed normally");
  console.log("Raw reason:", result.finishReason.raw); // Optional SAP-specific value
}
```

#### 5. Update Usage Access (If Accessing Token Details)

**Before (v3.x):**

```typescript
const result = await generateText({ model, prompt });
console.log("Input tokens:", result.usage.inputTokens);
console.log("Output tokens:", result.usage.outputTokens);
```

**After (v4.x):**

```typescript
const result = await generateText({ model, prompt });
// V3 has nested structure with detailed breakdown
console.log("Input tokens:", result.usage.inputTokens.total);
console.log("  - No cache:", result.usage.inputTokens.noCache);
console.log("  - Cache read:", result.usage.inputTokens.cacheRead);
console.log("  - Cache write:", result.usage.inputTokens.cacheWrite);

console.log("Output tokens:", result.usage.outputTokens.total);
console.log("  - Text:", result.usage.outputTokens.text);
console.log("  - Reasoning:", result.usage.outputTokens.reasoning);
```

> **Note**: SAP AI Core currently doesn't provide the detailed breakdown fields, so nested values may be `undefined`.

#### 6. Update Warning Handling (If Checking Warnings)

**Before (v3.x):**

```typescript
if (result.warnings) {
  result.warnings.forEach((warning) => {
    if (warning.type === "unsupported-setting") {
      console.warn("Unsupported setting:", warning.setting);
    }
  });
}
```

**After (v4.x):**

```typescript
if (result.warnings) {
  result.warnings.forEach((warning) => {
    if (warning.type === "unsupported") {
      console.warn("Unsupported feature:", warning.feature); // New field name
      console.warn("Details:", warning.details);
    }
  });
}
```

### V3 Features Not Supported

The following V3 capabilities are not currently supported by SAP AI Core:

| Feature                      | Status           | Behavior                                              |
| ---------------------------- | ---------------- | ----------------------------------------------------- |
| **File content generation**  | ❌ Not supported | Warnings emitted if requested                         |
| **Reasoning mode**           | ❌ Not supported | Ignored with warning                                  |
| **Source attribution**       | ❌ Not supported | Not available in responses                            |
| **Tool approval requests**   | ❌ Not supported | Not applicable                                        |
| **Detailed token breakdown** | ⚠️ Partial       | Nested structure present but details may be undefined |

### Testing Your Migration

1. **Run your tests:**

   ```bash
   npm test
   ```

2. **Check for TypeScript errors:**

   ```bash
   npx tsc --noEmit
   ```

3. **Test streaming if used:**

   ```typescript
   import { streamText } from "ai";

   const { textStream } = await streamText({
     model: provider("gpt-4o"),
     prompt: "Count to 5",
   });

   for await (const text of textStream) {
     process.stdout.write(text);
   }
   ```

### Rollback Strategy

If you encounter issues, you can stay on v3.x:

```bash
npm install @mymediset/sap-ai-provider@^3.0.0
```

Version 3.x will receive security updates for 6 months after v4.0.0 release.

### Common Migration Issues

#### Issue: "Property 'textDelta' does not exist"

**Cause**: Accessing old V2 property name in stream chunks.

**Fix**: Change `textDelta` to `delta`:

```typescript
// ❌ Before
chunk.textDelta;

// ✅ After
chunk.delta;
```

#### Issue: "Cannot read property 'total' of undefined"

**Cause**: Trying to access nested usage structure that doesn't exist in your version.

**Fix**: Optional chaining or fallback:

```typescript
// ✅ Safe access
const inputTokens = result.usage.inputTokens?.total ?? result.usage.inputTokens;
```

#### Issue: TypeScript errors on LanguageModelV2 types

**Cause**: Importing old V2 types.

**Fix**: Update imports to V3:

```typescript
// ❌ Before
import type { LanguageModelV2 } from "@ai-sdk/provider";

// ✅ After
import type { LanguageModelV3 } from "@ai-sdk/provider";
```

### FAQ

**Q: Do I need to change my code if I only use `generateText()` and `streamText()`?**

A: Probably not! The high-level APIs abstract most V2/V3 differences. Test your code to confirm.

**Q: Why did the finish reason become an object?**

A: V3 separates the standardized finish reason (`unified`) from provider-specific values (`raw`), improving consistency across providers.

**Q: Will SAP AI Core support file generation or reasoning mode in the future?**

A: We don't have information about SAP's roadmap. The provider is designed to add support when SAP AI Core makes these features available.

**Q: Can I use v3.x and v4.x in the same project?**

A: No, you can only use one version at a time. Choose based on your needs and migrate when ready.

**Q: How long will v3.x be supported?**

A: Version 3.x will receive security and critical bug fixes for 6 months after v4.0.0 release.

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

> **Note:** Version 2.x exports `SAPAIError` class for error handling.

### Rollback to 1.x

```bash
npm install @mymediset/sap-ai-provider@1.0.3 ai@5
```

> **Note:** Version 1.x uses a different authentication approach and async provider creation.

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
