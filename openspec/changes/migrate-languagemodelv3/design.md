# Technical Design: LanguageModelV3 Migration

## Document Information

- **Change ID**: migrate-languagemodelv3
- **Version**: 1.0.0
- **Status**: Implemented
- **Last Updated**: 2026-01-14

## Overview

This document provides the detailed technical architecture and implementation
design for migrating the SAP AI Provider from LanguageModelV2 to LanguageModelV3
interface specification.

## Architecture Changes

### 1. Core Interface Migration

#### 1.1 Class Signature

**Current (V2)**:

```typescript
export class SAPAILanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2";

  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: LanguageModelV2Content[];
    // ... V2 response structure
  }>;

  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    // ... V2 stream structure
  }>;
}
```

**Target (V3)**:

```typescript
export class SAPAILanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult>;

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult>;
}
```

#### 1.2 Import Changes

**File**: `src/sap-ai-language-model.ts`

```typescript
// REMOVE V2 imports
import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";

// ADD V3 imports
import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3CallWarning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3FunctionTool,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
```

### 2. Content Type System

#### 2.1 Content Type Mapping

SAP AI Core supports:

- Text content
- Image content (via multi-modal models)
- Tool call content
- Tool result content

V3 adds new content types we need to handle:

| V3 Content Type | SAP Support | Implementation Strategy                         |
| --------------- | ----------- | ----------------------------------------------- |
| `text`          | ✅ Full     | Map directly to SAP text                        |
| `image`         | ✅ Full     | Map to SAP image (URL or base64)                |
| `file`          | ❌ None     | Document as unsupported, add validation warning |
| `tool-call`     | ✅ Full     | Map to SAP tool calls                           |
| `tool-result`   | ✅ Full     | Map to SAP tool results                         |

#### 2.2 Content Conversion Architecture

**File**: `src/convert-to-sap-messages.ts`

Current structure processes V2 content. We need to:

1. **Update function signature**:

```typescript
// V2 (current)
export function convertToSAPMessages(
  messages: LanguageModelV2Message[],
): ChatMessage[];

// V3 (target)
export function convertToSAPMessages(
  messages: LanguageModelV3Message[],
): ChatMessage[];
```

2. **Add file content validation**:

```typescript
function validateAndConvertContent(
  content: LanguageModelV3ContentPart,
  warnings: LanguageModelV3CallWarning[],
): SAPContentPart | null {
  if (content.type === "file") {
    warnings.push({
      type: "unsupported-content",
      content,
      message:
        "SAP AI Core does not support file content type. This content will be skipped.",
    });
    return null;
  }

  // Process supported types...
}
```

### 3. Streaming Architecture

#### 3.1 Current V2 Stream Structure

```typescript
// Simple stream parts
type LanguageModelV2StreamPart =
  | { type: "stream-start"; warnings: LanguageModelV2CallWarning[] }
  | { type: "response-metadata"; modelId: string; timestamp: Date }
  | { type: "text-delta"; textDelta: string }
  | { type: "tool-call-start"; ... }
  | { type: "tool-call-delta"; ... }
  | { type: "tool-call-end"; ... }
  | { type: "finish"; finishReason: string; usage: ... }
  | { type: "error"; error: unknown }
```

#### 3.2 Target V3 Stream Structure

```typescript
// Structured stream parts with IDs and lifecycle
type LanguageModelV3StreamPart =
  | { type: "stream-start"; warnings: SharedV3Warning[] }
  | { type: "response-metadata"; modelId: string; timestamp: Date }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string; text: string }
  | { type: "tool-call-start"; ... }
  | { type: "tool-call-delta"; ... }
  | { type: "tool-call-end"; ... }
  | { type: "finish"; finishReason: string; usage: ... }
  | { type: "error"; error: unknown }
```

#### 3.3 Stream Transformation Design

**Key Changes**:

1. **Include warnings in stream-start**: V3 stream-start requires `warnings: Array<SharedV3Warning>` property per official specification
2. **Add text lifecycle tracking**: Text blocks need explicit start/end with
   accumulated content
3. **Generate unique IDs**: Each text/reasoning block needs a unique RFC 4122 UUID

**Implementation Strategy**:

