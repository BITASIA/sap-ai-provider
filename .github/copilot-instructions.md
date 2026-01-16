# SAP AI Provider for Vercel AI SDK

SAP AI Provider is a TypeScript/Node.js library that provides seamless integration between SAP AI Core and the Vercel AI SDK. It enables developers to use SAP's AI services through the standardized AI SDK interface.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Table of Contents

- [Working Effectively](#working-effectively)
- [Validation](#validation)
- [Common Tasks](#common-tasks)
- [Pull Request Review Guidelines](#pull-request-review-guidelines)

## Working Effectively

### Bootstrap and Install Dependencies

- **Prerequisites**: Node.js 18+ and npm are required
- **Fresh install**: `npm install` -- takes ~25 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
  - Use `npm install` when no package-lock.json exists (fresh clone)
  - This automatically triggers the build via the prepare script
  - Creates `dist/` directory with built artifacts
- **Existing install**: `npm ci` -- takes ~15 seconds. NEVER CANCEL. Set timeout to 30+ seconds.
  - Use when package-lock.json already exists
  - Faster than `npm install` for CI/existing setups

### Building

- **Build the library**: `npm run build` -- takes ~3 seconds. Set timeout to 15+ seconds.
  - Uses tsup to create CommonJS, ESM, and TypeScript declaration files
  - Outputs to `dist/` directory: `index.js`, `index.mjs`, `index.d.ts`, `index.d.mts`
- **Check build outputs**: `npm run check-build` -- takes <1 second. Set timeout to 10+ seconds.
  - Verifies all expected files exist and lists directory contents

### Testing

- **Run all tests**: `npm run test` -- takes ~1 second. Set timeout to 15+ seconds.
- **Run Node.js specific tests**: `npm run test:node` -- takes ~1 second. Set timeout to 15+ seconds.
- **Run Edge runtime tests**: `npm run test:edge` -- takes ~1 second. Set timeout to 15+ seconds.
- **Watch mode for development**: `npm run test:watch`

### Type Checking and Linting

- **Type checking**: `npm run type-check` -- takes ~2 seconds. Set timeout to 15+ seconds.
- **Prettier formatting check**: `npm run prettier-check` -- takes ~1 second. Set timeout to 10+ seconds.
- **Auto-fix formatting**: `npm run prettier-fix`
- **Linting**: `npm run lint` -- takes ~1 second. Set timeout to 15+ seconds.
- **Auto-fix linting issues**: `npm run lint-fix`

### Development Workflow

**For comprehensive workflow and standards**, see [CONTRIBUTING.md](../CONTRIBUTING.md#development-workflow)

**Quick workflow summary:**

1. **Bootstrap**: `npm ci` (always first)
2. **Make changes** in `/src`
3. **Validate**: `npm run type-check && npm run test && npm run prettier-check`
4. **Build**: `npm run build && npm run check-build`

## Validation

### Pre-commit Requirements

**ALWAYS run this command before committing (CI will fail otherwise):**

```bash
npm run type-check && npm run test && npm run test:node && npm run test:edge && npm run prettier-check && npm run lint && npm run build && npm run check-build
```

**Detailed checklist and standards**: See [CONTRIBUTING.md - Pre-Commit Checklist](../CONTRIBUTING.md#pre-commit-checklist)

### Manual Testing with Examples

**For environment setup and authentication**, see [ENVIRONMENT_SETUP.md](../ENVIRONMENT_SETUP.md)

- **Examples location**: `/examples` directory contains 6 example files
- **Running examples**: `npx tsx examples/example-simple-chat-completion.ts`
  ⚠️ **Important:** Examples require `AICORE_SERVICE_KEY` environment variable to work
- **Without service key**: Examples will fail with clear error message about missing environment variable
- **With service key**: Create `.env` file with `AICORE_SERVICE_KEY=<your-service-key-json>`

### Complete End-to-End Validation Scenario

Since full example testing requires SAP credentials, validate changes using this comprehensive approach:

1. **Install and setup**: `npm install` (or `npm ci` if lock file exists)
2. **Run all tests**: `npm run test && npm run test:node && npm run test:edge`
3. **Build successfully**: `npm run build && npm run check-build`
4. **Type check passes**: `npm run type-check`
5. **Formatting is correct**: `npm run prettier-check`
6. **Try running an example**: `npx tsx examples/example-simple-chat-completion.ts`
7. **Expected result**: Clear error message about missing `AICORE_SERVICE_KEY`

**Complete CI-like validation command:**

```bash
npm run type-check && npm run test && npm run test:node && npm run test:edge && npm run prettier-check && npm run lint && npm run build && npm run check-build
```

This should complete in under 15 seconds total and all commands should pass.

## Common Tasks

### Repository Structure

```
.
├── .github/               # GitHub Actions workflows and configs
├── examples/              # Example usage files (8 examples)
├── src/                   # TypeScript source code
│   ├── index.ts                    # Main exports
│   ├── sap-ai-provider.ts          # Main provider implementation
│   ├── sap-ai-language-model.ts    # Language model implementation
│   ├── sap-ai-settings.ts          # Settings and model types
│   ├── sap-ai-error.ts             # Error handling
│   └── convert-to-sap-messages.ts  # Message conversion utilities
├── dist/                  # Build outputs (gitignored)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── tsup.config.ts        # Build configuration
├── vitest.node.config.js # Node.js test configuration
├── vitest.edge.config.js # Edge runtime test configuration
├── README.md             # Getting started and usage guide
├── API_REFERENCE.md      # Complete API documentation
├── ARCHITECTURE.md       # Technical architecture and design
├── CONTRIBUTING.md       # Contribution guidelines and standards
├── ENVIRONMENT_SETUP.md  # Authentication and environment configuration
├── TROUBLESHOOTING.md    # Common issues and solutions
├── MIGRATION_GUIDE.md    # Version migration instructions
├── CURL_API_TESTING_GUIDE.md # Direct SAP AI Core API testing
└── AGENTS.md             # AI agent instructions
```

### Key Files to Understand

**Core Source Code:**

- **`src/index.ts`**: Main export file - start here to understand the public API
- **`src/sap-ai-provider.ts`**: Core provider implementation
- **`src/sap-ai-language-model.ts`**: Main language model logic
- **`package.json`**: All available npm scripts and dependencies
- **`examples/`**: Working examples of how to use the library

**Documentation:**

- **`README.md`**: Quick start guide and basic usage
- **`API_REFERENCE.md`**: Complete API documentation with all exports, types, and models
- **`ARCHITECTURE.md`**: System architecture and design decisions
- **`CONTRIBUTING.md`**: Development workflow, coding standards, and guidelines
- **`ENVIRONMENT_SETUP.md`**: Authentication setup and SAP AI Core configuration
- **`TROUBLESHOOTING.md`**: Common problems and their solutions
- **`MIGRATION_GUIDE.md`**: Version migration instructions (v1.x → v2.x → v3.x → v4.x)
- **`CURL_API_TESTING_GUIDE.md`**: Direct API testing without the SDK

### CI/CD Pipeline

- **GitHub Actions**: `.github/workflows/check-pr.yaml` runs on PRs and pushes
- **CI checks**: format-check, type-check, test, build, publish-check
- **Publishing**: `.github/workflows/npm-publish-npm-packages.yml` publishes on releases
- **Build matrix**: Tests run in both Node.js and Edge runtime environments

### Package Dependencies

- **Runtime**: `@ai-sdk/provider`, `@ai-sdk/provider-utils`, `zod`
- **Peer**: `ai` (Vercel AI SDK), `zod`
- **Dev**: TypeScript, Vitest, tsup, ESLint, Prettier, dotenv
- **Node requirement**: Node.js 18+

### Common Commands Quick Reference

```bash
# Fresh setup (no package-lock.json)
npm install               # ~25s - Install deps + auto-build
# or existing setup (with package-lock.json)
npm ci                    # ~15s - Clean install + auto-build

# Development
npm run type-check        # ~2s - TypeScript validation
npm run test             # ~1s - Run all tests
npm run test:node        # ~1s - Node.js environment tests
npm run test:edge        # ~1s - Edge runtime tests
npm run build            # ~3s - Build library
npm run check-build      # <1s - Verify build outputs
npm run prettier-check   # ~1s - Check formatting

# Complete validation
npm run type-check && npm run test && npm run test:node && npm run test:edge && npm run prettier-check && npm run lint && npm run build && npm run check-build
# Total time: ~16s

# Examples (requires SAP service key)
npx tsx examples/example-generate-text.ts
npx tsx examples/example-simple-chat-completion.ts
npx tsx examples/example-streaming-chat.ts
npx tsx examples/example-chat-completion-tool.ts
npx tsx examples/example-image-recognition.ts
npx tsx examples/example-data-masking.ts
npx tsx examples/example-document-grounding.ts
npx tsx examples/example-translation.ts
```

### Known Issues

- **Examples**: Cannot be fully tested without valid SAP AI service key credentials
- **Deprecation warning**: Vitest shows CJS Node API deprecation warning (non-blocking)

### Troubleshooting

**For comprehensive troubleshooting guide**, see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)

**Quick fixes:**

- **Build fails**: Check TypeScript errors with `npm run type-check`
- **Tests fail**: Run `npm run test:watch` for detailed test output
- **Formatting issues**: Use `npm run prettier-fix` to auto-fix
- **Missing dependencies**: Delete `node_modules` and `package-lock.json`, then run `npm ci`
- **Example errors**: Verify `.env` file exists with valid `AICORE_SERVICE_KEY`

## Pull Request Review Guidelines

**For complete coding standards and contribution process**, see [CONTRIBUTING.md](../CONTRIBUTING.md)

When acting as a PR reviewer, you must first thoroughly analyze and understand the entire codebase before providing any reviews. Follow this comprehensive review process:

### Pre-Review Codebase Analysis

**ALWAYS start by understanding the codebase:**

1. **Read core architecture and guidelines**:
   - `ARCHITECTURE.md` - System design and component interactions
   - `README.md` - Quick start and usage patterns
   - `CONTRIBUTING.md` - Development workflow and coding standards
   - `API_REFERENCE.md` - Complete API documentation
2. **Understand the API surface**: Start with `src/index.ts` to see public exports
3. **Study key components**: Review `src/sap-ai-provider.ts` and `src/sap-ai-language-model.ts`
4. **Check existing patterns**: Look at test files (`*.test.ts`) to understand testing patterns
5. **Review examples**: Check `/examples` directory for usage patterns
6. **Understand build/test setup**: Check `package.json`, `tsconfig.json`, and config files

### Coding Standards Enforcement

**For complete coding standards**, see [CONTRIBUTING.md - Coding Standards](../CONTRIBUTING.md#coding-standards)

**Key requirements:**

- Strict TypeScript with JSDoc for all public APIs
- Follow Prettier/ESLint configuration (`npm run prettier-check && npm run lint`)
- Use Vercel AI SDK standard errors with clear messages
- Update documentation (README.md, API_REFERENCE.md) for API changes

### Architecture and Design Compliance

**For complete architecture guidelines**, see [CONTRIBUTING.md - Architecture Guidelines](../CONTRIBUTING.md#architecture-guidelines)

**Key patterns to follow:**

- Implement Vercel AI SDK interfaces correctly (`ProviderV2`, etc.)
- Maintain Node.js and Edge runtime compatibility
- Keep components focused and single-purpose
- Follow existing authentication and caching patterns

### Testing Requirements

**For complete testing guidelines**, see [CONTRIBUTING.md - Testing Guidelines](../CONTRIBUTING.md#testing-guidelines)

**Essential checks:**

- Tests must pass in both Node.js (`npm run test:node`) and Edge (`npm run test:edge`)
- Use existing Vitest patterns and mocking utilities
- Cover error conditions and edge cases
- Test files mirror source file structure

### Security Review

**Credential Handling:**

- Never expose service keys or tokens in logs/errors
- Follow existing patterns for secure credential management
- Validate all external inputs using zod schemas
- Check for potential injection vulnerabilities

**API Security:**

- Ensure proper authentication headers are required
- Validate response data structure before processing
- Handle network errors gracefully
- Follow existing security patterns

### Pre-Commit Validation Checklist

Before approving any PR, verify ALL of these pass:

```bash
npm run type-check &&
npm run test &&
npm run test:node &&
npm run test:edge &&
npm run prettier-check &&
npm run lint &&
npm run build &&
npm run check-build
```

**Documentation Checks:**

- [ ] JSDoc comments added/updated for public APIs
- [ ] README.md updated if public API changed
- [ ] Examples still work (verify error handling if no SAP credentials)

**Code Quality Checks:**

- [ ] Follows existing TypeScript patterns and strictness
- [ ] Proper error handling with meaningful messages
- [ ] Tests cover new functionality and edge cases
- [ ] No breaking changes to existing APIs
- [ ] Performance impact considered for new features

**Integration Checks:**

- [ ] Compatible with Vercel AI SDK patterns
- [ ] Works in both Node.js and Edge runtime environments
- [ ] Maintains backward compatibility
- [ ] Example applications still demonstrate correct usage

### Review Tone and Approach

**Be Constructive:**

- Explain the "why" behind requested changes
- Reference existing code patterns as examples
- Suggest specific improvements rather than just pointing out issues
- Acknowledge good practices when you see them

**Be Thorough:**

- Check for consistency with existing codebase patterns
- Verify that changes align with architecture decisions
- Look for potential side effects of changes
- Consider maintainability and future extensibility

**Be Educational:**

- Share knowledge about best practices
- Point to relevant documentation or examples
- Help contributors understand the project's standards
- Suggest resources for learning when appropriate
