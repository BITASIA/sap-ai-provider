# SAP AI Provider Specification - LanguageModelV3 Migration

## Document Information

- **Change ID**: migrate-languagemodelv3
- **Component**: sap-ai-provider
- **Version**: 4.0.0
- **Status**: Proposed

---

## ADDED Requirements

### Requirement: LanguageModelV3 Interface Implementation

The SAP AI Provider SHALL implement the LanguageModelV3 interface as defined by the Vercel AI SDK @ai-sdk/provider package version 3.0.0 or higher.

**Rationale**: LanguageModelV3 is the current specification for language model providers in AI SDK 6.x. Migration ensures compatibility with the latest AI SDK features and patterns.

**Priority**: Critical

#### Scenario: Specification Version Declaration

**GIVEN** a SAPAIChatLanguageModel instance is created  
**WHEN** the specificationVersion property is accessed  
**THEN** it SHALL return the string "v3"

#### Scenario: doGenerate Method Signature

**GIVEN** the SAPAIChatLanguageModel class  
**WHEN** the doGenerate method is called  
**THEN** it SHALL accept a single parameter of type LanguageModelV3CallOptions  
**AND** it SHALL return a Promise that resolves to LanguageModelV3GenerateResult

#### Scenario: doStream Method Signature

**GIVEN** the SAPAIChatLanguageModel class  
**WHEN** the doStream method is called  
**THEN** it SHALL accept a single parameter of type LanguageModelV3CallOptions  
**AND** it SHALL return a Promise that resolves to LanguageModelV3StreamResult

### Requirement: V3 Content Type Support

The provider SHALL support all LanguageModelV3 content types with appropriate handling or warnings for unsupported types.

**Rationale**: V3 introduces new content types (file, reasoning) that may not be supported by SAP AI Core. The provider must handle these gracefully.

**Priority**: High

#### Scenario: Text Content Processing

**GIVEN** a generate or stream request with text content  
**WHEN** the request is processed  
**THEN** the text content SHALL be correctly mapped to SAP AI Core message format  
**AND** the response SHALL contain LanguageModelV3 text content

#### Scenario: Image Content Processing

**GIVEN** a generate or stream request with image content  
**WHEN** the request is processed  
**THEN** the image content SHALL be correctly mapped to SAP AI Core multi-modal format  
**AND** the response SHALL support image content in prompts

#### Scenario: File Content Validation

**GIVEN** a generate or stream request with file content  
**WHEN** the request is processed  
**THEN** a warning of type "unsupported-content" SHALL be added to the warnings array  
**AND** the file content SHALL be skipped in the SAP AI Core request  
**AND** the warning message SHALL indicate SAP AI Core does not support file content

#### Scenario: Tool Call Content Processing

**GIVEN** a generate request with tool-call content  
**WHEN** the request is processed  
**THEN** the tool calls SHALL be correctly mapped to SAP AI Core tool format  
**AND** the response SHALL contain tool call content in V3 format

#### Scenario: Tool Result Content Processing

**GIVEN** a generate request with tool-result content  
**WHEN** the request is processed  
**THEN** the tool results SHALL be correctly mapped to SAP AI Core message format  
**AND** subsequent generations SHALL have access to tool result context

### Requirement: Structured Streaming with Text Blocks

The provider SHALL emit V3 structured stream parts with explicit text block lifecycle events (text-start, text-delta, text-end).

**Rationale**: V3 replaces simple text deltas with structured blocks that have unique IDs and explicit start/end events. This enables better stream processing and reconstruction.

**Priority**: Critical

#### Scenario: Stream Start Event

**GIVEN** a stream request is initiated  
**WHEN** the stream begins  
**THEN** the first event SHALL be of type "stream-start"  
**AND** the stream-start event SHALL NOT contain any properties (clean V3 structure)

#### Scenario: Response Metadata Event

**GIVEN** a stream request is initiated  
**WHEN** the first chunk is received from SAP AI Core  
**THEN** a "response-metadata" event SHALL be emitted after stream-start  
**AND** the event SHALL contain modelId and timestamp properties

#### Scenario: Text Block Start Event

**GIVEN** a streaming response with text content  
**WHEN** the first text delta is received  
**THEN** a "text-start" event SHALL be emitted  
**AND** the event SHALL contain a unique id property of type string

#### Scenario: Text Block Delta Events

**GIVEN** a text block has been started  
**WHEN** subsequent text deltas are received  
**THEN** "text-delta" events SHALL be emitted  
**AND** each event SHALL contain the same id as the text-start event  
**AND** each event SHALL contain a delta property with the incremental text

#### Scenario: Text Block End Event