```typescript
// Stream state tracking
interface StreamState {
  finishReason: LanguageModelV3FinishReason;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  isFirstChunk: boolean;

  // Text block tracking
  textBlocks: Map<
    string,
    {
      id: string;
      accumulated: string;
      isActive: boolean;
    }
  >;

  // Tool call tracking (similar to V2)
  toolCalls: Map<
    number,
    {
      id: string;
      toolName?: string;
      arguments: string;
      didEmitStart: boolean;
    }
  >;
}

// ID generation using native crypto.randomUUID()
class StreamIdGenerator {
  generateTextBlockId(): string {
    return crypto.randomUUID();
  }
}
```

**Rationale for ID Generation Strategy**:

- **Approach**: Use Node.js native `crypto.randomUUID()` for RFC 4122-compliant UUIDs
- **Benefits**:
  - **Standard-compliant**: RFC 4122 UUID v4 format
  - **Native implementation**: No external dependencies, built into Node.js 15.6.0+
  - **Collision-free**: Cryptographically random with ~5.3 × 10⁻³⁶ collision probability
  - **Simplicity**: Single line implementation, no state management needed
  - **Performance**: Native C++ implementation, faster than JavaScript alternatives
- **Alternative Considered**: Using `createIdGenerator()` from 'ai' package
  - Would allow shorter IDs with custom prefixes (e.g., `text-abc123`)
  - Adds dependency on 'ai' package internals
  - **Decision**: Prefer native approach for simplicity and independence

**Stream Transformation Flow**:

```typescript
const transformedStream = new ReadableStream<LanguageModelV3StreamPart>({
  async start(controller) {
    // V3: stream-start includes warnings per spec
    controller.enqueue({
      type: "stream-start",
      warnings: warningsSnapshot,
    });

    const idGenerator = new StreamIdGenerator();
    const streamState: StreamState = {
      finishReason: "unknown",
      usage: {},
      isFirstChunk: true,
      textBlocks: new Map(),
      toolCalls: new Map(),
    };

    for await (const chunk of v2Stream) {
      if (chunk.type === "text-delta") {
        const blockId = idGenerator.generateTextBlockId();

        // Emit text-start for new block
        if (!streamState.textBlocks.has(blockId)) {
          controller.enqueue({
            type: "text-start",
            index: streamState.textBlocks.size,
            id: blockId,
          });
          streamState.textBlocks.set(blockId, { id: blockId });
        }

        // Emit text-delta
        controller.enqueue({
          type: "text-delta",
          delta: chunk.textDelta,
          id: blockId,
        });
      }
      // ... handle other chunk types
    }

    // Emit text-end for all blocks
    for (const [id] of streamState.textBlocks) {
      controller.enqueue({ type: "text-end", id });
    }
  },
});
      textBlocks: new Map(),
      toolCalls: new Map(),
    };

    let currentTextBlockId: string | null = null;

    try {
      for await (const chunk of sdkStream) {
        // Emit response-metadata on first chunk
        if (streamState.isFirstChunk) {
          streamState.isFirstChunk = false;
          controller.enqueue({
            type: "response-metadata",
            modelId,
            timestamp: new Date(),
          });
        }

        // Process text deltas
        const deltaContent = chunk.getDeltaContent();
        if (typeof deltaContent === "string" && deltaContent.length > 0) {
          // Start new text block if needed
          if (!currentTextBlockId) {
            currentTextBlockId = idGenerator.generateTextBlockId();
            streamState.textBlocks.set(currentTextBlockId, {
              id: currentTextBlockId,
              accumulated: "",
              isActive: true,
            });

            controller.enqueue({
              type: "text-start",
              id: currentTextBlockId,
            });
          }

          // Emit text delta
          const block = streamState.textBlocks.get(currentTextBlockId)!;
          block.accumulated += deltaContent;

          controller.enqueue({
            type: "text-delta",
            id: currentTextBlockId,
            delta: deltaContent,
          });
        }

        // Handle tool calls (similar to V2 but with V3 types)
        const deltaToolCalls = chunk.getDeltaToolCalls();
        if (Array.isArray(deltaToolCalls) && deltaToolCalls.length > 0) {
          // Close any active text block
          if (currentTextBlockId) {
            const block = streamState.textBlocks.get(currentTextBlockId)!;
            controller.enqueue({
              type: "text-end",
              id: currentTextBlockId,
              text: block.accumulated,
            });
            block.isActive = false;
            currentTextBlockId = null;
          }

          // Process tool calls...
          streamState.finishReason = "tool-calls";
        }

        // Process usage updates
        const usage = chunk.getUsage();
        if (usage) {
          streamState.usage = {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            totalTokens: usage.total_tokens,
          };
        }
      }

      // Close any active text block before finish
      if (currentTextBlockId) {
        const block = streamState.textBlocks.get(currentTextBlockId)!;
        controller.enqueue({
          type: "text-end",
          id: currentTextBlockId,
          text: block.accumulated,
        });
      }

      // Emit finish event
      controller.enqueue({
        type: "finish",
        finishReason: streamState.finishReason,
        usage: streamState.usage as LanguageModelV3Usage,
      });

      controller.close();
    } catch (error) {
      controller.enqueue({
        type: "error",
        error,
      });
      controller.close();
    }
  },
});
```

