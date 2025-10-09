# Changelog

## Unreleased

- Orchestration v2 support
  - Request body now built under `config.modules.prompt_templating` with `prompt.response_format` and `prompt.tools`
  - Response schemas aligned to v2 (`intermediate_results`, `final_result`) with legacy fallback
  - Tool calls surfaced via `tool_calls` in choices and stream deltas
  - Added `messages_history` support in request schema
  - Added `output_unmasking` to intermediate results
- Endpoint selection
  - Default endpoint: `${baseURL}/inference/deployments/{deploymentId}/v2/completion`
  - New `completionPath` option to target top-level `/v2/completion`
- Response formatting
  - New `SAPAISettings.responseFormat` and per-call `options.response_format` to control `response_format`
  - Default to `{ type: "text" }` when no tools are used
- Examples
  - New streaming example with Vercel AI SDK: `examples/example-streaming-chat.ts`
  - Minor updates to examples to reflect v2 and streaming
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive JSDoc comments throughout codebase for better IDE support
- Table of Contents in README.md for improved navigation
- Quick Start section in README.md for immediate usage
- Detailed API Reference section with complete parameter documentation
- Comprehensive Troubleshooting guide with common issues and solutions
- Performance & Best Practices section with optimization tips
- ARCHITECTURE.md document explaining internal design and patterns
- Enhanced type documentation with detailed property descriptions
- Advanced usage examples in README.md
- Security best practices documentation
- Production deployment guidelines
- Debug mode instructions
- Request retry and error handling patterns

### Improved
- Enhanced documentation for all public interfaces and classes
- Better inline code documentation with usage examples
- More detailed error handling documentation with code examples
- Expanded configuration options documentation
- Improved authentication setup instructions
- Better model selection guidance
- Enhanced code examples with real-world scenarios

### Documentation
- Added comprehensive JSDoc comments to `SAPAIProvider` interface
- Added comprehensive JSDoc comments to `SAPAIProviderSettings` interface
- Added comprehensive JSDoc comments to `SAPAIServiceKey` interface
- Added comprehensive JSDoc comments to `createSAPAIProvider` function
- Added comprehensive JSDoc comments to `getOAuthToken` function
- Enhanced `convertToSAPMessages` function documentation
- Added detailed type documentation for all message formats
- Added extensive API reference with parameter tables
- Added troubleshooting section with common issues and solutions
- Added performance optimization guide
- Added production deployment best practices
- Added security considerations documentation

## [1.0.3] - 2024-01-XX

### Added
- Support for multiple SAP AI Core model types
- OAuth2 authentication with automatic token management
- Streaming support for real-time text generation
- Tool calling capabilities for function integration
- Multi-modal input support (text + images)
- Structured output support with JSON schemas
- Comprehensive error handling with automatic retries
- TypeScript support with full type safety

### Features
- Integration with Vercel AI SDK v5
- Support for 40+ AI models including GPT-4, Claude, Gemini
- Automatic service key parsing and authentication
- Configurable deployment and resource group settings
- Custom fetch implementation support
- Built-in error recovery and retry logic

### Initial Release
- Core SAP AI Core provider implementation
- Basic documentation and examples
- Test suite with comprehensive coverage
- Build configuration with TypeScript support
- Package configuration for npm publishing