**GIVEN** a text block has been started and deltas emitted  
**WHEN** the text block is complete (tool calls start OR stream finishes)  
**THEN** a "text-end" event SHALL be emitted  
**AND** the event SHALL contain the same id as the text-start event  
**AND** the event SHALL contain a text property with the complete accumulated text

#### Scenario: Unique Text Block IDs

**GIVEN** multiple text blocks in a single stream  
**WHEN** each text block is emitted  
**THEN** each block SHALL have a unique id  
**AND** IDs SHALL be deterministic within the stream session  
**AND** IDs SHALL follow a consistent format (e.g., "text-0", "text-1")

#### Scenario: Stream Finish Event

**GIVEN** a streaming response is complete  
**WHEN** all content has been emitted  
**THEN** a "finish" event SHALL be emitted  
**AND** the event SHALL contain finishReason of type LanguageModelV3FinishReason  
**AND** the event SHALL contain usage of type LanguageModelV3Usage  
**AND** all active text blocks SHALL be closed before finish

### Requirement: Enhanced Usage Information Structure

The provider SHALL return usage information in the V3 structure with support for optional detailed token breakdowns.

**Rationale**: V3 adds optional inputTokenDetails and outputTokenDetails for more granular token usage tracking. SAP AI Core may not provide these details, so they remain optional.

**Priority**: Medium

#### Scenario: Basic Usage Information

**GIVEN** a successful generate or stream request  
**WHEN** usage information is returned  
**THEN** it SHALL contain inputTokens as a number  
**AND** it SHALL contain outputTokens as a number  
**AND** it SHALL contain totalTokens as a number

#### Scenario: Detailed Input Token Breakdown

**GIVEN** SAP AI Core provides detailed input token information  
**WHEN** usage information is constructed  
**THEN** inputTokenDetails MAY contain textTokens  
**AND** inputTokenDetails MAY contain imageTokens  
**AND** inputTokenDetails MAY contain audioTokens

**Note**: Currently, SAP AI Core does not provide these details. This requirement enables future compatibility.

#### Scenario: Detailed Output Token Breakdown

**GIVEN** SAP AI Core provides detailed output token information  
**WHEN** usage information is constructed  
**THEN** outputTokenDetails MAY contain textTokens  
**AND** outputTokenDetails MAY contain reasoningTokens

**Note**: Currently, SAP AI Core does not provide these details. This requirement enables future compatibility.

#### Scenario: Undefined Token Details

**GIVEN** SAP AI Core does not provide detailed token breakdowns  
**WHEN** usage information is constructed  
**THEN** inputTokenDetails SHALL be undefined  
**AND** outputTokenDetails SHALL be undefined  
**AND** basic token counts SHALL still be accurate

### Requirement: V3 Result Type Structures

The provider SHALL return generate and stream results using the structured V3 types with correct field ordering and optionality.

**Rationale**: V3 defines specific result types (LanguageModelV3GenerateResult, LanguageModelV3StreamResult) with optional fields. This improves type safety and consistency.

**Priority**: High

#### Scenario: Generate Result Structure

**GIVEN** a successful doGenerate call  
**WHEN** the result is returned  
**THEN** it SHALL be of type LanguageModelV3GenerateResult  
**AND** it SHALL contain required fields: content, finishReason, usage  
**AND** it MAY contain optional fields: warnings, request, response, providerMetadata  
**AND** field ordering SHALL match V3 specification

#### Scenario: Generate Result with Warnings

**GIVEN** a generate request that produces warnings  
**WHEN** the result is returned  
**THEN** the warnings field SHALL be an array of LanguageModelV3CallWarning  
**AND** if no warnings exist, the field SHALL be undefined

#### Scenario: Generate Result Response Metadata

**GIVEN** a successful doGenerate call  
**WHEN** the result contains response metadata  
**THEN** the response field MAY contain id, timestamp, modelId, headers  
**AND** all nested response fields SHALL be optional

#### Scenario: Stream Result Structure

**GIVEN** a successful doStream call  
**WHEN** the result is returned  
**THEN** it SHALL be of type LanguageModelV3StreamResult  
**AND** it SHALL contain a stream field of type ReadableStream<LanguageModelV3StreamPart>  
**AND** it MAY contain optional fields: warnings, request, response

### Requirement: Content Type Validation and Warnings

The provider SHALL validate all content types and emit appropriate warnings for unsupported or potentially problematic content.

**Rationale**: Proactive validation helps developers identify issues early and understand SAP AI Core limitations.

**Priority**: High

#### Scenario: Unsupported Content Warning Structure

