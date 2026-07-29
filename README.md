# swagger-docs-mcp

连接 AI Agent 与实时 API 文档的 MCP Server，让 AI 直接理解、检索并展开 Swagger / Knife4j 接口定义。

`swagger-docs-mcp` 面向需要读取后端接口文档的 AI Agent。它实时获取 Swagger 规范，将接口、参数和 Schema 转换为结构化结果，同时保持无状态、只读和来源可追溯。

## 特性

- **实时读取**：支持 Swagger JSON，以及 Knife4j / Springfox `doc.html` 文档发现。
- **多维检索**：可按分类、路径、HTTP Method、关键词或 Knife4j 深链接定位接口。
- **结构化 Schema**：递归展开受支持的请求体和响应模型，同时对动态 Map、循环、缺失引用和外部引用保留明确边界。
- **结果可追溯**：每次查询均返回文档入口、实际规范地址、获取时间和文档指纹。
- **边界明确**：不保存文档地址、不使用跨调用缓存、不调用业务接口，也不推测无法解析的字段。
- **多客户端支持**：提供 Codex、Claude Code、Gemini CLI 及主流 IDE Agent 的接入配置。

## 快速开始

运行环境要求 Node.js 20 或更高版本。无需全局安装：

### 接入 MCP 客户端

以下命令在 npm 首次发布后可直接使用；当前 `0.1.0` 尚未发布到 npm Registry。Codex、Claude Code 和 Gemini CLI 会自动写入配置，并核验实际启动命令是否与预期一致：

```bash
npx --yes swagger-docs-mcp@latest setup codex
npx --yes swagger-docs-mcp@latest setup claude
npx --yes swagger-docs-mcp@latest setup gemini
```

IDE 类客户端使用同一个入口生成对应格式的配置：

```bash
npx --yes swagger-docs-mcp@latest setup cursor
npx --yes swagger-docs-mcp@latest setup vscode
npx --yes swagger-docs-mcp@latest setup opencode
```

查看全部支持项：

```bash
npx --yes swagger-docs-mcp@latest setup list
```

自动安装会把当前精确包版本写入客户端配置，确保后续启动可复现。卸载本项目创建的旧版本配置：

```bash
npx --yes swagger-docs-mcp@latest remove claude
```

`upgrade` 当前只执行归属与安全检查。由于客户端官方 CLI 无法提供可验证的原子替换和完整回滚，检测到旧版本后会明确停止并要求手动升级，不会先删除原配置。

### 运行诊断

```bash
# 检查本机运行环境
npx --yes swagger-docs-mcp@latest doctor

# 验证实时文档发现
npx --yes swagger-docs-mcp@latest doctor http://127.0.0.1:8080/doc.html

# 验证指定分组
npx --yes swagger-docs-mcp@latest doctor https://example.com/doc.html --group exact-group-name
```

## 客户端支持

| 名称 | 客户端 | 接入方式 |
| --- | --- | --- |
| `codex` | OpenAI Codex | 自动写入并核验启动命令一致性 |
| `claude` | Claude Code | 自动写入并核验启动命令一致性 |
| `gemini` | Gemini CLI | 自动写入并核验启动命令一致性 |
| `vscode` | VS Code / GitHub Copilot | 生成 `servers` 配置 |
| `cursor` | Cursor | 生成 `mcpServers` 配置 |
| `windsurf` | Windsurf | 生成 `mcpServers` 配置 |
| `trae` | Trae | 生成 `mcpServers` 配置 |
| `cline` | Cline | 生成 `mcpServers` 配置 |
| `roo` | Roo Code | 生成 `mcpServers` 配置 |
| `kiro` | Kiro | 生成 `mcpServers` 配置 |
| `opencode` | OpenCode v2 | 生成 `mcp.servers` 配置 |

