# Migration to LanguageModelV3 Specification

**Status**: Draft  
**Type**: Migration / Breaking Change  
**Priority**: High  
**Author**: AI Assistant  
**Date**: 2026-01-14

## Summary

Migrate the SAP AI Provider implementation from the `LanguageModelV2` interface to the new `LanguageModelV3` specification introduced in AI SDK 6. This migration enables access to new capabilities (agents, tool approval, file generation, reasoning, sources) and ensures future compatibility with the Vercel AI SDK ecosystem.

## Why

The migration to LanguageModelV3 is necessary for the following critical reasons:

1. **Ecosystem Alignment**: AI SDK 6 has introduced LanguageModelV3 as the standard specification. All major providers (OpenAI, Anthropic, Mistral, Google) are adopting or have adopted V3. Staying on V2 creates divergence from the ecosystem.

2. **Future Compatibility**: While V2 is currently supported, Vercel has indicated that V3 is the future direction. V2 will likely be deprecated in upcoming AI SDK versions, creating a risk of sudden breaking changes if we don't migrate proactively.

3. **Feature Access**: V3 enables access to modern AI capabilities:
   - Agent API support (optimized for V3)
   - Reasoning mode for advanced models (o1, o1-preview)
   - File generation capabilities
   - Tool approval workflows
   - Source attribution

4. **Improved Developer Experience**: V3 provides:
   - Better type safety with structured result types
   - Richer streaming with explicit block lifecycle (text-start/delta/end)
   - Enhanced observability with detailed usage metadata
   - Clearer API contracts

5. **SAP AI Core Positioning**: By implementing V3, we position the SAP AI Provider as a modern, future-ready integration that can support advanced AI workflows as SAP AI Core capabilities evolve.

The alternative—staying on V2—creates technical debt that will become more expensive to resolve over time. A planned migration now is preferable to a forced migration later.

## Context

### Current State

- **Package Version**: 3.0.0
- **Implemented Interface**: `LanguageModelV2` (v2 specification)
- **Dependencies**:
  - `@ai-sdk/provider`: ^3.0.2 (provider interface package)
  - `ai`: ^6.0.0 (peer dependency - Vercel AI SDK)
- **Repository Setup**:
  - **Origin**: `jerome-benoit/sap-ai-provider` (fork, where releases are published)
  - **Upstream**: `BITASIA/sap-ai-provider` (original repository)
  - **Published Package**: `@jerome-benoit/sap-ai-provider` (npm, via GitHub Actions)
- **Affected Files**:
  - `src/sap-ai-chat-language-model.ts` - Main implementation
  - `src/sap-ai-provider.ts` - Provider factory

**IMPORTANT - Release Process**: This project uses a **fork-based development model**. All releases are created on the **origin repository** (`jerome-benoit/sap-ai-provider`), NOT on the upstream repository. The [GitHub Actions workflow](.github/workflows/npm-publish-npm-packages.yml) automatically publishes to npm under the `@jerome-benoit` scope when a release is created on origin.

### Problem Statement

The **Language Model Specification V3** (introduced in `@ai-sdk/provider` 3.0.0, corresponding to AI SDK 5.0) is now the standard for all modern providers. While V2 is still supported in AI SDK 6.x, V3 brings significant improvements:

1. **New Content Capabilities**:
   - File generation (`LanguageModelV3File`) for images, audio, etc.
   - Native reasoning support (`LanguageModelV3Reasoning`) for models like o1
   - Citations with sources (`LanguageModelV3Source`)
   - Tool approval requests (`LanguageModelV3ToolApprovalRequest`)

2. **Enhanced Streaming**:
   - Structured stream parts (`text-start`, `text-delta`, `text-end`)
   - Reasoning streaming support (`reasoning-start`, `reasoning-delta`, `reasoning-end`)
   - Separate response metadata (`response-metadata`)
   - Initial event with warnings (`stream-start`)

3. **Agent Compatibility**:
   - The new `Agent` API in AI SDK 6 is optimized for V3
   - Tool calling with structured output requires V3
   - Advanced workflow patterns leverage V3

4. **Future-proofing**:
   - V2 will likely be deprecated in future AI SDK versions
   - New AI SDK features target V3 as priority
   - Provider ecosystem is migrating to V3 (Mistral, OpenAI, Anthropic, etc.)

### Risks of Not Migrating

- **Future Incompatibility**: Risk of breaking changes when V2 is deprecated
- **Missing Features**: Unable to use agents, tool approval, file generation
- **Maintenance**: Growing divergence from AI SDK best practices
- **Developer Experience**: AI SDK examples and documentation target V3

