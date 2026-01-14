# Release Notes: v4.0.0 (TEMPLATE FOR FINAL RELEASE)

> **Note**: This document serves as the template for the final v4.0.0 stable release.  
> **Current Status**: v4.0.0-rc.1 published (2026-01-14) - gathering feedback  
> **Release Date**: TBD (pending RC feedback period completion)

**Type**: Major Version - Breaking Changes  
**Specification**: LanguageModelV3 (AI SDK 6.0+)

---

## Summary

Version 4.0.0 migrates from `LanguageModelV2` to `LanguageModelV3` specification, ensuring compatibility with AI SDK 6+ and unlocking access to modern AI capabilities (agents, reasoning, enhanced streaming).

**Quality**: 184/184 tests passing | Implementation audit: 9.5/10

**Pre-Release**: v4.0.0-rc.1 available now for testing (`npm install @jerome-benoit/sap-ai-provider@next`)

---

## Breaking Changes

### 1. Finish Reason Structure

```typescript
// Before (v3.x)
result.finishReason === "stop";

// After (v4.0.0)
result.finishReason.unified === "stop";
```

### 2. Usage Structure

```typescript
// Before (v3.x)
result.usage.inputTokens;
result.usage.outputTokens;

// After (v4.0.0)
result.usage.inputTokens.total;
result.usage.inputTokens.cacheRead; // New: cache metrics
result.usage.outputTokens.total;
result.usage.outputTokens.reasoning; // New: reasoning tokens
```

### 3. Stream Events

- V3 uses structured blocks: `text-start`, `text-delta`, `text-end`
- Property renamed: `textDelta` → `delta`
- Warnings moved to `stream-start` event

### 4. Warning Types

```typescript
// Before (v3.x)
{ type: "unsupported-setting", setting: "toolChoice" }

// After (v4.0.0)
{ type: "unsupported", feature: "toolChoice", details: "..." }
```

---

## Migration by User Type

| User Type                                              | Impact             | Action Required                                       |
| ------------------------------------------------------ | ------------------ | ----------------------------------------------------- |
| **High-level API users** (`generateText`/`streamText`) | ✅ **Minimal**     | Test application - likely no changes                  |
| **Direct provider users** (type annotations)           | ⚠️ **Minor**       | Update imports: `LanguageModelV2` → `LanguageModelV3` |
| **Custom stream parsers**                              | ⚠️ **Significant** | Update parsing logic for V3 blocks                    |

---

## Quick Migration

### Update Package

```bash
npm install @jerome-benoit/sap-ai-provider@^4.0.0
```

### Update Imports (if using direct provider access)

```typescript
// Before
import type { LanguageModelV2 } from "@ai-sdk/provider";

// After
import type { LanguageModelV3 } from "@ai-sdk/provider";
```

### Update Stream Parsing (if manual parsing)

```typescript
// Before
if (chunk.type === "text-delta") {
  console.log(chunk.textDelta);
}

// After
if (chunk.type === "text-delta") {
  console.log(chunk.delta);
}
```

**Full Guide**: [MIGRATION_GUIDE.md](https://github.com/jerome-benoit/sap-ai-provider/blob/v4.0.0/MIGRATION_GUIDE.md)

---

## What's New

### Enhanced Type Safety

- Full TypeScript V3 interfaces
- Better IntelliSense and code completion
- Stricter type checking

### Improved Streaming

- Structured blocks with unique IDs
- Explicit lifecycle events
- Better multi-part response support

### Future-Ready

- Compatible with AI SDK 6+ agents
- Ready for upcoming V3-only features
- Aligned with ecosystem standards

---

## Files Changed

**Core** (3 files):

- `sap-ai-chat-language-model.ts` - V3 implementation
- `convert-to-sap-messages.ts` - V3 message conversion
- `sap-ai-provider.ts` - V3 interface

**Tests** (184 tests, all passing):

- 85 tests for V3 language model
- 29 tests for message conversion
- 55 tests for error handling
- 15 tests for provider interface

**Documentation** (Complete):

- Migration guide (270+ lines)
- Updated README with breaking changes
- Enhanced API reference
- Comprehensive JSDoc

---

## Quality Assurance

- ✅ TypeScript strict mode: 0 errors
- ✅ ESLint: 0 errors, 0 warnings
- ✅ Tests: 183/183 passing (100%)
- ✅ Build: ESM + CJS + DTS verified
- ✅ Implementation audit: 9.5/10

---

## V3 Features Not Yet Supported

The following V3 features are not available in SAP AI Core:

- ❌ File generation (`LanguageModelV3File`)
- ❌ Reasoning blocks (`LanguageModelV3Reasoning`)
- ❌ Source attribution (`LanguageModelV3Source`)
- ❌ Tool approval (`LanguageModelV3ToolApprovalRequest`)

These features will return non-blocking warnings if attempted.

---

## Resources

- **Migration Guide**: [MIGRATION_GUIDE.md](https://github.com/jerome-benoit/sap-ai-provider/blob/v4.0.0/MIGRATION_GUIDE.md)
- **API Reference**: [API_REFERENCE.md](https://github.com/jerome-benoit/sap-ai-provider/blob/v4.0.0/API_REFERENCE.md)
- **Examples**: [examples/](https://github.com/jerome-benoit/sap-ai-provider/tree/v4.0.0/examples)
- **OpenSpec Proposal**: [proposal.md](https://github.com/jerome-benoit/sap-ai-provider/blob/v4.0.0/openspec/changes/migrate-languagemodelv3/proposal.md)

---

## Installation

```bash
# npm
npm install @jerome-benoit/sap-ai-provider@^4.0.0 ai

# yarn
yarn add @jerome-benoit/sap-ai-provider@^4.0.0 ai

# pnpm
pnpm add @jerome-benoit/sap-ai-provider@^4.0.0 ai
```

**Compatibility**: Node.js 18+, AI SDK 6.0+

---

## Support

**Issues?** Check the [Migration Guide](https://github.com/jerome-benoit/sap-ai-provider/blob/v4.0.0/MIGRATION_GUIDE.md) or open an issue on [GitHub](https://github.com/BITASIA/sap-ai-provider/issues).

**Upgrade now**: `npm install @jerome-benoit/sap-ai-provider@^4.0.0`