自动配置只调用客户端官方 CLI，探测命令在系统临时目录执行并设有 15 秒超时。配置生成模式仅输出 JSON，不读取或修改用户文件。发现任意同名冲突时，`setup` 都会拒绝覆盖；npm alias、额外启动参数和无法解析的配置均按外部配置处理。新增或核验失败时不会按服务名自动清理，避免误删并发写入的配置，CLI 会要求用户手动检查。卸载会在执行前再次核验启动命令，并在执行后确认同名配置已消失。

“生成配置”表示按客户端公开配置结构输出模板，不代表已在所有客户端版本上完成运行时联调。客户端升级配置格式后，应以其官方文档为准并提交兼容性 Issue。

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

所有 Tool 都要求显式传入 `docsUrl`，并声明 `outputSchema`。成功结果统一包含 `source`、`sourceNotice`、`data`、`warnings` 和 `completeness`；错误结果使用 `isError: true`，同时返回稳定错误码和失败阶段。接口详情包括请求参数、请求体 Schema、响应状态，以及：

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
| 顶层参数 / 响应本地 `$ref` | 支持；缺失引用标记为部分完整 |
| Schema 本地 `$ref`、数组、`allOf` | 支持递归展开 |
| 动态 Map、循环引用、最大深度 | 保留边界并标记为部分完整 |

## 安全边界

- 访问用户明确提供的文档入口及其同源发现地址，不调用规范中描述的业务 API。
- 每次 Tool 调用都重新获取文档，不保存地址、选择状态或历史响应。
- 单次请求超时 10 秒，响应体最大 20 MB。
- 最多跟随 3 次同源重定向，拒绝跨主机重定向和跨主机发现地址。
- 拒绝包含用户名或密码的 URL，不读取外部 `$ref`。
- 动态字段、缺失引用、循环引用和最大深度均返回明确警告。
- 上游失败时返回错误阶段和请求地址，不使用历史文档降级。
- 查询结果会回传文档地址用于溯源，不要在 URL 查询参数中携带口令或令牌。

默认允许访问进程可达的公网、内网和本机 HTTP(S) 地址，因此本工具不是 SSRF 隔离代理。处理不受信任的 URL 时，应设置精确来源白名单：

```bash
SWAGGER_DOCS_ALLOWED_ORIGINS=https://api.example.com,http://127.0.0.1:8080 \
  npx --yes swagger-docs-mcp@latest
```

完整信任边界和漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm run dev               # 直接运行 TypeScript 入口
npm run typecheck         # 类型检查
npm test                  # 完整测试
npm run test:integration  # MCP 集成测试
npm run build             # 构建 dist
npm run check             # 类型检查、测试和构建
```

本地源码接入可在构建后使用 `node dist/index.js setup <client> --local`。`--local` 会写入当前仓库中 `dist/index.js` 的绝对路径，仓库移动后必须重新生成配置。

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

### JavaScript / TypeScript API

npm 根入口无 CLI 副作用，公开 `createMcpServer`、`ApiDocsService`、`Swagger2Parser`、`SafeHttpClient` 及领域类型。未通过根入口导出的 `dist` 内部路径不属于语义化版本兼容范围。

```ts
import { ApiDocsService } from "swagger-docs-mcp";

const service = new ApiDocsService();
const result = await service.listCategories("https://api.example.com/v2/api-docs", undefined, 1, 20);
```

## 发布

1. 更新版本号和 [CHANGELOG.md](CHANGELOG.md)，运行 `npm run check` 与 `npm pack --dry-run`。
2. 在 npm 包设置中为本仓库的 `publish.yml` 配置 Trusted Publisher，并在 GitHub 创建 `npm` Environment。
3. 创建与 `package.json` 一致的 `vX.Y.Z` GitHub Release。工作流将重新执行发布门禁并通过 OIDC 发布带来源证明的包。

`prepublishOnly` 会在手工执行 `npm publish` 时强制运行类型检查、完整测试和构建。`0.x` 阶段允许在次版本中调整实验性能力；计划对外稳定后再发布 `1.0.0`。

## License

[MIT](LICENSE)