## Goals

### Primary Goals

1. **Migrate Interface**: Implement `LanguageModelV3` instead of `LanguageModelV2`
2. **Adapt Types**: Use `LanguageModelV3Content`, `LanguageModelV3StreamPart`, etc.
3. **Maintain Compatibility**: Preserve backward compatibility for users where possible
4. **Support SAP Features**: Map SAP AI Core capabilities to V3
5. **Comprehensive Testing**: Validate all existing scenarios + new ones

### Success Criteria

- [ ] `LanguageModelV3` interface correctly implemented
- [ ] All existing tests pass
- [ ] New content types supported (according to SAP capabilities)
- [ ] Streaming compliant with V3 spec
- [ ] Documentation updated
- [ ] No functional regressions
- [ ] Major version published (4.0.0 as `@jerome-benoit/sap-ai-provider`)

## Proposed Solution

### Approach: Complete Migration with Breaking Change

**Breaking Change Justification**:

- V3 introduces structural changes in return types
- Impossible to maintain 100% binary compatibility
- Best practice: major version (3.x → 4.0.0)
- Users can stay on 3.x if not ready

### Required Changes

#### 1. Main Interface

**Before (V2)**:

```typescript
export class SAPAIChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2";
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]>;

  doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: Array<LanguageModelV2Content>;
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelV2Usage;
    warnings: Array<LanguageModelV2CallWarning>;
    // ...
  }>;

  doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    warnings: Array<LanguageModelV2CallWarning>;
  }>;
}
```

**After (V3)**:

```typescript
export class SAPAIChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]>;

  doGenerate(
    options: LanguageModelV3CallOptions,
  ): PromiseLike<LanguageModelV3GenerateResult>;

  doStream(
    options: LanguageModelV3CallOptions,
  ): PromiseLike<LanguageModelV3StreamResult>;
}
```

#### 2. Content Types

**V2 Content Types**:

```typescript
type LanguageModelV2Content =
  | LanguageModelV2Text
  | LanguageModelV2ToolCall
  | LanguageModelV2ToolResult;
```

**V3 Content Types** (richer):

```typescript
type LanguageModelV3Content =
  | LanguageModelV3Text
  | LanguageModelV3Reasoning // NEW
  | LanguageModelV3File // NEW
  | LanguageModelV3ToolApprovalRequest // NEW
  | LanguageModelV3Source // NEW
  | LanguageModelV3ToolCall
  | LanguageModelV3ToolResult;
```

**SAP AI Core Mapping**:

- ✅ `Text`: Natively supported
- ⚠️ `Reasoning`: Depends on model (some models expose chain-of-thought)
- ❌ `File`: SAP AI Core doesn't currently generate files
- ❌ `ToolApprovalRequest`: Not supported by SAP AI Core
- ❌ `Source`: Not supported by SAP AI Core

**Strategy**: Implement supported types, document limitations

#### 3. Stream Parts

**V2 Stream Parts** (simple):

```typescript
type LanguageModelV2StreamPart =
  | { type: "text-delta"; textDelta: string }
  | { type: "tool-call-delta"; toolCallId: string; argsTextDelta: string }
  | { type: "tool-call"; toolCall: LanguageModelV2ToolCall }
  | {
      type: "finish";
      finishReason: LanguageModelV2FinishReason;
      usage: LanguageModelV2Usage;
    };
```

**V3 Stream Parts** (structured):

```typescript
type LanguageModelV3StreamPart =
  // Structured text blocks
  | { type: 'text-start'; id: string; providerMetadata?: ... }
  | { type: 'text-delta'; id: string; delta: string; providerMetadata?: ... }
  | { type: 'text-end'; id: string; providerMetadata?: ... }

  // Reasoning blocks
  | { type: 'reasoning-start'; id: string; providerMetadata?: ... }
  | { type: 'reasoning-delta'; id: string; delta: string; providerMetadata?: ... }
  | { type: 'reasoning-end'; id: string; providerMetadata?: ... }

  // Structured tool calls
  | { type: 'tool-input-start'; id: string; toolName: string; ... }
  | { type: 'tool-input-delta'; id: string; delta: string; ... }
  | { type: 'tool-input-end'; id: string; ... }
  | LanguageModelV3ToolCall
  | LanguageModelV3ToolResult

  // Metadata and lifecycle
  | { type: 'stream-start'; warnings: Array<SharedV3Warning> }
  | { type: 'response-metadata'; ... }
  | { type: 'finish'; usage: LanguageModelV3Usage; finishReason: LanguageModelV3FinishReason }
  | { type: 'error'; error: unknown };
```