### 4. Usage Information Enhancement

#### 4.1 V2 Usage Structure (Current)

```typescript
type LanguageModelV2Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};
```

#### 4.2 V3 Usage Structure (Target)

```typescript
type LanguageModelV3Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  // New: Detailed token breakdown
  inputTokenDetails?: {
    textTokens?: number;
    imageTokens?: number;
    audioTokens?: number;
  };

  outputTokenDetails?: {
    textTokens?: number;
    reasoningTokens?: number;
  };
};
```

#### 4.3 Usage Mapping Strategy

**SAP AI Core Response Structure**:

```typescript
// SAP provides basic token counts
interface SAPUsage {
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;
}
```

**Mapping Logic**:

```typescript
function mapUsageToV3(sapUsage: SAPUsage): LanguageModelV3Usage {
  return {
    inputTokens: sapUsage.prompt_tokens,
    outputTokens: sapUsage.completion_tokens,
    totalTokens: sapUsage.total_tokens,

    // SAP doesn't provide detailed breakdowns
    // Leave detailed fields undefined (optional in V3)
    inputTokenDetails: undefined,
    outputTokenDetails: undefined,
  };
}
```

**Future Enhancement**: If SAP AI Core adds detailed token breakdowns, we can
populate these fields:

```typescript
// Example if SAP adds details
if (sapResponse.usage_details) {
  usage.inputTokenDetails = {
    textTokens: sapResponse.usage_details.prompt_text_tokens,
    imageTokens: sapResponse.usage_details.prompt_image_tokens,
  };

  usage.outputTokenDetails = {
    textTokens: sapResponse.usage_details.completion_text_tokens,
  };
}
```

### 5. Warning System

#### 5.1 Warning Type Mapping

V3 maintains the same warning types as V2:

```typescript
type LanguageModelV3CallWarning =
  | { type: "unsupported-setting"; setting: string; details?: string }
  | { type: "unsupported-tool"; tool: LanguageModelV3FunctionTool }
  | { type: "unsupported-content"; content: LanguageModelV3ContentPart }
  | { type: "other"; message: string };
```

**No changes needed** - warning system is compatible between V2 and V3.

#### 5.2 New Warning Scenarios for V3

Add warnings for V3-specific unsupported features:

```typescript
// In convertToSAPMessages - File content validation
if (contentPart.type === "file") {
  // V3: Only image files supported, throw error for non-images
  if (!contentPart.mediaType.startsWith("image/")) {
    throw new UnsupportedFunctionalityError({
      functionality: "Only image files are supported",
    });
  }
}

// V3 Note: Reasoning mode
// LanguageModelV3CallOptions does NOT have an 'options.reasoning' field
// This is a V2→V3 breaking change
// In V3, reasoning is handled through message content with reasoning parts
// Provider-specific reasoning support uses providerOptions.sap.includeReasoning
```

### 6. Generate Result Structure

#### 6.1 V2 Result (Current)

```typescript
// Return type is an anonymous object
async doGenerate(options: LanguageModelV2CallOptions): Promise<{
  content: LanguageModelV2Content[];
  finishReason: LanguageModelV2FinishReason;
  usage: LanguageModelV2Usage;
  providerMetadata?: Record<string, Record<string, JSONValue>>;
  request: { body?: unknown };
  response: {
    timestamp: Date;
    modelId: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  warnings: LanguageModelV2CallWarning[];
}>
```