**GIVEN** content that is not supported by SAP AI Core  
**WHEN** a warning is generated  
**THEN** it SHALL have type "unsupported-content"  
**AND** it SHALL contain the original content object  
**AND** it MAY contain a descriptive message explaining the limitation

#### Scenario: File Content Warning

**GIVEN** a request with file content type  
**WHEN** the request is validated  
**THEN** an unsupported-content warning SHALL be added  
**AND** the message SHALL indicate file content is not supported by SAP AI Core

#### Scenario: Multiple Unsupported Content Items

**GIVEN** a request with multiple unsupported content items  
**WHEN** validation occurs  
**THEN** a warning SHALL be generated for EACH unsupported item  
**AND** all warnings SHALL be included in the result

### Requirement: Backward Incompatibility Declaration

The provider version 4.x SHALL NOT maintain backward compatibility with LanguageModelV2.

**Rationale**: The migration to V3 is a breaking change requiring a major version bump. This is intentional and documented.

**Priority**: High

#### Scenario: Major Version Bump

**GIVEN** the migration to LanguageModelV3  
**WHEN** the package is released  
**THEN** the version SHALL be 4.0.0 or higher  
**AND** this SHALL be documented as a breaking change

#### Scenario: V2 Interface Removal

**GIVEN** version 4.0.0 of the provider  
**WHEN** the package is imported  
**THEN** LanguageModelV2 imports SHALL be removed  
**AND** only LanguageModelV3 types SHALL be used

---

## MODIFIED Requirements

### Requirement: Error Handling Compatibility

**Status**: Modified - V3 error type compatibility verified

The provider SHALL continue to convert SAP AI SDK errors to AI SDK error types using the convertToAISDKError function. V3 maintains the same error types as V2, requiring no functional changes.

**Rationale**: V3 error handling is backward compatible with V2. This requirement confirms compatibility.

**Priority**: Medium

#### Scenario: V3 Error Type Compatibility

**GIVEN** an error occurs during a V3 doGenerate or doStream call  
**WHEN** the error is converted using convertToAISDKError  
**THEN** it SHALL produce a valid AI SDK error type  
**AND** the error SHALL be compatible with V3 error handling

#### Scenario: Error Conversion Unchanged

**GIVEN** the existing convertToAISDKError function  
**WHEN** V3 migration is complete  
**THEN** the function SHALL remain functionally unchanged  
**AND** it SHALL work with both V2 and V3 contexts

### Requirement: Tool Calling Type Migration

**Status**: Modified - Type signatures updated to V3

The provider SHALL support tool calling with LanguageModelV3 types. The conversion logic remains functionally identical, but type signatures SHALL use V3 types.

**Rationale**: Tool calling functionality is compatible between V2 and V3. Only TypeScript types need updating.

**Priority**: High

#### Scenario: V3 Tool Definition Acceptance

**GIVEN** a request with LanguageModelV3FunctionTool definitions  
**WHEN** tools are converted to SAP format  
**THEN** the conversion logic SHALL remain functionally identical to V2  
**AND** type signatures SHALL use LanguageModelV3FunctionTool instead of V2

#### Scenario: V3 Tool Call Results

**GIVEN** a response with tool calls from SAP AI Core  
**WHEN** results are returned to the caller  
**THEN** they SHALL be in LanguageModelV3Content format  
**AND** the structure SHALL be compatible with SAP AI Core  
**AND** tool call IDs SHALL be preserved correctly

#### Scenario: Tool Parameter Schema Conversion

**GIVEN** a V3 tool definition with parameter schema  
**WHEN** the schema is converted for SAP AI Core  
**THEN** the conversion SHALL support both JSON Schema and Zod schemas  
**AND** the resulting SAP parameters SHALL be functionally identical to V2 conversion

### Requirement: Multi-Modal Content Type Migration

**Status**: Modified - Type signatures updated to V3

The provider SHALL support multi-modal content (text + images) with LanguageModelV3 types. The processing logic remains functionally identical, but type signatures SHALL use V3 types.

**Rationale**: Multi-modal support is compatible between V2 and V3. Only TypeScript types need updating.

**Priority**: High

#### Scenario: V3 Image Content Processing

**GIVEN** a request with LanguageModelV3 image content  
**WHEN** images are processed and sent to SAP AI Core  
**THEN** the processing logic SHALL remain functionally identical to V2  
**AND** type signatures SHALL use LanguageModelV3 content types  
**AND** image URLs and base64 data SHALL be handled correctly

#### Scenario: V3 Multi-Modal Message Construction