**Required Changes**:

- Generate unique IDs for text blocks
- Emit `stream-start` at beginning with warnings
- Use `text-start`, `text-delta`, `text-end` instead of simple `text-delta`
- Emit `response-metadata` when available
- Adapt SAP AI Core response parsing

#### 4. Warnings

**V2**:

```typescript
type LanguageModelV2CallWarning = {
  type: "unsupported-setting" | "other";
  setting?: string;
  message?: string;
  details?: string;
};
```

**V3**:

```typescript
type SharedV3Warning = {
  type: "unsupported-setting" | "other";
  setting?: string;
  message?: string;
  details?: string;
};
```

**Impact**: Identical types, namespace change only

#### 5. Usage Information

**V2**:

```typescript
type LanguageModelV2Usage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
};
```

**V3** (more detailed):

```typescript
type LanguageModelV3Usage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;

  // Input details
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };

  // Output details
  outputTokenDetails?: {
    textTokens?: number;
    reasoningTokens?: number;
  };
};
```

**Change**: Populate details when available in SAP response

#### 6. Generate Result

**V2**:

```typescript
// Inline return
{
  content: Array<LanguageModelV2Content>;
  finishReason: LanguageModelV2FinishReason;
  usage: LanguageModelV2Usage;
  warnings: Array<LanguageModelV2CallWarning>;
  request?: { body?: unknown };
  response?: { headers?: ...; body?: unknown };
  providerMetadata?: ...;
}
```

**V3**:

```typescript
// Dedicated type
type LanguageModelV3GenerateResult = {
  content: Array<LanguageModelV3Content>;
  finishReason: LanguageModelV3FinishReason;
  usage: LanguageModelV3Usage;
  warnings: Array<SharedV3Warning>;
  request?: { body?: unknown };
  response?: LanguageModelV3ResponseMetadata & {
    headers?: SharedV3Headers;
    body?: unknown;
  };
  providerMetadata?: SharedV3ProviderMetadata;
};
```

**Change**: Use structured type, adapt mapping

### Documentation Strategy

Given that this is a **major version migration with breaking changes**, documentation is critical to ensure smooth user adoption. Our documentation strategy addresses three key user segments:

#### User Segments

1. **High-level API Users** (80% of users):
   - Use `generateText()`, `streamText()` from AI SDK
   - **Impact**: Minimal to none (abstraction layer handles V3)
   - **Documentation Needs**: Reassurance, feature highlights

2. **Direct Provider Users** (15% of users):
   - Directly instantiate and use the provider
   - **Impact**: Type changes, need to update imports
   - **Documentation Needs**: Clear migration path, code examples

3. **Advanced Users** (5% of users):
   - Manual stream parsing, custom integrations
   - **Impact**: Significant changes in stream structure
   - **Documentation Needs**: Detailed technical guide, troubleshooting

#### Documentation Principles

1. **Clarity Over Brevity**: Breaking changes must be crystal clear
2. **Show, Don't Tell**: Code examples for every scenario
3. **Progressive Disclosure**: Quick start for simple cases, deep dive for complex ones
4. **Searchability**: Keywords, tags, and index for finding info quickly
5. **Maintenance**: All docs must be versioned and kept in sync

#### Documentation Deliverables

**Tier 1: Essential** (Blocks release):

- README.md with breaking changes section
- MIGRATION_GUIDE.md with step-by-step guide
- Updated JSDoc on all public APIs
- At least 3 working examples

**Tier 2: Important** (Within 1 week of release):

- Comprehensive API reference
- Video walkthrough of migration (if applicable)
- Blog post announcing V3 migration
- FAQ based on early user feedback

**Tier 3: Nice to Have** (Within 1 month):

- Interactive migration tool/checker
- Detailed performance comparison V2 vs V3
- Advanced use case tutorials
- Community contribution guide updates

#### Quality Gates

Before release, documentation must pass:

- [ ] Technical review by 2+ team members
- [ ] All code examples compile and run
- [ ] Links verified (no 404s)
- [ ] Spelling and grammar check
- [ ] Accessibility check (for web docs)
- [ ] User testing with 2-3 external users

### Implementation Plan

#### Phase 1: Preparation (1 day)

**Tasks**:

1. Create branch `feat/migrate-v3`
2. Update AI SDK dependencies if necessary
3. Create local V3 type files
4. Document V2 vs V3 differences in detail

#### Phase 2: Core Migration (2-3 days)

**Tasks**:

1. **Modify class signature**:
   - Change `implements LanguageModelV2` → `implements LanguageModelV3`
   - Change `specificationVersion = 'v2'` → `specificationVersion = 'v3'`