#### 6.2 V3 Result (Target)

```typescript
// Uses structured type
type LanguageModelV3GenerateResult = {
  content: LanguageModelV3Content[];
  finishReason: LanguageModelV3FinishReason;
  usage: LanguageModelV3Usage;
  warnings?: LanguageModelV3CallWarning[];
  request?: { body?: string };
  response?: {
    id?: string;
    timestamp?: Date;
    modelId?: string;
    headers?: Record<string, string>;
  };
  providerMetadata?: Record<string, Record<string, JSONValue>>;
};
```

#### 6.3 Structural Changes

**Key Differences**:

1. `warnings` becomes optional (was required in V2)
2. `request` becomes optional (was required in V2)
3. `response` becomes optional with all nested fields optional (V2 had required
   structure)
4. Field ordering matches V3 specification

**Migration Strategy**:

```typescript
async doGenerate(
  options: LanguageModelV3CallOptions
): Promise<LanguageModelV3GenerateResult> {
  try {
    // ... SAP API call logic (similar to V2)

    const result: LanguageModelV3GenerateResult = {
      // Required fields
      content: mappedContent,
      finishReason: mappedFinishReason,
      usage: mappedUsage,

      // Optional fields (always provide for compatibility)
      warnings: warnings.length > 0 ? warnings : undefined,

      request: {
        body: JSON.stringify(requestBody),
      },

      response: {
        id: response.id,
        timestamp: new Date(),
        modelId: this.modelId,
        headers: response.headers,
      },

      providerMetadata: {
        sap: {
          orchestrationRequestId: response.orchestrationRequestId,
          moduleResults: response.moduleResults,
        },
      },
    };

    return result;
  } catch (error) {
    throw convertToAISDKError(error);
  }
}
```

### 7. Error Handling

No changes to error handling - V3 uses the same error types as V2:

```typescript
// Existing error converter remains unchanged
import { convertToAISDKError } from "./sap-ai-error";

try {
  // ... operation
} catch (error) {
  throw convertToAISDKError(error);
}
```

Error types remain:

- `AISDKError` (base)
- `InvalidPromptError`
- `InvalidArgumentError`
- `APICallError`
- `LoadAPIKeyError`
- etc.

### 8. Type Definitions Update

#### 8.1 Settings Types

**File**: `src/sap-ai-settings.ts`

No changes needed - settings are provider-specific and don't depend on V2/V3:

```typescript
export type SAPAIModelId = string;

export interface SAPAISettings {
  modelParams?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    n?: number;
    parallel_tool_calls?: boolean;
  };
  destination?: HttpDestinationOrFetchOptions;
  deploymentConfig?: ResourceGroupConfig | DeploymentIdConfig;
}
```

#### 8.2 Provider Options

**File**: `src/sap-ai-provider.ts`

Update type annotations to reference V3:

```typescript
import { LanguageModelV3 } from "@ai-sdk/provider";

export interface SAPAIProvider {
  (modelId: SAPAIModelId, settings?: SAPAISettings): LanguageModelV3; // Changed from LanguageModelV2

  chat(modelId: SAPAIModelId, settings?: SAPAISettings): LanguageModelV3; // Changed from LanguageModelV2
}
```

### 9. Testing Strategy

#### 9.1 Test File Updates

**Files to Update**:

- `tests/sap-ai-language-model.test.ts`
- `tests/convert-to-sap-messages.test.ts`
- `tests/integration/*.test.ts`

**Changes Needed**:

1. **Import updates**:

```typescript
// Replace V2 imports with V3
import {
  LanguageModelV3CallOptions,
  LanguageModelV3Usage,
  // ... other V3 types
} from "@ai-sdk/provider";
```

2. **Mock response structures**:

```typescript
// Update mocks to return V3 structures
const mockV3Result: LanguageModelV3GenerateResult = {
  content: [{ type: "text", text: "Hello" }],
  finishReason: "stop",
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
  },
  warnings: [],
  response: {
    modelId: "test-model",
    timestamp: new Date(),
  },
};
```

3. **Stream testing**:

