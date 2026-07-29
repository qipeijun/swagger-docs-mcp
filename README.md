# swagger-docs-mcp

连接 AI Agent 与实时 API 文档的 MCP Server，让 AI 直接理解、检索并展开 Swagger / Knife4j 接口定义。

`swagger-docs-mcp` 面向需要读取后端接口文档的 AI Agent。它实时获取 Swagger 规范，将接口、参数和 Schema 转换为结构化结果，同时保持无状态、只读和来源可追溯。

## 特性

- **实时读取**：支持 Swagger JSON，以及 Knife4j / Springfox `doc.html` 文档发现。
- **多维检索**：可按分类、路径、HTTP Method、关键词或 Knife4j 深链接定位接口。
- **完整 Schema**：递归展开请求体和响应模型，同时提供字段树与扁平字段路径。
- **结果可追溯**：每次查询均返回文档入口、实际规范地址、获取时间和文档指纹。
- **边界明确**：不保存文档地址、不使用跨调用缓存、不调用业务接口，也不推测无法解析的字段。
- **多客户端支持**：提供 Codex、Claude Code、Gemini CLI 及主流 IDE Agent 的接入配置。

## 快速开始

运行环境要求 Node.js 20 或更高版本。

> 当前项目尚未发布到公共 npm Registry，以下步骤使用源码构建和本地接入模式。

### 构建

```bash
git clone https://github.com/qipeijun/swagger-docs-mcp.git
cd swagger-docs-mcp
npm ci
npm run build
```

### 接入 MCP 客户端

Codex、Claude Code 和 Gemini CLI 可自动安装并核验配置：

```bash
node dist/index.js setup codex --local
node dist/index.js setup claude --local
node dist/index.js setup gemini --local
```

IDE 类客户端使用同一个入口生成对应格式的配置：

```bash
node dist/index.js setup cursor --local
node dist/index.js setup vscode --local
node dist/index.js setup opencode --local
```

查看全部支持项：

```bash
node dist/index.js setup list
```

`--local` 使用当前仓库中 `dist/index.js` 的绝对路径。仓库移动后需要重新生成配置。

### 运行诊断

```bash
# 检查本机运行环境
node dist/index.js doctor

# 验证实时文档发现
node dist/index.js doctor http://127.0.0.1:8080/doc.html

# 验证指定分组
node dist/index.js doctor https://example.com/doc.html --group exact-group-name
```

## 客户端支持

| 名称 | 客户端 | 接入方式 |
| --- | --- | --- |
| `codex` | OpenAI Codex | 自动安装并核验 |
| `claude` | Claude Code | 自动安装并核验 |
| `gemini` | Gemini CLI | 自动安装并核验 |
| `vscode` | VS Code / GitHub Copilot | 生成 `servers` 配置 |
| `cursor` | Cursor | 生成 `mcpServers` 配置 |
| `windsurf` | Windsurf | 生成 `mcpServers` 配置 |
| `trae` | Trae | 生成 `mcpServers` 配置 |
| `cline` | Cline | 生成 `mcpServers` 配置 |
| `roo` | Roo Code | 生成 `mcpServers` 配置 |
| `kiro` | Kiro | 生成 `mcpServers` 配置 |
| `opencode` | OpenCode v2 | 生成 `mcp.servers` 配置 |

自动安装只调用客户端官方 CLI。配置生成模式仅输出 JSON，不读取或修改用户文件。发现同名但不同的 `swagger-docs` 配置时，CLI 会拒绝覆盖；确认后可使用 `--replace` 定向替换。

## 使用示例

在对话中同时提供文档地址和查询目标：

```text
列出 http://203.0.113.10:8080/doc.html 的所有接口分类。
```

```text
查询 http://203.0.113.10:8080/doc.html 的
/api/v1/study-exam-stat/baseline-class-stat POST，
展开完整的请求和响应字段。
```