2. **Adapt `doGenerate`**:
   - Change return signature to `LanguageModelV3GenerateResult`
   - Map content types V2 → V3
   - Adapt warnings V2 → V3
   - Populate new usage fields

3. **Adapt `doStream`**:
   - Change return signature to `LanguageModelV3StreamResult`
   - Implement ID generation for blocks
   - Emit `stream-start` with warnings
   - Transform simple deltas to structured blocks (`text-start`, `text-delta`, `text-end`)
   - Emit `response-metadata` if available
   - Adapt `finish` with new fields

4. **Adapt helpers**:
   - `convertToSAPMessages`: Verify V3 prompt compatibility
   - `convertToAISDKError`: Maintain (no change)
   - Parameter validation: Maintain

#### Phase 3: Tests (1-2 days)

**Tasks**:

1. **Adapt existing tests**:
   - Update imports V2 → V3
   - Adapt assertions on return types
   - Verify all tests pass

2. **Add V3 tests**:
   - Tests for `stream-start` event
   - Tests for structured blocks (`text-start/delta/end`)
   - Tests for `response-metadata`
   - Tests for new usage fields

3. **Integration tests**:
   - Test with real SAP AI Core calls
   - Validate end-to-end streaming
   - Test tool calling

#### Phase 4: Documentation Harmonization (1 day)

**Principle**: Update and harmonize existing documentation files to reflect V3 migration. Do NOT create new files unless absolutely necessary.

**Tasks**:

1. **README.md - Harmonization**:
   File: `/README.md` (EXISTS - 20KB, last updated Jan 13)
   - Update version badge (3.0.0 → 4.0.0)
   - Update AI SDK version requirements section (add minimum AI SDK 6.0.0)
   - Harmonize "Installation" section with new version
   - Update "Quick Start" code examples to use V3 types
   - Harmonize "Features" section to mention V3 capabilities
   - Update streaming examples to show V3 structure (text-start/delta/end)
   - Harmonize "Supported Models" section (no changes expected)
   - Add V3-specific limitations in "Limitations" section
   - Update all inline code examples throughout document
   - Verify all links still work

2. **MIGRATION_GUIDE.md - Add V3 Section**:
   File: `/MIGRATION_GUIDE.md` (EXISTS - 18KB, last updated Jan 13)
   Current content: v2.x → v3.x migration

   **Add new section at top**: "Version 3.x to 4.x (Breaking Changes)"
   - Summary of V3 migration
   - Breaking changes catalog:
     - LanguageModelV2 → LanguageModelV3 interface
     - Stream parts structure (textDelta → delta, text-start/end added)
     - Result types (anonymous → structured)
     - Usage information enhancement
   - Step-by-step migration instructions
   - Code examples before/after for:
     - Basic text generation (minimal impact)
     - Streaming (moderate impact)
     - Direct provider access (high impact)
   - User segment-specific guidance:
     - High-level API users (generateText/streamText) - mostly transparent
     - Direct provider users - type updates needed
     - Custom stream parsers - significant changes
   - Troubleshooting common issues:
     - Type errors and how to fix
     - Stream parsing updates
     - Testing migration locally
   - FAQ section with 5-7 common questions

   **Preserve existing sections**: v2.x → v3.x, v1.x → v2.x (historical reference)

3. **API_REFERENCE.md - Harmonize V3 Types**:
   File: `/API_REFERENCE.md` (EXISTS - 45KB, last updated Jan 13)
   - Update main interface documentation (SAPAIChatLanguageModel)
   - Change all LanguageModelV2 references → LanguageModelV3
   - Update `doGenerate` and `doStream` method signatures
   - Update parameter types documentation
   - Update return types documentation
   - Harmonize content types section with V3 types
   - Update stream parts documentation with structured blocks
   - Add notes about SAP AI Core V3 feature support status
   - Update all code examples to V3
   - Keep existing structure and organization

4. **ARCHITECTURE.md - Update if Relevant**:
   File: `/ARCHITECTURE.md` (EXISTS - 38KB, last updated Jan 13)
   Review and update only if architecture changes:
   - Check if V3 migration affects architecture diagrams
   - Update type flow diagrams if needed
   - Document new stream processing flow (text blocks)
   - Update if streaming architecture changed significantly
   - Otherwise: minimal changes

5. **test-quick.ts - Update Version References**:
   File: `/test-quick.ts` (EXISTS - quick test script)
   - Update line 3 comment: "SAP AI Provider v2" → "SAP AI Provider v4"
   - Update line 15 console.log: "SAP AI Provider v2" → "SAP AI Provider v4"
   - **No code changes needed** (uses high-level `generateText()` API)
   - Estimated effort: 5 minutes

