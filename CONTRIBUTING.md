# Contributing to SAP AI Provider

We love your input! We want to make contributing to SAP AI Provider as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Pull Request Process

1. Update the README.md with details of changes to the interface, if applicable
2. Update relevant documentation files (API_REFERENCE.md, ARCHITECTURE.md, etc.)
3. Ensure commit messages clearly describe changes; we recommend using [Conventional Commits](https://www.conventionalcommits.org/)
4. Version bumping is typically handled by maintainers following [Semantic Versioning](https://semver.org/):
   - **MAJOR** (x.0.0): Breaking changes
   - **MINOR** (0.x.0): New features, backwards compatible
   - **PATCH** (0.0.x): Bug fixes, backwards compatible
5. The PR will be merged once you have the sign-off of at least one maintainer

## Any Contributions You Make Will Be Under the Apache License 2.0

In short, when you submit code changes, your submissions are understood to be under the same [Apache License 2.0](./LICENSE.md) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report Bugs Using GitHub's [Issue Tracker](https://github.com/BITASIA/sap-ai-provider/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/BITASIA/sap-ai-provider/issues/new); it's that easy!

## Write Bug Reports with Detail, Background, and Sample Code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Set up your `.env` file with `AICORE_SERVICE_KEY`
4. Run tests: `npm test`
5. Run examples: `npx tsx examples/example-generate-text.ts`

## Use a Consistent Coding Style

- 2 spaces for indentation rather than tabs
- Follow the existing code style
- Run `npm run lint` for style checks
- Run `npm run prettier-fix` to auto-format code
- TypeScript strict mode is enabled

## License

By contributing, you agree that your contributions will be licensed under its Apache License 2.0.

## References

- [GitHub Copilot Instructions](.github/copilot-instructions.md) - Development workflow guide and best practices for contributors
- This document was adapted from the open-source contribution guidelines for [Facebook's Draft](https://github.com/facebook/draft-js/blob/a9316a723f9e918afde44dea68b5f9f39b7d9b00/CONTRIBUTING.md).
