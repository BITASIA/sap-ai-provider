# Project Context

## Purpose

This project provides a community-developed provider for SAP AI Core that
integrates seamlessly with the Vercel AI SDK. Built on top of the official
`@sap-ai-sdk/orchestration` package, it enables developers to use SAP's
enterprise-grade AI models (GPT-4, Claude, Gemini, Nova, Llama, etc.) through
the familiar Vercel AI SDK interface.

**Key Goals:**

- Simplify SAP AI Core integration with Vercel AI SDK
- Provide type-safe, production-ready AI provider implementation
- Support advanced features: tool calling, streaming, multi-modal inputs, data
  masking, content filtering
- Maintain compatibility with both Node.js and edge runtime environments

## Tech Stack

**Core Technologies:**

- **TypeScript** - Primary language (ES2022 target)
- **Node.js** - Runtime (18+ required)
- **ESM** - Module system (with CommonJS output)

**Build & Testing:**

- **tsup** - TypeScript bundler (dual ESM/CJS output)
- **vitest** - Unit testing framework with Node.js and Edge runtime configs
- **tsx** - TypeScript execution for examples

**Dependencies:**

- **@ai-sdk/provider** (^3.0.2) - Vercel AI SDK provider interfaces
- **@ai-sdk/provider-utils** (^4.0.5) - Vercel AI SDK utilities
- **@sap-ai-sdk/orchestration** (^2.5.0) - Official SAP AI SDK
- **zod** (^4.3.5) - Schema validation
- **zod-to-json-schema** (^3.25.1) - Tool schema conversion

**Tooling:**

- **ESLint** - Code linting (TypeScript ESLint)
- **Prettier** - Code formatting
- **dotenv** - Environment variable management

## Project Conventions

### Code Style

**Naming Conventions:**

- **Files**: kebab-case (e.g., `sap-ai-provider.ts`,
  `convert-to-sap-messages.ts`)
- **Classes**: PascalCase (e.g., `SAPAIProvider`, `SAPAILanguageModel`)
- **Functions**: camelCase (e.g., `createSAPAIProvider`, `convertToSAPMessages`)
- **Constants**: UPPER_SNAKE_CASE for true constants, camelCase for config
  objects
- **Types/Interfaces**: PascalCase with descriptive names (e.g.,
  `SAPAIProviderSettings`, `SAPAIModelId`)

**File Organization:**

- Co-locate test files: `*.test.ts` alongside implementation files
- All types defined in implementation files or `sap-ai-settings.ts`
- Examples in `examples/` directory with descriptive names

**Formatting:**

- Prettier enforced (run `npm run prettier-fix`)
- 2-space indentation
- Double quotes for strings (Prettier default)
- Trailing commas in multi-line structures
- 80-100 character line length (soft limit)

### Architecture Patterns

**Provider Pattern:**

- Factory function `createSAPAIProvider()` returns provider instance
- Default export `sapai` for quick start scenarios
- Provider implements Vercel AI SDK's `LanguageModelV3` interface
- Separation of concerns: provider → model → API client

**Error Handling:**

- Use Vercel AI SDK native error types (`APICallError`, `LoadAPIKeyError`, `NoSuchModelError`)
- Automatic retry logic for rate limits (429) and server errors (5xx)
- Detailed error metadata in `responseBody` with SAP-specific fields

**Configuration:**

- Environment-based config via `AICORE_SERVICE_KEY` or `VCAP_SERVICES`
- Cascading settings: provider defaults → model overrides → call-specific
- Type-safe configuration with Zod schemas

**Message Conversion:**

- Transform Vercel AI SDK messages to SAP AI Core format
- Filter out assistant `reasoning` parts by default (opt-in with
  `includeReasoning`)
- Support multi-modal content (text + images)
- Handle tool calls and tool results bidirectionally

### Testing Strategy

**Test Framework:**

- Vitest for all unit and integration tests
- Two test configurations:
  - `vitest.node.config.ts` - Node.js runtime tests
  - `vitest.edge.config.ts` - Edge runtime compatibility tests

**Test Organization:**

- Co-located tests: `*.test.ts` next to implementation
- Test file mirrors source file name
- Group tests by functionality using `describe` blocks

**Coverage:**

- Run `npm run test:coverage` for coverage reports
- Aim for high coverage on core provider logic
- Focus on critical paths: message conversion, error handling, API calls

