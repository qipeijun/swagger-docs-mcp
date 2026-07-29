# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

`swagger-docs-mcp` 是一个无状态、只读的 MCP 服务器，让 AI 代理能实时查询在线 Swagger 2.0 文档。支持从 `doc.html`（Knife4j/Springfox）和 Swagger JSON 直链两种入口发现文档，提供 5 个 Tool：`inspect_api_docs`、`list_api_categories`、`get_api_category`、`get_api_by_path`、`search_apis`。

核心设计约束：
- **每次 Tool 调用都必须显式传入 `docsUrl`**，服务不保存地址
- **不缓存文档内容**，每次调用实时获取
- **只读**：不调用业务 API，不通过 URL 认证，不读取外部 `$ref`
- **仅支持 Swagger 2.0**，OpenAPI 3 返回明确的不支持错误

## 常用命令

```bash
npm run check          # 类型检查 + 测试 + 构建（完整 CI 检查）
npm run build          # 编译到 dist/
npm test               # 运行所有单元测试
npm run test:watch     # 监听模式测试
npm run test:integration  # 仅运行 MCP 协议集成测试
npm run typecheck      # 仅类型检查（不构建）
npm run dev            # tsx 直接运行 src/index.ts
node dist/index.js doctor [docsUrl] [--group <name>]  # 诊断命令
```

`check` 是提交前必须通过的完整检查。`npm run dev` 用于本地 MCP stdio 模式调试。

## 架构分层

代码按稳定边界分层，依赖方向从底层到上层：

```
src/domain/types.ts     # 领域类型、枚举、接口（无依赖）
src/errors.ts           # 错误码、错误阶段、AppError（无依赖）
src/parser/types.ts     # 解析器抽象接口 ApiSpecParser
src/source/             # HTTP 安全获取 + 文档入口发现（SafeHttpClient → DocumentDiscoveryService）
src/navigation/         # Knife4j hash 线索解析（纯函数，不接触网络）
src/swagger2/           # Swagger 2.0 解析器实现 ApiSpecParser
src/service/            # 客户端无关的查询服务 ApiDocsService（编排层）
src/server/             # MCP Tool 注册，依赖 MCP SDK
src/cli/                # CLI 入口（serve/doctor/setup/remove），依赖 @modelcontextprotocol/sdk
src/index.ts            # 二进制入口
src/version.ts          # 从 package.json 读取版本号
```

**关键设计点：**
- `ApiSpecParser`（`src/parser/types.ts`）是解析器的可扩展接口。新增 OpenAPI 3 支持时只需新增实现类，无需改动 Tool 契约和上层代码。
- `ApiDocsService` 是核心编排层：接收 `docsUrl` + `group` → 调用 `DocumentDiscoveryService` 发现文档 → 匹配解析器 → 返回 `LoadedApiDocument`。所有 5 个 Tool 都通过它完成查询。
- `DocumentDiscoveryService` 按适配器模式组织：先用 `SafeHttpClient` 获取入口 URL，再交给合适的 `DocumentDiscoveryAdapter`（`RawJsonDiscoveryAdapter` 处理 JSON 直链，`SpringfoxDiscoveryAdapter` 处理 HTML 页面的 `swagger-resources` 发现）。
- `SchemaNode` → `FlatSchemaField` 的两层结构：`Swagger2SchemaAnalyzer.buildNode()` 构建树形 schema 含 `$ref` 递归解析、`allOf` 合并、`additionalProperties` 动态键；`flatten()` 再展平为可检索的 `flatFields`。同时标记 `unresolvedDynamicFields`、`recursionBoundary`、循环引用等解析边界。

## 错误处理

所有错误通过 `AppError` 统一包装，包含三个维度：
- `ErrorCode`（如 `INVALID_URL`、`GROUP_REQUIRED`、`UNSUPPORTED_SPEC_VERSION`）— 稳定错误码，MCP 客户端应据此判断
- `ErrorStage`（如 `validate_url`、`discover_spec`、`parse_spec`）— 错误发生阶段
- `details` 中包含上下文信息（候选项列表、nextAction 等）

`toAppError` 将未知错误统一转换为 `INVALID_DOCUMENT` + `PARSE_SPEC`。

## 测试结构

```
tests/fixtures/swagger2.ts    # Swagger 2.0 和 OpenAPI 3 mock 数据
tests/helpers/http-server.ts  # 测试用 HTTP 服务器工具
tests/api-docs-service.test.ts   # 服务层测试
tests/swagger2-parser.test.ts    # 解析器测试
tests/api-docs-navigation.test.ts # 导航/检查测试
tests/discovery.test.ts         # 文档发现测试
tests/url-navigation.test.ts    # Hash 解析测试
tests/client-setup.test.ts      # CLI setup 测试
tests/mcp-integration.test.ts   # MCP 协议集成测试
```

测试不依赖真实网络，使用本地 HTTP server（`tests/helpers/http-server.ts`）和 fixture 数据。

## 技术要点

- **TypeScript strict 模式**，启用 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`
- **ES Module**（`"type": "module"`），`moduleResolution: "NodeNext"`
- **MCP SDK** `@modelcontextprotocol/sdk` 用于 Tool 注册和 stdio 传输
- **Zod** 用于 MCP Tool 的 input schema 定义和参数校验
- **Vitest** 运行测试，配置在 `vitest.config.ts`
- 要求 **Node.js >= 20**

## CLI 用法

```
swagger-docs-mcp                          # 启动 stdio MCP 服务（默认）
swagger-docs-mcp serve                    # 同上
swagger-docs-mcp doctor [docsUrl]         # 环境诊断
swagger-docs-mcp setup list               # 列出支持的客户端
swagger-docs-mcp setup <client> [--replace] [--local]  # 安装到客户端
swagger-docs-mcp remove <client>          # 从客户端卸载
```

`setup` 对 Codex/Claude Code/Gemini CLI 调用官方 CLI 自动安装；对其他 IDE 客户端（Cursor、Windsurf 等）生成 JSON 配置，不写文件。