```text
在 http://203.0.113.10:8080/doc.html 中搜索“成绩统计”。
```

也可以直接查询 Knife4j 深链接：

```text
查询接口：
http://203.0.113.10:8080/doc.html#/default/uniform-study-exam-stat-controller/getUniformStudyExamStatDetailUsingGET
```

示例地址 `203.0.113.10` 属于 IANA 保留地址，不对应真实服务。

## MCP Tools

| Tool | 说明 |
| --- | --- |
| `inspect_api_docs` | 识别文档入口或深链接，验证导航线索并返回下一步操作 |
| `list_api_categories` | 分页列出接口分类及接口数量 |
| `get_api_category` | 按精确分类名返回接口摘要或完整文档 |
| `get_api_by_path` | 按精确路径和可选 HTTP Method 返回完整接口文档 |
| `search_apis` | 搜索路径、摘要、描述、分类和 operationId |

所有 Tool 都要求显式传入 `docsUrl`。完整接口结果包括请求参数、请求体 Schema、响应状态，以及：

- `schemaTree`：保留模型层级的字段树。
- `flatFields`：便于检索和展示的扁平字段路径。
- `schemaReferences`：解析过程中引用的 Schema。
- `unresolvedDynamicFields`：无法静态展开的动态字段。
- `warnings`、`completeness`：解析边界与结果完整性。

### 查询流程

1. `inspect_api_docs` 实时检查文档入口和 Knife4j hash 线索。
2. 多分组文档返回候选分组，由用户精确选择；服务不会自动猜测。
3. 分类或接口不唯一时返回候选项；定位唯一接口后调用 `get_api_by_path`。
4. 后续调用继续携带原始 `docsUrl` 及已确认的 `group`、`path` 和 `method`。

Tool 返回的 `sourceNotice` 说明本次查询来源和缓存状态，Agent 应在最终回答中保留该信息。

## 支持范围

| 项目 | 状态 |
| --- | --- |
| Swagger 2.0 JSON | 支持 |
| Knife4j / Springfox 文档发现 | 支持 |
| Knife4j hash 深链接 | 支持 |
| OpenAPI 3.x | 暂不支持，返回明确的版本错误 |
| MCP 传输 | stdio |
| 文档协议 | HTTP、HTTPS |
| URL 内嵌认证信息 | 不支持 |
| 外部 `$ref` | 不读取，保留解析边界 |

## 安全边界

- 仅访问文档入口、同源发现接口和最终规范地址，不调用规范中描述的业务 API。
- 每次 Tool 调用都重新获取文档，不保存地址、选择状态或历史响应。
- 单次请求超时 10 秒，响应体最大 20 MB。
- 最多跟随 3 次同源重定向，拒绝跨主机重定向和跨主机发现地址。
- 拒绝包含用户名或密码的 URL，不读取外部 `$ref`。
- 动态字段、缺失引用、循环引用和最大深度均返回明确警告。
- 上游失败时返回错误阶段和请求地址，不使用历史文档降级。

## 开发

```bash
npm run dev               # 直接运行 TypeScript 入口
npm run typecheck         # 类型检查
npm test                  # 完整测试
npm run test:integration  # MCP 集成测试
npm run build             # 构建 dist
npm run check             # 类型检查、测试和构建
```

源码按职责分层：

| 目录 | 职责 |
| --- | --- |
| `src/source` | 安全 HTTP 获取与文档发现 |
| `src/navigation` | Knife4j hash 导航解析 |
| `src/parser` | 解析器公共契约 |
| `src/swagger2` | Swagger 2.0 解析实现 |
| `src/service` | 查询、分页与来源封装 |
| `src/server` | MCP Tool 契约 |
| `src/cli` | 诊断和客户端配置 |
| `src/domain` | 共享领域模型 |

新增规范版本时，可实现新的 `ApiSpecParser` 并复用现有 Service 和 MCP Tool 契约。

## License

[MIT](LICENSE)