**GIVEN** a request with mixed text and image content  
**WHEN** messages are constructed for SAP AI Core  
**THEN** the message structure SHALL support multi-modal content  
**AND** the conversion SHALL use LanguageModelV3Message types  
**AND** compatibility with SAP AI Core multi-modal API SHALL be maintained

---

## REMOVED Requirements

### Requirement: LanguageModelV2 Interface Implementation

**Status**: REMOVED in version 4.0.0

**Reason**: Superseded by LanguageModelV3 interface implementation

**Migration Path**:

- Users of version 3.x must upgrade to version 4.x
- Version 3.x will receive security updates for 6 months (until 2026-07-XX)
- See MIGRATION_GUIDE.md for detailed upgrade instructions

### Requirement: V2 Simple Stream Deltas

**Status**: REMOVED in version 4.0.0

**Previous Behavior**: Streams emitted simple `text-delta` events with a `textDelta` property

**Reason**: Replaced by V3 structured text blocks with start/delta/end lifecycle

**Migration Path**:

```typescript
// V2 (removed)
for await (const chunk of stream) {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.textDelta);
  }
}

// V3 (current)
for await (const chunk of stream) {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.delta); // Property renamed
  }
  // New: handle text-start and text-end if needed
}
```

### Requirement: Stream-Start Warning Inclusion

**Status**: REMOVED in version 4.0.0

**Previous Behavior**: The `stream-start` event included a `warnings` property

**Reason**: V3 stream-start event has no properties. Warnings are now returned in the overall stream result.

**Migration Path**:

```typescript
// V2 (removed)
for await (const chunk of stream) {
  if (chunk.type === "stream-start") {
    console.log(chunk.warnings); // No longer available
  }
}

// V3 (current)
const { stream, warnings } = await model.doStream(options);
console.log(warnings); // Warnings at result level
```

### Requirement: Anonymous Return Types

**Status**: REMOVED in version 4.0.0

**Previous Behavior**: `doGenerate` and `doStream` returned anonymous object types

**Reason**: V3 uses explicit structured types (LanguageModelV3GenerateResult, LanguageModelV3StreamResult)

**Impact**: Improved type safety and consistency

---

## Validation Rules

### Validation Rule: Content Type Completeness

**Rule**: All LanguageModelV3Content types MUST be handled (either supported or warned about)

**Check**:

- text ✅ Supported
- image ✅ Supported
- file ⚠️ Warning emitted
- tool-call ✅ Supported
- tool-result ✅ Supported

### Validation Rule: Stream Event Ordering

**Rule**: Stream events MUST follow the correct order

**Required Order**:

1. `stream-start` (always first)
2. `response-metadata` (after first chunk)
3. Content events (text blocks, tool calls)
4. `finish` or `error` (always last)

### Validation Rule: Text Block Lifecycle

**Rule**: Every `text-start` MUST have a corresponding `text-end`

**Check**: For each text block ID:

- One `text-start` with that ID
- Zero or more `text-delta` with that ID
- Exactly one `text-end` with that ID

### Validation Rule: Usage Information Completeness

**Rule**: Usage information MUST always include basic token counts

**Required Fields**:

- `inputTokens` (number)
- `outputTokens` (number)
- `totalTokens` (number)

**Optional Fields**:

- `inputTokenDetails` (object or undefined)
- `outputTokenDetails` (object or undefined)

---

## Acceptance Criteria

The migration to LanguageModelV3 SHALL be considered complete when:

1. ✅ All ADDED requirements are implemented and tested
2. ✅ All MODIFIED requirements are updated to V3 types
3. ✅ All REMOVED requirements are no longer present in the code
4. ✅ Test coverage remains ≥90%
5. ✅ All integration tests pass with real SAP AI Core endpoints
6. ✅ Documentation (README, MIGRATION.md, CHANGELOG) is complete
7. ✅ Package version is bumped to 4.0.0
8. ✅ npm publish succeeds
9. ✅ Example projects work with v4.0.0

---

## References

- [AI SDK Provider Interface Specification](https://sdk.vercel.ai/docs/ai-sdk-core/provider-interfaces)
- [LanguageModelV3 Type Definitions](https://github.com/vercel/ai/blob/main/packages/provider/src/language-model/v3)
- [Mistral V3 Reference Implementation](https://github.com/vercel/ai/blob/main/packages/mistral/src/mistral-chat-language-model.ts)
- [SAP AI SDK Orchestration Client](https://help.sap.com/docs/sap-ai-core)
- [Semantic Versioning 2.0.0](https://semver.org/)

---

**Document Status**: Ready for Validation  
**OpenSpec Compliance**: This specification follows OpenSpec format with ADDED/MODIFIED/REMOVED sections and Scenario-based requirements.