```typescript
// Test V3 stream structure
it("should emit text-start, text-delta, text-end for streaming", async () => {
  const chunks: LanguageModelV3StreamPart[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  expect(chunks).toContainEqual({
    type: "stream-start",
    warnings: expect.any(Array),
  });
  expect(chunks).toContainEqual(
    expect.objectContaining({ type: "text-start", id: expect.any(String) }),
  );
  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: "text-delta",
      id: expect.any(String),
      delta: expect.any(String),
    }),
  );
  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: "text-end",
      id: expect.any(String),
      text: expect.any(String),
    }),
  );
});
```

#### 9.2 New Test Cases for V3

Add tests for V3-specific features:

```typescript
describe("V3 Content Types", () => {
  it("should warn about unsupported file content", async () => {
    const result = await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "file", mimeType: "application/pdf", data: "..." }],
        },
      ],
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: "unsupported-content",
      }),
    );
  });

  it("should handle V3 usage structure", async () => {
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    });

    expect(result.usage).toEqual({
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      totalTokens: expect.any(Number),
      inputTokenDetails: undefined, // SAP doesn't provide
      outputTokenDetails: undefined,
    });
  });
});

describe("V3 Streaming", () => {
  it("should generate unique IDs for text blocks", async () => {
    const { stream } = await model.doStream({
      prompt: [
        { role: "user", content: [{ type: "text", text: "Count to 3" }] },
      ],
    });

    const textBlockIds = new Set<string>();

    for await (const chunk of stream) {
      if (chunk.type === "text-start") {
        textBlockIds.add(chunk.id);
      }
    }

    expect(textBlockIds.size).toBeGreaterThan(0);
  });

  it("should emit text-end with accumulated content", async () => {
    const { stream } = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    });

    let textEnd: LanguageModelV3StreamPart | undefined;

    for await (const chunk of stream) {
      if (chunk.type === "text-end") {
        textEnd = chunk;
        break;
      }
    }

    expect(textEnd).toBeDefined();
    expect(textEnd).toMatchObject({
      type: "text-end",
      id: expect.any(String),
      text: expect.any(String),
    });
  });
});
```

### 10. Documentation Updates

#### 10.1 README.md Updates

**Breaking Changes Section**:

````markdown
## Version 4.0.0 Breaking Changes

This version migrates from LanguageModelV2 to LanguageModelV3 interface.

### What Changed

1. **Stream Structure**: Streaming now uses structured blocks with explicit
   start/end events
2. **Usage Information**: New optional `inputTokenDetails` and
   `outputTokenDetails` fields
3. **Result Types**: Using structured `LanguageModelV3GenerateResult` and
   `LanguageModelV3StreamResult`
4. **Content Types**: File content type is not supported by SAP AI Core
   (warnings will be emitted)

### Migration Guide

If you're upgrading from 3.x:

```typescript
// Before (3.x - V2)
for await (const chunk of stream) {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.textDelta);
  }
}

// After (4.x - V3)
for await (const chunk of stream) {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.delta); // Property renamed
  }
}
```
````

### Supported Features

✅ **Fully Supported**:

- Text generation and streaming
- Multi-modal input (text + images)
- Tool calling (function calling)
- Token usage tracking

❌ **Not Supported** (SAP AI Core limitations):

- File content generation
- Reasoning mode
- Source attribution
- Tool approval requests
- Detailed token breakdowns (inputTokenDetails, outputTokenDetails)

````
#### 10.2 New MIGRATION_GUIDE.md File

Create comprehensive migration guide covering:

- Version compatibility matrix
- Code examples (before/after)
- Common migration scenarios
- Troubleshooting guide
- FAQ

## Implementation Phases

### Phase 1: Preparation (Day 1)

- Create feature branch `feature/languagemodelv3`
- Update dependencies if needed
- Set up test fixtures for V3

### Phase 2: Core Migration (Days 2-4)

- Update imports and type definitions
- Migrate `doGenerate` method
- Migrate `doStream` method with text block tracking
- Update content conversion logic
- Update usage mapping

### Phase 3: Testing (Day 5)

- Update existing tests
- Add V3-specific test cases
- Run integration tests
- Manual testing with example projects

### Phase 4: Documentation (Day 6)

- Update README.md
- Update MIGRATION_GUIDE.md (add v3.x→4.x section)
- Update API documentation
- Update test-quick.ts (version references only)
- Validate examples (compilation check, no code changes)

