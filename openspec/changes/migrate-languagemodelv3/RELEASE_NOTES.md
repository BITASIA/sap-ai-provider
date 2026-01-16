# Release Notes: v4.0.0

**Release Date**: 2026-01-15  
**Type**: Major Version - Breaking Changes  
**Specification**: LanguageModelV3 (AI SDK 6.0+)

---

## Summary

Version 4.0.0 migrates from `LanguageModelV2` to `LanguageModelV3` specification, ensuring compatibility with AI SDK 6+ and unlocking access to modern AI capabilities (agents, reasoning, enhanced streaming).

**Quality**: 292/292 tests passing | Coverage: 93.38% overall | Implementation audit: 9.8/10

**Installation**: `npm install @jerome-benoit/sap-ai-provider@4.0.0`

---

## RC2 Improvements (January 15, 2026)

### Enhanced Documentation Validator (scripts/validate-docs.ts)

RC2 introduces powerful documentation validation enhancements to prevent OpenSpec drift and maintain code quality:

**Check 10: Automatic Code Metrics Validation**

- ✅ Automatically validates OpenSpec documentation claims against actual code
- ✅ Runs `npm run test:coverage` to extract real metrics (test count, coverage %)
- ✅ Compares with claims in IMPLEMENTATION_AUDIT.md and RELEASE_NOTES.md
- ✅ Validates version consistency between package.json and OpenSpec documents
- ✅ Prevents documentation from drifting out of sync with reality

**Check 11: Source Code Comments Validation**

- ✅ Validates markdown links in JSDoc and inline comments (6 TypeScript source files)
- ✅ Validates JSDoc @link/@see references point to actual files
- ✅ Checks model ID format consistency (requires vendor prefixes)
- ✅ Handles all comment types: multi-line JSDoc, one-liner JSDoc, block comments, inline comments

**Critical Bugs Fixed (4 bugs)**:

1. Inline comments after code not detected (`const x = 42; // comment`)
2. One-liner JSDoc not extracted (`/** comment */`)
3. False positive: model IDs in URLs (`https://example.com/claude-3-sonnet`)
4. Block comments `/* */` not extracted

**Refactoring for Maintainability**:

- Extracted magic numbers to named constants (COVERAGE_TOLERANCE_PERCENT, TOC_DEPTH_INFERENCE_THRESHOLD)
- Extracted 5 regex patterns to reusable REGEX_PATTERNS object
- Simplified extractCoverage() function
- Consistent use of EXCLUDED_DIRS constant
- **Result**: +478 lines with comprehensive edge case handling

### Test Coverage Improvements (scripts/validate-docs.ts)

- ✅ 292/292 tests passing (100%)
- ✅ 93.38% coverage overall
- ✅ 93.93% message conversion coverage (+16.66% from v3.x)
- ✅ Added 10 new tests for edge cases
- ✅ Refactored tests for cleaner, maintainable code

### Quality Metrics

- ✅ ESLint: 0 errors, 0 warnings
- ✅ TypeScript: Strict mode, 0 errors
- ✅ Build: Successful (ESM + CJS + DTS)
- ✅ Implementation Audit Score: **9.8/10**

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

- `sap-ai-language-model.ts` - V3 implementation
- `convert-to-sap-messages.ts` - V3 message conversion
- `sap-ai-provider.ts` - V3 interface

**Tests** (267 tests, all passing):

- 91 tests for V3 language model
- 34 tests for message conversion (5 new edge cases)
- 55 tests for error handling
- 14 tests for provider interface
- 73 tests for markdown utilities (18 new tests for refactored scripts)

**Documentation** (Complete):

- Migration guide (270+ lines)
- Updated README with breaking changes
- Enhanced API reference
- Comprehensive JSDoc

---

## Quality Assurance

- ✅ TypeScript strict mode: 0 errors
- ✅ ESLint: 0 errors, 0 warnings
- ✅ Tests: 292/292 passing (100%)
- ✅ Test coverage: 93.38% overall
- ✅ Build: ESM + CJS + DTS verified
- ✅ Implementation audit: 9.8/10

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