6. **examples/ Directory - Validation Only**:
   Directory: `/examples/` (EXISTS - 6 files)

   **No code changes needed** because:
   - All examples use high-level Vercel AI SDK APIs (`streamText()`, `generateText()`)
   - These APIs abstract V2/V3 differences internally
   - Examples don't manipulate raw stream parts or V2/V3 types directly

   **Action required**:
   - Validate all 6 examples compile successfully: `tsc --noEmit`
   - Test-run at least 2-3 examples to ensure they work
   - **Only if issues found**: minimal fixes (not V3-specific updates)
   - Estimated effort: 30 minutes

7. **CONTRIBUTING.md - Minor Updates**:
   File: `/CONTRIBUTING.md` (EXISTS - 11KB, last updated Jan 13)
   - Update "Development" section if V3 affects local dev
   - Add note about V3 in testing section if relevant
   - Update example test cases to use V3 types
   - Otherwise: keep existing content

8. **TROUBLESHOOTING.md - Add V3 Section**:
   File: `/TROUBLESHOOTING.md` (EXISTS - 11KB, last updated Jan 13)
   Add new section: "V3 Migration Issues"
   - Common V3 type errors and solutions
   - Stream parsing issues
   - "textDelta is not defined" → use "delta"
   - "stream-start missing warnings" → warnings moved to result level
   - Link to MIGRATION_GUIDE.md

9. **package.json - Update Metadata**:
   File: `/package.json` (EXISTS)
   - Update version: "3.0.0" → "4.0.0"
   - Update description if needed (mention V3)
   - Add keywords: "languagemodelv3", "v3", "ai-sdk-6"
   - Update peerDependencies: require ai@^6.0.0 minimum
   - Update engines if needed
   - Update repository URLs if changed

10. **JSDoc Comments in Source Code**:
    Files: `/src/**/*.ts`
    - Update all public API JSDoc comments
    - Add `@since 4.0.0` to modified methods
    - Update parameter type documentation
    - Update return type documentation
    - Add examples in JSDoc showing V3 usage
    - Document SAP limitations for V3 features
    - Link to relevant AI SDK V3 documentation

**Summary of Documentation Changes**:

- **Update**: 8 existing files (README, MIGRATION_GUIDE, API_REFERENCE, ARCHITECTURE, CONTRIBUTING, TROUBLESHOOTING, package.json, test-quick.ts, + JSDoc)
- **Validate**: 6 examples (no code changes, compilation check only)
- **Create**: 0 new files
- **Principle**: Harmonize existing documentation, don't reinvent
- **Examples Note**: Examples use high-level Vercel AI SDK APIs (`generateText()`, `streamText()`) which abstract V2/V3 internally - no code changes needed

#### Phase 5: Release (0.5 day)

**IMPORTANT**: Release process is **automated via GitHub Actions**. The release will be published **ONLY on the origin repository** (`jerome-benoit/sap-ai-provider`), **NOT on the upstream repository** (`BITASIA/sap-ai-provider`).

**Tasks**:

1. Bump version → 4.0.0 (breaking change)
2. Final build and tests
3. Push changes and tag to **origin** repository
4. Create GitHub release on **origin** repository (this triggers the automated npm publish workflow)

## Impact Analysis

### Benefits

1. **Future Compatibility**: Alignment with AI SDK 6+ and future evolutions
2. **New Capabilities**: Access to agents, tool approval (if SAP supports)
3. **Better DX**: More precise types, better IDE support
4. **Performance**: Optimized streaming with structured blocks
5. **Observability**: Enriched metadata, detailed usage
6. **Maintenance**: Code aligned with current AI SDK best practices

### Risks & Mitigation

| Risk                              | Impact | Probability | Mitigation                                      |
| --------------------------------- | ------ | ----------- | ----------------------------------------------- |
| Breaking changes for users        | High   | Certain     | Major version (4.0.0), detailed migration guide |
| SAP AI Core incompatibility       | Medium | Medium      | Document limitations, graceful fallbacks        |
| Functional regression             | High   | Low         | Comprehensive tests, end-to-end validation      |
| Increased complexity              | Low    | Medium      | Good code structure, clear documentation        |
| Slow adoption (users stay on 3.x) | Low    | High        | Maintain 3.x for 6 months, encourage migration  |

### Breaking Changes

**For Users**:

1. **Import types**:

   ```typescript
   // Before
   import type { LanguageModelV2 } from "@ai-sdk/provider";

   // After
   import type { LanguageModelV3 } from "@ai-sdk/provider";
   ```

2. **Response structure** (if direct provider access):

   ```typescript
   // Before
   const result = await model.doGenerate(...);
   console.log(result.content); // Array<LanguageModelV2Content>

   // After
   const result = await model.doGenerate(...);
   console.log(result.content); // Array<LanguageModelV3Content>
   ```

3. **Stream parts** (if manual parsing):

   ```typescript
   // Before
   stream.on("data", (part) => {
     if (part.type === "text-delta") {
       console.log(part.textDelta);
     }
   });

   // After
   stream.on("data", (part) => {
     if (part.type === "text-delta") {
       console.log(part.delta); // Field name changed
     }
   });
   ```

**BUT**: Most users use `generateText()`, `streamText()` which abstract these details → **Limited practical impact**

### Migration Path

**For Users on 3.x**:

1. **Option 1: Stay on 3.x** (recommended short-term)
   - Continue using 3.x (maintained for 6 months)
   - No code changes needed
   - Migrate when ready

2. **Option 2: Migrate to 4.0** (recommended long-term)
   - Install `@jerome-benoit/sap-ai-provider@^4.0.0` (published from origin repository)
   - **Note**: Package is published as `@jerome-benoit` scope, not `@mymediset`
   - Verify code compiles (types)
   - Test application
   - If manual stream parsing: adapt code
   - Otherwise: transparent

**Automatic migration code**:

```bash
# No codemod needed if using generateText/streamText
# If direct provider access: manual review required
```

### Communication & Support Plan

To ensure successful adoption of v4.0.0, we need a comprehensive communication strategy:

#### Pre-Release Communication (2 weeks before release)

1. **Early Warning Announcement**:
   - Blog post/Discord announcement: "Upcoming V3 Migration"
   - Explain benefits, timeline, support plan
   - Request early feedback from community

2. **Beta/RC Phase**:
   - Publish 4.0.0-rc.0 for early adopters
   - Request testing and feedback
   - Document reported issues
   - Iterate based on feedback

#### Release Day Communication

1. **Release Announcement** (multiple channels):
   - GitHub Release with detailed notes (on **origin** repository)
   - npm package automatically published via GitHub Actions workflow
   - Discord/Slack announcement
   - Twitter/social media post
   - Blog post with highlights and migration guide

2. **Documentation Publication**:
   - Updated docs site (if applicable)
   - README.md on GitHub
   - Migration guide prominently linked
   - Video tutorial (if prepared)

#### Post-Release Support (First 4 weeks)

1. **Active Monitoring**:
   - Watch GitHub issues daily
   - Monitor Discord/support channels
   - Track npm downloads and version adoption
   - Collect migration feedback

2. **Responsive Support**:
   - Quick response to issues (<24h for critical)
   - Update FAQ based on common questions
   - Publish hotfix releases if needed (4.0.1, 4.0.2)
   - Create supplementary docs/examples as needed

3. **Community Engagement**:
   - Weekly check-in posts
   - Highlight successful migrations
   - Share best practices from early adopters
   - Office hours or live Q&A sessions (optional)

#### Long-term Support

1. **3.x Maintenance Branch**:
   - Security patches for 6 months
   - Critical bug fixes only
   - Clear deprecation timeline communicated
   - Automated reminders in logs (optional): "v3.x is deprecated, please upgrade to v4.x"

2. **Documentation Maintenance**:
   - Keep 3.x docs accessible (archived)
   - Version selector in docs site
   - Redirect old links to versioned docs
   - Regular review and updates based on feedback

## Alternatives Considered

### Alternative 1: Do Nothing (stay on V2)

**Advantages**:

- Zero effort
- No breaking changes
- Stable code

**Disadvantages**:

- Progressive obsolescence
- No access to new AI SDK 6 features
- Risk of sudden breaking change when V2 deprecated
- Divergence from ecosystem

**Decision**: ❌ Rejected - Significant long-term technical debt

### Alternative 2: Support V2 and V3 Simultaneously

**Advantages**:

- No breaking change
- Progressive migration possible

**Disadvantages**:

- Double code complexity
- Difficult maintenance
- Ambiguous types
- Impossible to maintain long-term

**Decision**: ❌ Rejected - Too complex, not viable

### Alternative 3: V3 Migration with V2 Fallback

**Advantages**:

- Partial compatibility
- Smooth transition

**Disadvantages**:

- High technical complexity
- Difficult to test both paths
- False impression of compatibility

**Decision**: ❌ Rejected - Unjustified complexity

