# AI Agent Instructions

This file provides instructions for AI coding assistants (GitHub Copilot, Cursor, etc.) working with this codebase.

## Purpose

AI agents should follow the project-specific guidelines and conventions documented in:

- `.github/copilot-instructions.md` - Primary instructions for GitHub Copilot
- `.cursor/rules/` - Cursor-specific rules organized by topic

## Usage

When an AI agent encounters this file, it should:

1. Read and follow the instructions in `.github/copilot-instructions.md`
2. Review relevant Cursor rules in `.cursor/rules/` for additional context
3. Strictly adhere to the project's coding standards, testing requirements, and architectural patterns

## Agent Instruction Files

### GitHub Copilot

Primary instruction file: `.github/copilot-instructions.md`

Key topics covered:

- Project overview and architecture
- Build and test procedures
- Example usage and validation
- TypeScript and Node.js patterns
- Provider integration specifics

### Cursor Rules

Directory: `.cursor/rules/`

Available rule sets:

- `usage-and-examples.mdc` - Code examples and usage patterns
- `build-and-publish.mdc` - Build pipeline and publishing workflow
- `testing.mdc` - Testing strategy and requirements
- `project-structure.mdc` - Codebase organization
- `typescript-style.mdc` - TypeScript coding conventions
- `environment-and-config.mdc` - Environment variables and configuration
- `ai-sdk-integration.mdc` - Vercel AI SDK integration patterns

## For Human Developers

If you're a human developer reading this file:

- These instructions are optimized for AI coding assistants
- For project documentation, see [README.md](./README.md)
- For development guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md)
- For architecture details, see [ARCHITECTURE.md](./ARCHITECTURE.md)