### Phase 5: Release (Day 7)

**IMPORTANT**: Release is automated via GitHub Actions workflow.

- Final review
- Version bump to 4.0.0
- Create release notes
- Create GitHub release on **origin** repository (`jerome-benoit/sap-ai-provider`)
  - This automatically triggers npm publish via `.github/workflows/npm-publish-npm-packages.yml`
- Announce breaking changes

## Risk Mitigation

### Risk 1: Stream ID Generation Collisions

**Impact**: Medium - ID collisions could cause incorrect text block lifecycle tracking

**Mitigation**:

- Use `StreamIdGenerator` class with unique prefix per stream instance
- Combine timestamp + random component for collision resistance
- Reset counter per stream to keep IDs deterministic within stream

```typescript
class StreamIdGenerator {
  private textBlockCounter = 0;
  private readonly streamPrefix: string;

  constructor() {
    // Use timestamp + random component for uniqueness
    this.streamPrefix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  generateTextBlockId(): string {
    return `text-${this.streamPrefix}-${this.textBlockCounter++}`;
  }
}
```

**Benefits**:
- Virtually eliminates collision risk in concurrent streams
- Maintains deterministic ordering within a single stream
- Minimal performance overhead (one-time prefix generation)
- Easy to debug with human-readable IDs

### Risk 2: Missing SAP Token Details

**Impact**: Low - V3 token details are optional

**Mitigation**:

- Document that SAP doesn't provide detailed breakdowns
- Leave fields undefined (valid per V3 spec)
- Monitor SAP AI Core API for future additions

### Risk 3: Test Coverage Gaps

**Mitigation**:

- Maintain >90% code coverage
- Add specific tests for V3 features
- Use integration tests with real SAP AI Core endpoints
- Test with multiple model types (OpenAI, Anthropic, etc.)

## Performance Considerations

### Stream Processing Overhead

**V2 Approach**: Simple pass-through of deltas **V3 Approach**: Track text
blocks + accumulate content

**Performance Impact**:

- Minimal memory overhead (accumulated strings per block)
- No significant CPU overhead (simple string concatenation)
- Stream latency unchanged (events emitted immediately)

**Optimization**:

- Use StringBuilder pattern for large text blocks if needed
- Clean up completed blocks from memory
- Limit concurrent text block tracking

### Memory Usage

**Estimated Additional Memory per Stream**:

- Text block Map: ~500 bytes per active block
- Accumulated text: Depends on content size
- Typical overhead: <1KB for normal conversations

## Backward Compatibility

### Version Support Strategy

- **v4.x (V3)**: Active development
- **v3.x (V2)**: Security + critical bugs for 6 months
- **v2.x and earlier**: No longer supported

### Deprecation Timeline

- **2026-01**: v4.0.0 released, v3.x enters maintenance
- **2026-07**: v3.x support ends
- **Future**: v3.x marked as deprecated in npm

## Open Questions & Decisions Needed

1. **SAP AI Core File Support**: Verify if SAP plans to support file content
   type
   - **Action**: Contact SAP AI Core team for roadmap
   - **Decision Needed**: How to document future support

2. **Reasoning Mode**: Does SAP AI Core support reasoning mode for any models?
   - **Action**: Test with o1 models if available
   - **Decision Needed**: Add support or document limitation

3. **Source Attribution**: Can SAP provide source attribution metadata?
   - **Action**: Review SAP response structures
   - **Decision Needed**: Implementation strategy if supported

4. **Codemod Tool**: Should we provide automated migration codemod?
   - **Pros**: Easier migration for users
   - **Cons**: Development effort, maintenance
   - **Decision Needed**: Build codemod or rely on documentation

## References

- [AI SDK V3 Specification](https://sdk.vercel.ai/docs/ai-sdk-core/provider-management)
- [Mistral V3 Implementation](https://github.com/vercel/ai/blob/main/packages/mistral/src/mistral-chat-language-model.ts)
- [SAP AI SDK Documentation](https://help.sap.com/docs/sap-ai-core)
- [Semantic Versioning](https://semver.org/)

---

**Document Status**: Ready for Review\
**Next Step**: Create tasks.md with granular implementation checklist
````