### Alternative 4: V3 Migration + Major Version (Selected) ✅

**Advantages**:

- Clean break, simple code
- Semantic versioning respected
- Users informed of breaking change
- 3.x maintenance possible in parallel
- Facilitated future evolution

**Disadvantages**:

- Explicit breaking change
- Requires user migration

**Decision**: ✅ **Selected** - Long-term best practice

## Timeline & Effort

### Effort Estimation

| Phase                     | Estimated Duration | Description                                            |
| ------------------------- | ------------------ | ------------------------------------------------------ |
| Phase 0: Pre-Release Comm | 2-3 days           | Beta release, early warnings, community prep           |
| Phase 1: Preparation      | 1 day              | Setup, deps, V2/V3 analysis                            |
| Phase 2: Core Migration   | 2-3 days           | Code changes, type migration, adaptation               |
| Phase 3: Tests            | 1-2 days           | Unit tests, integration, validation                    |
| Phase 4: Documentation    | 1 day              | **Docs harmonization, validation (simplified)**        |
| Phase 5: Release          | 0.5 day            | GitHub release creation (automated npm publish)        |
| Phase 6: Post-Release     | Ongoing (4 weeks)  | Support, monitoring, quick fixes, community engagement |
| **Total (Dev Work)**      | **6-7.5 days**     | Excludes pre/post-release phases                       |

### Detailed Documentation Timeline (Phase 4)

| Task                                | Duration      | Priority | Deliverable                                 | Type     |
| ----------------------------------- | ------------- | -------- | ------------------------------------------- | -------- |
| README.md harmonization             | 3 hours       | Critical | Updated version, examples, breaking changes | Update   |
| MIGRATION_GUIDE.md v3.x→4.x section | 4 hours       | Critical | New section with step-by-step guide         | Update   |
| API_REFERENCE.md harmonization      | 2 hours       | Critical | V3 types, updated signatures                | Update   |
| ARCHITECTURE.md review/update       | 1 hour        | Medium   | Update only if architecture changed         | Update   |
| test-quick.ts version references    | 5 minutes     | Low      | Update "v2" → "v4" in 2 comments            | Update   |
| examples/ validation                | 30 minutes    | High     | Compile check + test run 2-3 examples       | Validate |
| CONTRIBUTING.md minor updates       | 0.5 hour      | Low      | V3 notes if relevant                        | Update   |
| TROUBLESHOOTING.md V3 section       | 1 hour        | High     | V3 migration issues section                 | Update   |
| package.json metadata               | 0.5 hour      | Critical | Version, keywords, peerDeps                 | Update   |
| JSDoc in source code                | 3 hours       | Critical | All public API comments                     | Update   |
| Documentation review                | 2 hours       | Critical | Quality gate with 2+ reviewers              | Review   |
| **Total Documentation Effort**      | **~18 hours** |          | **~1 day (8 updates, 1 validation)**        |          |

**Files Affected**:

- ✏️ **Update** (8): README.md, MIGRATION_GUIDE.md, API_REFERENCE.md, ARCHITECTURE.md, CONTRIBUTING.md, TROUBLESHOOTING.md, package.json, test-quick.ts, src JSDoc
- ✅ **Validate** (6 examples): Compilation check only, no code changes
- ➕ **Create** (0): None
- 📦 **Total** (8 files updated, 6 validated)

### Milestones

1. **M0: Community Prepared** (Day -3 to -1)
   - Beta release published (4.0.0-rc.0)
   - Early warning announcement sent
   - Initial feedback collected
   - Decision point: proceed with final release

2. **M1: Code Migrated** (Day 4)
   - All code modifications complete
   - Compiles without errors
   - Decision point: proceed to testing

3. **M2: Tests Validated** (Day 6)
   - All tests pass (unit + integration)
   - Manual validation OK
   - Performance benchmarks acceptable
   - Decision point: proceed to documentation

4. **M3: Documentation Complete** (Day 8)
   - All Tier 1 documentation complete
   - Quality gates passed
   - Examples tested and working
   - Decision point: proceed to release
   - **APPROVAL GATE**: Owner approval required before proceeding

5. **M4: Owner Approval for Merge & Release** (Day 8)
   - **CRITICAL**: Owner must explicitly approve before:
     - Merging PR to main branch
     - Creating GitHub release
     - Triggering automated npm publish
   - No merge or release may proceed without explicit owner approval
   - Approval confirms: code quality, documentation completeness, timing