**Test Commands:**

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:node     # Node.js tests only
npm run test:edge     # Edge runtime tests only
npm run test:coverage # With coverage report
```

**Test Patterns:**

- Mock SAP AI SDK responses where appropriate
- Test error scenarios explicitly
- Validate type safety in tests
- Include integration tests with real examples

### Git Workflow

**Branch Strategy:**

- `main` - Production-ready code
- Feature branches: `feature/description` or `add-feature-name`
- Bug fixes: `fix/description` or `fix-issue-name`

**Commit Conventions:**

- Use descriptive, imperative commit messages
- Reference issues/PRs when applicable
- Keep commits focused and atomic

**Pre-publish Checks:**

```bash
npm run prepublishOnly  # Runs before npm publish
# - type-check
# - lint
# - test
# - build
# - check-build
```

**Release Process:**

1. Update version in `package.json`
2. Run `npm run prepublishOnly` to validate
3. Create git tag: `v4.0.0` with appropriate version
4. Push to GitHub with tags
5. Publish to npm: `npm publish`

## Domain Context

**SAP AI Core Concepts:**

- **Resource Group**: Logical grouping of AI deployments (default: 'default')
- **Deployment ID**: Unique identifier for a model deployment
- **Service Key**: JSON credential containing authentication details
  (`AICORE_SERVICE_KEY`)
- **Orchestration Service**: SAP's LLM orchestration layer supporting multiple
  model providers

**Model Providers:**

- OpenAI (GPT-4, GPT-4o, o1, o3)
- Anthropic (Claude 3.5, Claude 4)
- Google (Gemini 2.0, 2.5)
- Amazon (Nova Pro, Nova Lite)
- Open source (Mistral, Llama)

**SAP-Specific Features:**

- **DPI (Data Privacy Integration)**: PII masking/anonymization
- **Content Filtering**: Azure Content Safety, Llama Guard
- **Grounding**: Document retrieval integration
- **Translation**: Multi-language support

**Tool Calling Limitations:**

- Gemini models: 1 tool per request maximum
- GPT-4o, Claude, Nova: Multi-tool support recommended

## Important Constraints

**Runtime Compatibility:**

- Must work in both Node.js (18+) and Edge runtimes
- No Node.js-specific APIs without fallbacks
- Test both environments explicitly

**SAP AI Core Limitations:**

- Model availability varies by tenant, region, subscription
- Rate limits enforced by SAP AI Core (auto-retry on 429)
- Authentication requires valid service key or VCAP binding

**Vercel AI SDK Integration:**

- Must implement `LanguageModelV3` interface completely
- Follow Vercel AI SDK conventions for errors, streaming, tools
- Maintain compatibility with AI SDK v6.0+

**Breaking Changes:**

- Major version bumps for API changes
- Deprecation warnings before removal
- Migration guides for all breaking changes

**Security:**

- Never log or expose `AICORE_SERVICE_KEY`
- Validate all external inputs
- Sanitize error messages to avoid credential leaks

## External Dependencies

**Primary Dependencies:**

- **Vercel AI SDK** (`ai` peer dependency)
  - Interface definitions: `@ai-sdk/provider`
  - Utilities: `@ai-sdk/provider-utils`
  - Documentation: <https://sdk.vercel.ai/>

- **SAP AI SDK** (`@sap-ai-sdk/orchestration`)
  - Official SAP Cloud SDK for AI Core
  - Handles authentication, API calls, credential management
  - Documentation: <https://sap.github.io/ai-sdk/>

**SAP AI Core API:**

- Orchestration endpoint: `https://<AI_API_URL>/v2/lm/deployments`
- Authentication: OAuth 2.0 with client credentials
- Regions: US10, EU10, others (tenant-dependent)

**Development Services:**

- **npm Registry**: Package distribution
- **GitHub**: Source control and issue tracking
- **TypeScript Compiler**: Type checking and declaration generation

**Environment Variables:**

- `AICORE_SERVICE_KEY` - SAP AI Core authentication (JSON)
- `VCAP_SERVICES` - SAP BTP service binding (alternative to service key)
- Optional: `DEPLOYMENT_ID`, `RESOURCE_GROUP` for overrides

**Testing Dependencies:**

- Vitest test runner
- Edge runtime VM for compatibility testing
- Coverage tools (v8)
