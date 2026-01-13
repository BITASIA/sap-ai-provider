# Contributing to SAP AI Provider

We love your input! We want to make contributing to SAP AI Provider as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Table of Contents

- [Development Process](#development-process)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Architecture Guidelines](#architecture-guidelines)
- [Advanced: Detailed Developer Instructions](#advanced-detailed-developer-instructions)
- [Report Bugs](#report-bugs)
- [Request Features](#request-features)
- [License](#license)
- [Code of Conduct](#code-of-conduct)
- [Getting Help](#getting-help)
- [Recognition](#recognition)

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Git
- SAP AI Core service key (for testing with real API)

### Initial Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR-USERNAME/sap-ai-provider.git
   cd sap-ai-provider
   ```

2. **Install dependencies**

   ```bash
   npm install  # or npm ci if package-lock.json exists
   ```

3. **Set up environment variables** (optional, for testing)

   ```bash
   # Create .env file
   cp .env.example .env

   # Edit .env and add your AICORE_SERVICE_KEY
   ```

4. **Verify installation**
   ```bash
   npm run build
   npm test
   ```

### Development Workflow

Our development workflow follows these steps:

1. **Make your changes** in `/src` directory
   - Follow existing code style and patterns
   - Add JSDoc comments for public APIs
   - Keep components focused and single-purpose

2. **Run type checking**

   ```bash
   npm run type-check
   ```

3. **Run tests**

   ```bash
   npm test              # Run all tests
   npm run test:node     # Node.js environment
   npm run test:edge     # Edge runtime environment
   npm run test:watch    # Watch mode for development
   ```

4. **Check code formatting**

   ```bash
   npm run prettier-check  # Check formatting
   npm run prettier-fix    # Auto-fix formatting
   ```

5. **Lint your code**

   ```bash
   npm run lint           # Check for issues
   npm run lint-fix       # Auto-fix issues
   ```

6. **Build the library**

   ```bash
   npm run build
   npm run check-build    # Verify outputs
   ```

7. **Test with examples** (requires SAP credentials)
   ```bash
   npx tsx examples/example-generate-text.ts
   ```

### Pre-Commit Checklist

Before committing, ensure ALL of these pass:

```bash
npm run type-check && \
npm run test && \
npm run test:node && \
npm run test:edge && \
npm run prettier-check && \
npm run lint && \
npm run build && \
npm run check-build
```

This validation takes approximately 15 seconds and ensures CI will pass.

## Pull Request Process

1. **Update documentation** - Update README.md, API_REFERENCE.md, or other docs if you've changed the API
2. **Follow commit conventions** - Use [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `test:` for test additions/changes
   - `refactor:` for code refactoring
   - `chore:` for maintenance tasks
3. **Add tests** - All new features and bug fixes must include tests
4. **Request review** - The PR will be merged once you have the sign-off of at least one maintainer

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (x.0.0): Breaking changes
- **MINOR** (0.x.0): New features, backwards compatible
- **PATCH** (0.0.x): Bug fixes, backwards compatible

Version bumping is handled by maintainers during release process.

## Coding Standards

### TypeScript

- Use strict TypeScript configuration
- Prefer explicit types over `any`
- Add JSDoc comments to all public APIs
- Export types that are part of public API
- Use `zod` schemas for runtime validation

### Code Style

- 2 spaces for indentation (no tabs)
- Follow existing code patterns
- Use meaningful variable and function names
- Keep functions small and focused
- Avoid deep nesting (max 3 levels)

### Testing

- Write unit tests for all new functionality
- Test both Node.js and Edge runtime environments
- Use descriptive test names
- Cover error cases and edge cases
- Mock external dependencies appropriately

### Error Handling

- Use Vercel AI SDK standard errors (`APICallError`, `LoadAPIKeyError`)
- Provide clear, actionable error messages
- Include debugging context (request IDs, locations)
- Follow existing error patterns

### Documentation

- JSDoc comments for all public functions, classes, and interfaces
- Include `@example` blocks for complex APIs
- Update README.md for user-facing changes
- Update API_REFERENCE.md for API changes
- Keep documentation concise and precise
- **Run documentation verification before committing**: `npm run validate-docs`

#### Documentation Guidelines

When adding new features or changing APIs, follow these guidelines to maintain documentation quality:

**1. Single Source of Truth**

Each piece of information should have ONE authoritative location:

- **API details** → `API_REFERENCE.md`
- **Setup instructions** → `ENVIRONMENT_SETUP.md`
- **Error solutions** → `TROUBLESHOOTING.md`
- **Architecture decisions** → `ARCHITECTURE.md`
- **Breaking changes** → `MIGRATION_GUIDE.md`
- **Quick start** → `README.md` (with links to detailed docs)

**2. Avoid Duplication**

When referencing information from another doc, use links instead of copying:

```markdown
<!-- ❌ BAD: Duplicating content -->

To set up authentication, create a service key in SAP BTP...

<!-- ✅ GOOD: Linking to source of truth -->

See [Environment Setup Guide](./ENVIRONMENT_SETUP.md#authentication) for authentication setup.
```

**3. Update Checklist for New Features**

- [ ] Add to `API_REFERENCE.md` with TypeScript signatures and examples
- [ ] Update `README.md` if user-facing (keep concise, link to API_REFERENCE)
- [ ] Create example in `examples/` directory if significant feature
- [ ] Update `MIGRATION_GUIDE.md` if breaking change
- [ ] Run `npm run validate-docs` to check consistency
- [ ] Run `npm run build` to ensure TypeScript compiles

**4. Example Code Guidelines**

- Use relative imports (`../src/index`) for repo examples
- Add comment explaining production import path:
  ```typescript
  // NOTE: This example uses relative imports for local development
  // In your project, use: import { ... } from "@mymediset/sap-ai-provider"
  ```

**5. Documentation Verification**

Before submitting a PR, run:

```bash
npm run validate-docs  # Comprehensive documentation checks
npm run build         # Ensures TypeScript compiles
npm test             # Runs test suite
```

The `validate-docs` script checks:

- All public exports are documented in API_REFERENCE.md
- No broken internal markdown links
- No excessive hardcoded model lists
- Dotenv imports in code examples
- Link format consistency (./path vs path)
- Required documentation files exist
- Version consistency across docs

## Testing Guidelines

### Unit Tests

- Located in `*.test.ts` files alongside source
- Use Vitest as test framework
- Mock SAP AI SDK calls for offline testing
- Test both success and error paths

### Integration Tests

- Test actual integration with SAP AI SDK
- Require `AICORE_SERVICE_KEY` to run
- Can be skipped in CI if credentials not available

### Test Coverage

- Aim for >80% code coverage
- Focus on critical paths and error handling
- Don't test trivial getters/setters

## Architecture Guidelines

### Provider Integration

- Implement Vercel AI SDK interfaces correctly
- Follow the separation: provider factory → language model
- Maintain compatibility with Node.js and Edge runtimes
- Use existing authentication patterns

### Performance

- Streaming responses must be efficient
- Avoid blocking operations in request/response flow
- Consider memory usage for large responses
- Use caching where appropriate

### Security

- Never expose service keys or tokens in logs
- Validate all external inputs with zod schemas
- Follow secure credential handling patterns
- Check for injection vulnerabilities

## Advanced: Detailed Developer Instructions

For comprehensive developer workflow and best practices, see [`.github/copilot-instructions.md`](./.github/copilot-instructions.md). This file contains:

- Detailed build and test procedures
- CI/CD pipeline information
- Code review guidelines
- Troubleshooting common development issues

## Report Bugs

We use GitHub issues to track bugs. Report a bug by [opening a new issue](https://github.com/BITASIA/sap-ai-provider/issues/new?template=bug_report.md).

**Great Bug Reports** include:

- Quick summary and background
- Steps to reproduce (be specific!)
- Sample code if possible
- What you expected vs. what actually happened
- Notes on what you tried that didn't work

## Request Features

Request features by [opening a feature request](https://github.com/BITASIA/sap-ai-provider/issues/new?template=feature_report.md).

**Good Feature Requests** include:

- Clear description of the problem to solve
- Proposed solution with examples
- Alternatives you've considered
- Any additional context or screenshots

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on what's best for the community
- Show empathy towards others
- Accept constructive criticism gracefully

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Trolling, insulting, or derogatory remarks
- Publishing others' private information
- Other conduct inappropriate in a professional setting

## Getting Help

- 📖 Read the documentation: [README](./README.md), [API Reference](./API_REFERENCE.md)
- 💬 Ask questions in [GitHub Discussions](https://github.com/BITASIA/sap-ai-provider/discussions)
- 🐛 Report issues: [Issue Tracker](https://github.com/BITASIA/sap-ai-provider/issues)
- 👥 Join the community and share your experience

## Recognition

Contributors will be recognized in:

- GitHub contributors page
- Release notes for significant contributions
- Project README (for major features)

Thank you for contributing to SAP AI Provider! 🎉

---

This document was adapted from open-source contribution guidelines and is licensed under CC-BY-4.0.
