# swagger-docs-mcp

[简体中文](README.md) | **English** | [日本語](README.ja.md) | [한국어](README.ko.md)

[![npm version](https://img.shields.io/npm/v/swagger-docs-mcp?label=npm&color=CB3837)](https://www.npmjs.com/package/swagger-docs-mcp)
[![CI](https://github.com/qipeijun/swagger-docs-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/qipeijun/swagger-docs-mcp/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Swagger 2.0](https://img.shields.io/badge/Swagger-2.0-85EA2D?logo=swagger&logoColor=111)](#support-matrix)
[![MCP Server](https://img.shields.io/badge/MCP-Server-1B5E3C)](#mcp-tools)
[![License MIT](https://img.shields.io/badge/License-MIT-2F6FEB)](LICENSE)
[![Website](https://img.shields.io/badge/Website-Landing_Page-1B5E3C)](https://qipeijun.github.io/swagger-docs-mcp/?lang=en)

A read-only MCP server for Swagger 2.0 and Knife4j documentation that lets AI agents search and expand live API definitions.

`swagger-docs-mcp` is built for AI agents that need to read backend API documentation. It fetches Swagger 2.0 documents in real time and turns endpoints, parameters, and schemas into structured results while remaining stateless, read-only, and traceable to the source.

## Features

- **Live retrieval**: Supports Swagger JSON and Knife4j (Springfox) `doc.html` discovery.
- **Flexible search**: Locate APIs by category, path, HTTP method, keyword, or Knife4j deep link.
- **Structured schemas**: Recursively expands supported request and response models while preserving explicit boundaries for dynamic maps, cycles, missing references, and external references.
- **Traceable results**: Every query returns the documentation entry point, resolved specification URL, retrieval time, and document fingerprint.
- **Explicit boundaries**: Does not store documentation URLs, use cross-call caches, invoke business APIs, or infer fields it cannot resolve.
- **Multiple clients**: Generates setup configurations for Codex, Claude Code, Gemini CLI, and IDE-based agent clients.

## Quick Start

Node.js 20 or later is required. No global installation is needed.

### Connect an MCP client

[`swagger-docs-mcp`](https://www.npmjs.com/package/swagger-docs-mcp) is available on npm. Codex, Claude Code, and Gemini CLI write the configuration automatically and verify that the effective launch command matches the expected command:

```bash
npx --yes swagger-docs-mcp@latest setup codex
npx --yes swagger-docs-mcp@latest setup claude
npx --yes swagger-docs-mcp@latest setup gemini
```

IDE-based clients use the same entry point to generate their configuration format:

```bash
npx --yes swagger-docs-mcp@latest setup cursor
npx --yes swagger-docs-mcp@latest setup vscode
npx --yes swagger-docs-mcp@latest setup opencode
```

List every supported client:

```bash
npx --yes swagger-docs-mcp@latest setup list
```

Automatic setup pins the exact current package version in the client configuration so future launches are reproducible. To remove an older configuration created by this project:

```bash
npx --yes swagger-docs-mcp@latest remove claude
```

`upgrade` currently performs ownership and safety checks only. Official client CLIs do not provide a verifiable atomic replacement with full rollback, so the command stops when it finds an older version and requests a manual upgrade instead of deleting the existing configuration first.

### Ask an agent to set it up

Send the following task to an agent that can run local commands and edit files. It requires the agent to verify the client and configuration contract before installing, configuring, and validating the server so existing configuration is not overwritten:

```text
Install and configure swagger-docs-mcp in my current MCP client.

Requirements:
1. Confirm that Node.js is version 20 or later and identify the exact client name. Do not guess the client or its configuration format.
2. Run `npx --yes swagger-docs-mcp@latest setup list` and select the exact client ID from the output.
3. Run `npx --yes swagger-docs-mcp@latest setup <client>`.
4. If the command writes the configuration automatically, confirm that launch-command consistency verification passes explicitly.
5. If the command only prints JSON, first verify the official configuration file location and structure for the current client. Then merge the `swagger-docs` entry without changing other configuration, parse the result again, and verify the complete launch command.
6. Stop and explain the cause if there is a same-name entry, a permission error, a failed verification, or an unclear external contract. Do not overwrite, delete, or guess a repair.
7. Finally, run `npx --yes swagger-docs-mcp@latest doctor` and report the client ID, command, modified location, and verification result.

Do not save Swagger documentation URLs, passwords, or tokens, and do not modify unrelated MCP configuration.
```

### Run diagnostics

```bash
# Check the local runtime
npx --yes swagger-docs-mcp@latest doctor

# Verify live documentation discovery
npx --yes swagger-docs-mcp@latest doctor http://127.0.0.1:8080/doc.html

# Verify a specific group
npx --yes swagger-docs-mcp@latest doctor https://example.com/doc.html --group exact-group-name

# Emit JSON for CI or scripts
npx --yes swagger-docs-mcp@latest doctor https://example.com/doc.html --json
```

## Supported Clients

| ID | Client | Setup mode |
| --- | --- | --- |
| `codex` | OpenAI Codex | Writes configuration and verifies launch-command consistency |
| `claude` | Claude Code | Writes configuration and verifies launch-command consistency |
| `gemini` | Gemini CLI | Writes configuration and verifies launch-command consistency |
| `vscode` | VS Code / GitHub Copilot | Generates a `servers` configuration |
| `cursor` | Cursor | Generates an `mcpServers` configuration |
| `windsurf` | Windsurf | Generates an `mcpServers` configuration |
| `trae` | Trae | Generates an `mcpServers` configuration |
| `cline` | Cline | Generates an `mcpServers` configuration |
| `roo` | Roo Code | Generates an `mcpServers` configuration |
| `kiro` | Kiro | Generates an `mcpServers` configuration |
| `opencode` | OpenCode v2 | Generates an `mcp.servers` configuration |

Automatic setup only invokes official client CLIs. Probe commands run in the system temporary directory with a 15-second timeout. Configuration-generation mode prints JSON only and does not read or modify user files. `setup` refuses to overwrite any same-name entry. npm aliases, extra launch arguments, and unparseable configurations are treated as external configuration. A failed add or verification is never cleaned up by service name because that could delete a concurrent write; the CLI asks the user to inspect it manually. Removal verifies the launch command again before execution and confirms that the same-name entry is gone afterward.

"Generates a configuration" means the project emits a template based on the client's public configuration structure. It does not mean every version of every client has been runtime-tested. If a client changes its configuration format, use its official documentation and open a compatibility issue.

## Usage Examples

Provide both the documentation URL and the query target in the conversation:

```text
List all API categories from http://203.0.113.10:8080/doc.html.
```

```text
Get POST /api/v1/study-exam-stat/baseline-class-stat from
http://203.0.113.10:8080/doc.html and expand every request and response field.
```

```text
Search http://203.0.113.10:8080/doc.html for "score statistics".
```

You can also query a Knife4j deep link directly:

```text
Inspect this API:
http://203.0.113.10:8080/doc.html#/default/uniform-study-exam-stat-controller/getUniformStudyExamStatDetailUsingGET
```

The example address `203.0.113.10` is reserved by IANA and does not point to a real service.

### Continue development and debugging with the primary agent

`swagger-docs-mcp` reads and validates the live API documentation and returns tool results directly to the current primary agent. The agent can then inspect project code, complete the integration, and run tests without manually copying request and response fields:

```text
Debug the current feature against this API documentation:

http://203.0.113.10:8080/doc.html#/default/uniform-study-exam-stat-controller/getUniformStudyExamStatDetailUsingGET

Requirements:
1. Query and verify the API with swagger-docs-mcp first. Do not guess fields.
2. Verify the request method, path, required parameters, request body, and response fields.
3. Inspect the project's existing API wrapper, call sites, and page state.
4. Fix or complete the integration using existing project patterns. Do not add speculative compatibility branches.
5. Run the necessary tests or page diagnostics and report the documentation source and actual verification results.
```

The primary agent also needs access to the target code, a terminal or browser debugging environment, and any network or login state required by the test environment. This MCP server only reads documentation and never calls the business APIs described by Swagger; those requests remain the responsibility of the project runtime or the primary agent's debugging tools.

## MCP Tools

| Tool | Description |
| --- | --- |
| `inspect_api_docs` | Identifies a documentation entry point or deep link, validates navigation clues, and returns the next action |
| `list_api_categories` | Lists API categories and operation counts with pagination |
| `get_api_category` | Returns summaries or complete documentation for an exact category name |
| `get_api_by_path` | Returns complete API documentation for an exact path and optional HTTP method |
| `search_apis` | Searches paths, summaries, descriptions, categories, and operation IDs |

Every tool requires an explicit `docsUrl` and declares an `outputSchema`. Successful results consistently contain `source`, `sourceNotice`, `data`, `warnings`, and `completeness`. Error results use `isError: true` and include a stable error code and failure stage. API details contain request parameters, request-body schemas, response statuses, and:

- `schemaTree`: A field tree that preserves model hierarchy.
- `flatFields`: Flattened field paths for search and display.
- `schemaReferences`: Schemas referenced during resolution.
- `unresolvedDynamicFields`: Dynamic fields that cannot be expanded statically.
- `warnings` and `completeness`: Parsing boundaries and result completeness.

### Query flow

1. `inspect_api_docs` checks the documentation entry point and Knife4j hash clues in real time.
2. Multi-group documentation returns candidate groups for an exact user choice; the server never guesses.
3. Ambiguous categories or operations return candidates; once an operation is unique, call `get_api_by_path`.
4. Continue passing the original `docsUrl` and confirmed `group`, `path`, and `method` in subsequent calls.

The `sourceNotice` describes the source and cache state for that query. Agents should preserve it in their final response.

## Support Matrix

| Capability | Status |
| --- | --- |
| Swagger 2.0 JSON | Supported |
| Knife4j / Springfox discovery | Supported |
| Knife4j hash deep links | Supported |
| OpenAPI 3.x | Not supported yet; returns an explicit version error |
| MCP transport | stdio |
| Documentation protocols | HTTP and HTTPS |
| Embedded URL credentials | Not supported |
| External `$ref` | Not fetched; the parsing boundary is preserved |
| Top-level parameter / response local `$ref` | Supported; missing references are marked partially complete |
| Schema local `$ref`, arrays, and `allOf` | Recursively expanded |
| Dynamic maps, cycles, and maximum depth | Boundary preserved and marked partially complete |

## Security Boundaries

- Accesses only the documentation entry point explicitly provided by the user and same-origin discovery URLs. It does not call business APIs described by the specification.
- Fetches documentation again for every tool call and does not store URLs, selection state, or historical responses.
- Uses a 10-second request timeout and a 20 MB maximum response body.
- Follows at most three same-origin redirects and rejects cross-host redirects and discovery URLs.
- Rejects URLs containing a username or password and does not fetch external `$ref` values.
- Returns explicit warnings for dynamic fields, missing references, cycles, and maximum-depth boundaries.
- Returns the failure stage and request URL when an upstream request fails; it never falls back to historical documentation.
- Returns the documentation URL for traceability. Do not put passwords or tokens in URL query parameters.

By default, the process can access reachable public, private-network, and localhost HTTP(S) addresses, so this tool is not an SSRF isolation proxy. Configure an exact origin allowlist when handling untrusted URLs:

```bash
SWAGGER_DOCS_ALLOWED_ORIGINS=https://api.example.com,http://127.0.0.1:8080 \
  npx --yes swagger-docs-mcp@latest
```

See [SECURITY.md](SECURITY.md) for the complete trust boundary and vulnerability reporting policy.

## Development

```bash
npm run dev               # Run the TypeScript entry point directly
npm run typecheck         # Type-check the project
npm test                  # Run the complete test suite
npm run test:integration  # Run MCP integration tests
npm run build             # Build dist
npm run check             # Type-check, test, and build
```

After building, connect a client to local source with `node dist/index.js setup <client> --local`. `--local` writes the absolute path to this repository's `dist/index.js`; regenerate the configuration after moving the repository.

Source code is organized by responsibility:

| Directory | Responsibility |
| --- | --- |
| `src/source` | Safe HTTP fetching and documentation discovery |
| `src/navigation` | Knife4j hash navigation parsing |
| `src/parser` | Shared parser contracts |
| `src/swagger2` | Swagger 2.0 parser implementation |
| `src/service` | Query, pagination, and source metadata |
| `src/server` | MCP tool contracts |
| `src/cli` | Diagnostics and client configuration |
| `src/domain` | Shared domain models |

To add a specification version, implement a new `ApiSpecParser` and reuse the existing service and MCP tool contracts.

### JavaScript / TypeScript API

The npm root export has no CLI side effects. It exposes `createMcpServer`, `ApiDocsService`, `Swagger2Parser`, `SafeHttpClient`, and domain types. Internal `dist` paths that are not exported from the root are outside the semantic-versioning compatibility contract.

```ts
import { ApiDocsService } from "swagger-docs-mcp";

const service = new ApiDocsService();
const result = await service.listCategories("https://api.example.com/v2/api-docs", undefined, 1, 20);
```

## Release

1. Update the version and [CHANGELOG.md](CHANGELOG.md), then run `npm run check` and `npm pack --dry-run`.
2. Confirm that the npm Trusted Publisher still targets this repository's `publish.yml` and that the GitHub `npm` environment protection and publish permissions match the intended policy. These are one-time settings and only need documentation changes when their contract changes.
3. Create a `vX.Y.Z` GitHub Release matching `package.json`. The workflow reruns the release gates and publishes through OIDC with provenance.

`prepublishOnly` enforces type checking, the complete test suite, and a build for manual `npm publish`. During the `0.x` phase, experimental capabilities may change in a minor release; the project will publish `1.0.0` after the public contract is stable.

## License

[MIT](LICENSE)
