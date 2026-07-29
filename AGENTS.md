# Repository Guidelines

## Project Structure & Module Organization

Source code lives in `src/` and is organized by responsibility. `source/` handles safe HTTP fetching and document discovery; `navigation/` parses Knife4j links; `parser/` defines parser contracts; `swagger2/` implements Swagger 2.0 parsing; `service/` contains client-independent query logic; `server/` exposes MCP tools; and `cli/` implements setup and diagnostic commands. Shared domain models are in `src/domain/`. Tests mirror these concerns under `tests/`, with reusable data in `tests/fixtures/` and HTTP helpers in `tests/helpers/`. Compiled output belongs in `dist/` and must not be edited or committed.

## Build, Test, and Development Commands

- `npm ci`: install the exact dependencies recorded in `package-lock.json`.
- `npm run dev`: run the TypeScript entry point directly with `tsx`.
- `npm run typecheck`: check strict TypeScript constraints without emitting files.
- `npm test`: run the complete Vitest suite once.
- `npm run test:integration`: run only the MCP integration test.
- `npm run build`: compile production ESM and declarations into `dist/`.
- `npm run check`: run type checking, all tests, and the production build; use this before a pull request. A full build is not required for every small documentation-only change.

Node.js 20 or newer is required. After building, run `node dist/index.js doctor <docs-url>` for a live smoke test.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, double quotes, semicolons, and `.js` extensions in relative ESM imports. Use `camelCase` for functions and variables, `PascalCase` for types and enums, and uppercase enum members. Add concise comments for status enums, non-obvious business rules, and public helper contracts. Do not add speculative compatibility fallbacks; ask when an external contract is unclear. No formatter or linter is currently configured, so follow nearby code and rely on `npm run typecheck`.

## Testing Guidelines

Vitest runs in the Node environment. Name files `tests/<feature>.test.ts` and use behavior-focused test descriptions. Add focused unit tests for parsing and navigation changes, plus integration coverage when MCP tool contracts or process I/O change. Include failure, ambiguity, and boundary cases; never depend on a private live Swagger service in automated tests.

## Commit & Pull Request Guidelines

Follow the existing Chinese Conventional Commit style, for example `feat: 新增 OpenAPI 3 解析器` or `fix: 修正文档分组发现逻辑`. Keep each commit focused. Pull requests should explain the problem, implementation, verification commands, and any MCP contract or security impact. Link related issues and include terminal output or screenshots only when they clarify user-visible CLI behavior.