6. **M5: Version 4.0.0 Published** (Day 8.5)
   - **ONLY AFTER OWNER APPROVAL**
   - GitHub release created on **origin** repository (`jerome-benoit/sap-ai-provider`)
   - npm package automatically published via GitHub Actions workflow
   - Community announcements sent
   - Documentation live

7. **M6: Stable Adoption** (Day 8.5 + 4 weeks)
   - No critical issues reported
   - Positive community feedback
   - > 30% users migrated to 4.x (target)
   - Support documentation updated based on feedback

### Risk Buffer

Add 20% buffer for unexpected issues:

- Documentation iterations based on review feedback
- Community feedback incorporation
- Technical writing quality improvements

**Total Realistic Timeline**: **7-9 days** of active development + ongoing support

## Open Questions

### 1. V3 New Features Support by SAP AI Core

**Question**: Does SAP AI Core support the new V3 capabilities?

**Specific Features to Validate**:

1. **File Generation** (`LanguageModelV3File`)
   - Does SAP AI Core return images, audio, or other binary content?
   - Which models support this? (e.g., DALL-E, Stable Diffusion via SAP)
   - Test with: Image generation requests, audio synthesis
   - **Expected Result**: Likely not supported initially

2. **Reasoning Support** (`LanguageModelV3Reasoning`)
   - Are reasoning blocks available for o1/o3 models on SAP AI Core?
   - Test with: OpenAI o1-preview, o1-mini via SAP orchestration
   - Check: Does response include separate reasoning content?
   - **Expected Result**: May be supported if SAP exposes o1/o3 models

3. **Source Attribution** (`LanguageModelV3Source`)
   - Do RAG-enabled models return citation sources?
   - Test with: SAP AI Core RAG scenarios with grounding
   - Check: Does response metadata include source references?
   - **Expected Result**: Potentially supported via SAP grounding filters

4. **Tool Approval Requests** (`LanguageModelV3ToolApprovalRequest`)
   - Are tool calls flagged for approval before execution?
   - Test with: Models that require explicit tool consent
   - **Expected Result**: Likely not needed for SAP use cases

**Investigation Plan**:

- [ ] Contact SAP AI Core team for feature roadmap
- [ ] Test with o1/o3 models if available in SAP BTP
- [ ] Test RAG scenarios with grounding for source attribution
- [ ] Document findings in design.md before Phase 2 implementation

**Temporary Decision**:

- Implement all V3 types per specification
- Add JSDoc comments: "Not currently supported by SAP AI Core" for untested features
- Return empty arrays/undefined for unsupported capabilities
- Monitor SAP AI Core API changelog for future support

### 2. Backward Compatibility for 3.x

**Question**: How long to maintain the 3.x branch?

**Options**:

- A) 3 months
- B) 6 months (recommended)
- C) 12 months

**Recommendation**: **6 months** with:

- Security fixes
- Critical bug fixes
- No new features

### 3. Codemod / Migration Tool

**Question**: Provide automatic migration tool?

**Analysis**:

- Useful if many users directly access the provider
- Complex if manual stream parsing
- Unnecessary if only using `generateText()`

**Decision**: Not needed initially, evaluate based on user feedback

### 4. Versioning Strategy

**Question**: Which version number?

**Options**:

- A) 4.0.0 (major breaking change)
- B) 3.1.0 (new feature without breaking change) - technically impossible

**Decision**: **4.0.0** - Obvious breaking change, clear semantic versioning

## References

- [Vercel AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6)
- [LanguageModelV3 Specification](https://github.com/vercel/ai/tree/main/packages/provider/src/language-model/v3)
- [Writing a Custom Provider (V3)](https://ai-sdk.dev/providers/community-providers/custom-providers)
- [Mistral Provider (Reference Implementation)](https://github.com/vercel/ai/tree/main/packages/mistral)
- Current Implementation: `src/sap-ai-chat-language-model.ts`

## Next Steps

1. **Review & Approval**: Technical team validates approach
2. **Create Design Document**: Detailed technical document
3. **Create Tasks List**: Granular implementation list
4. **Phase 1 Execution**: Start migration
5. **Decision Point**: After each milestone, validation to continue

---

**Approval Required From**:

- **Repository Owner** (CRITICAL - Required before ANY merge or release)
- Technical Lead
- Product Owner
- Release Manager

**Approval Gates**:

1. **Initial Proposal Approval**: Before starting implementation
2. **Pre-Merge Approval**: After documentation is complete, before merging PR
3. **Pre-Release Approval**: Before creating GitHub release and npm publish

**IMPORTANT**: No PR may be merged and no release may be created without explicit approval from the repository owner. All automated publishing workflows require manual approval trigger.

**Estimated Review Time**: 2-3 days
