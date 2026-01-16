<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

<!-- markdownlint-disable MD025 -->

# AI Agent Instructions

<!-- markdownlint-enable MD025 -->

This file provides the entry point for AI coding assistants working with this codebase.

## Agent Instruction Files

### GitHub Copilot

See **`.github/copilot-instructions.md`** for comprehensive development instructions including:

- Project overview and architecture
- Build, test, and validation workflows
- Pull request review guidelines
- Coding standards and best practices

### Cursor

See **`.cursor/rules/`** directory for modular topic-specific rules:

- `ai-sdk-integration.mdc` - Vercel AI SDK patterns
- `build-and-publish.mdc` - Build and publish workflow
- `environment-and-config.mdc` - Environment and configuration
- `project-structure.mdc` - Project organization
- `testing.mdc` - Testing strategy
- `typescript-style.mdc` - TypeScript conventions
- `usage-and-examples.mdc` - Usage patterns

### OpenSpec Workflows

See **`openspec/AGENTS.md`** for spec-driven development instructions including:

- Creating change proposals
- Writing spec deltas
- Validation and archiving
- OpenSpec CLI commands

## For Human Developers

- **Project documentation:** [README.md](./README.md)
- **Contributing guidelines:** [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)
