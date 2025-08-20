# SAP AI Provider for Vercel AI SDK

SAP AI Provider is a TypeScript/Node.js library that provides seamless integration between SAP AI Core and the Vercel AI SDK. It enables developers to use SAP's AI services through the standardized AI SDK interface.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

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
- **Linting**: `npm run lint` -- **CURRENTLY FAILS** due to missing eslint.config.js file. Do not use until fixed.

### Development Workflow
1. **Always run the bootstrap steps first**: `npm ci`
2. **Make your changes** to TypeScript files in `/src`
3. **Run type checking**: `npm run type-check`
4. **Run tests**: `npm run test`
5. **Check formatting**: `npm run prettier-check` (fix with `npm run prettier-fix` if needed)
6. **Build the library**: `npm run build`
7. **Verify build outputs**: `npm run check-build`

## Validation

### Pre-commit Requirements
- **ALWAYS run these commands before committing or the CI will fail**:
  - `npm run type-check`
  - `npm run test`
  - `npm run test:node`
  - `npm run test:edge`  
  - `npm run prettier-check`
  - `npm run build`
  - `npm run check-build`
- **Do NOT run `npm run lint`** until the ESLint configuration is fixed

### Manual Testing with Examples
- **Examples location**: `/examples` directory contains 4 example files
- **Running examples**: `npx tsx examples/example-simple-chat-completion.ts`
- **LIMITATION**: Examples require `SAP_AI_SERVICE_KEY` environment variable to work
- **Without service key**: Examples will fail with clear error message about missing environment variable
- **With service key**: Create `.env` file with `SAP_AI_SERVICE_KEY=<your-service-key-json>`

### Complete End-to-End Validation Scenario
Since full example testing requires SAP credentials, validate changes using this comprehensive approach:

1. **Install and setup**: `npm install` (or `npm ci` if lock file exists)
2. **Run all tests**: `npm run test && npm run test:node && npm run test:edge`
3. **Build successfully**: `npm run build && npm run check-build`
4. **Type check passes**: `npm run type-check`
5. **Formatting is correct**: `npm run prettier-check`
6. **Try running an example**: `npx tsx examples/example-simple-chat-completion.ts`
7. **Expected result**: Clear error message about missing `SAP_AI_SERVICE_KEY`

**Complete CI-like validation command:**
```bash
npm run type-check && npm run test && npm run test:node && npm run test:edge && npm run prettier-check && npm run build && npm run check-build
```
This should complete in under 15 seconds total and all commands should pass.

## Common Tasks

### Repository Structure
```
.
├── .github/               # GitHub Actions workflows and configs
├── examples/              # Example usage files (4 examples)
├── src/                   # TypeScript source code
│   ├── types/            # Type definitions
│   ├── index.ts          # Main exports
│   ├── sap-ai-provider.ts         # Main provider implementation
│   ├── sap-ai-chat-language-model.ts # Language model implementation
│   ├── sap-ai-chat-settings.ts   # Settings and model types
│   ├── sap-ai-error.ts           # Error handling
│   └── convert-to-sap-messages.ts # Message conversion utilities
├── dist/                  # Build outputs (gitignored)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── tsup.config.ts        # Build configuration
├── vitest.node.config.js # Node.js test configuration
├── vitest.edge.config.js # Edge runtime test configuration
└── README.md             # Project documentation
```

### Key Files to Understand
- **`src/index.ts`**: Main export file - start here to understand the public API
- **`src/sap-ai-provider.ts`**: Core provider implementation
- **`src/sap-ai-chat-language-model.ts`**: Main language model logic
- **`package.json`**: All available npm scripts and dependencies
- **`examples/`**: Working examples of how to use the library

### CI/CD Pipeline
- **GitHub Actions**: `.github/workflows/check-pr.yaml` runs on PRs and pushes
- **CI checks**: format-check, type-check, test (all environments), build, publish-check
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

# Complete validation (CI-like)
npm run type-check && npm run test && npm run test:node && npm run test:edge && npm run prettier-check && npm run build && npm run check-build
# Total time: ~15s

# Examples (requires SAP service key)
npx tsx examples/example-simple-chat-completion.ts
npx tsx examples/example-chat-completion-tool.ts
npx tsx examples/example-generate-text.ts  
npx tsx examples/example-image-recognition.ts
```

### Known Issues
- **ESLint**: The `npm run lint` command fails due to missing `eslint.config.js` configuration
- **Examples**: Cannot be fully tested without valid SAP AI service key credentials
- **Deprecation warning**: Vitest shows CJS Node API deprecation warning (non-blocking)

### Troubleshooting
- **Build fails**: Check TypeScript errors with `npm run type-check`
- **Tests fail**: Run `npm run test:watch` for detailed test output
- **Formatting issues**: Use `npm run prettier-fix` to auto-fix
- **Missing dependencies**: Delete `node_modules` and `package-lock.json`, then run `npm ci`
- **Example errors**: Verify `.env` file exists with valid `SAP_AI_SERVICE_KEY`