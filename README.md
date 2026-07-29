# swagger-docs-mcp

一个无状态、只读的 Swagger 文档 MCP。把 `doc.html`、Knife4j 接口深链接或 Swagger JSON 地址直接交给 AI，即可逐级选择或直接定位接口，并递归展开实时响应字段。

每次调用都必须显式传入 `docsUrl`。服务不会保存地址，不绑定工程，不调用业务接口，也不会使用跨调用缓存。每个成功或失败结果都会说明本次查询地址、实际 Swagger 地址、获取时间以及是否使用缓存，降低联调时查错人或查到旧文档的风险。

## 运行要求

- Node.js 20 或更高版本
- 文档入口必须是 `http://` 或 `https://`
- v0.1.x 完整支持 Swagger 2.0；OpenAPI 3 会返回明确的暂不支持错误

## 支持的 Agent

首版适配以下主流 MCP 客户端。这里的“自动安装”只调用客户端公开的官方 CLI；“生成配置”不会修改用户文件，避免不同版本、不同安装渠道的配置路径冲突。

| setup 名称 | 客户端 | 适配方式 | 配置或验证入口 |
| --- | --- | --- | --- |
| `codex` | OpenAI Codex | 自动安装并核验 | `codex mcp get swagger-docs` |
| `claude` | Claude Code | 自动安装并核验 | `claude mcp get swagger-docs` |
| `gemini` | Gemini CLI | 自动安装并核验 | `gemini mcp list` |
| `vscode` | VS Code / GitHub Copilot | 生成 `servers` 配置 | 用户 MCP 配置或 `.vscode/mcp.json` |
| `cursor` | Cursor | 生成 `mcpServers` 配置 | `~/.cursor/mcp.json` 或 `.cursor/mcp.json` |
| `windsurf` | Windsurf | 生成 `mcpServers` 配置 | `~/.codeium/windsurf/mcp_config.json` |
| `trae` | Trae | 生成 `mcpServers` 配置 | Trae MCP 设置界面 |
| `cline` | Cline | 生成 `mcpServers` 配置 | Cline MCP 配置界面；CLI 为 `~/.cline/mcp.json` |
| `roo` | Roo Code | 生成 `mcpServers` 配置 | Roo MCP 设置或 `.roo/mcp.json` |
| `kiro` | Kiro | 生成 `mcpServers` 配置 | `~/.kiro/settings/mcp.json` 或 `.kiro/settings/mcp.json` |
| `opencode` | OpenCode v2 | 生成 `mcp.servers` 配置 | OpenCode v2 配置；`opencode2 mcp list` 验证 |

查看当前版本内置的完整清单：

```bash
npx -y swagger-docs-mcp@0.1.0 setup list
```

也支持 `claude-code`、`gemini-cli`、`github-copilot`、`vs-code`、`roo-code`、`kiro-cli` 等常用别名。

## 快速安装

以下命令固定使用 `0.1.0`，不会因 `latest` 更新而静默升级。

### Codex

```bash
npx -y swagger-docs-mcp@0.1.0 setup codex
codex mcp get swagger-docs
```

### Claude Code

```bash
npx -y swagger-docs-mcp@0.1.0 setup claude
claude mcp get swagger-docs
```

### Gemini CLI

```bash
npx -y swagger-docs-mcp@0.1.0 setup gemini
gemini mcp list
```

### IDE 与扩展型 Agent

传入上表中的 setup 名称，生成该客户端可直接粘贴的 JSON：

```bash
npx -y swagger-docs-mcp@0.1.0 setup vscode
npx -y swagger-docs-mcp@0.1.0 setup cursor
npx -y swagger-docs-mcp@0.1.0 setup windsurf
npx -y swagger-docs-mcp@0.1.0 setup trae
npx -y swagger-docs-mcp@0.1.0 setup cline
npx -y swagger-docs-mcp@0.1.0 setup roo
npx -y swagger-docs-mcp@0.1.0 setup kiro
npx -y swagger-docs-mcp@0.1.0 setup opencode
```

例如 Cursor、Windsurf、Trae、Cline、Roo Code 和 Kiro 得到：

```json
{
  "mcpServers": {
    "swagger-docs": {
      "command": "npx",
      "args": ["-y", "swagger-docs-mcp@0.1.0"],
      "env": {}
    }
  }
}
```

VS Code 会得到顶层 `servers` 配置，OpenCode v2 会得到 `mcp.servers` 配置，CLI 不会把不兼容的结构混用。

`setup` 只安装或生成 MCP 启动配置，不保存任何 Swagger 文档地址。Codex、Claude Code 和 Gemini CLI 安装后会立即读取配置核验；已有相同配置时幂等成功，发现同名但不同配置时拒绝覆盖。其他客户端只输出 JSON，不读取、合并或覆盖现有配置。

## 日常使用

以下示例统一使用 IANA 保留的文档示例地址 `203.0.113.10`，不对应任何真实后端服务。

用户只需在对话中同时提供文档地址和查询目标，例如：

```text
查询 http://203.0.113.10:8080/doc.html 的所有接口分类。
```

```text
查询 http://203.0.113.10:8080/doc.html 中
uniform-study-exam-stat-controller 分类的完整接口文档。
```

```text
查询 http://203.0.113.10:8080/doc.html 的
/api/v1/study-exam-stat/baseline-class-stat POST，展开全部请求和响应字段。
```

```text
在 http://203.0.113.10:8080/doc.html 中搜索“成绩统计”。
```

单独粘贴地址不会自动访问文档：

```text
http://203.0.113.10:8080/doc.html#
```

URL 本身不代表查询授权。AI 应先询问用户希望查询分类、搜索接口还是查看接口详情，不立即调用 MCP。

需要查询时明确表达操作意图：

```text
查询这个接口文档的分类：
http://203.0.113.10:8080/doc.html#
```

如果 AI 在当前对话中已经主动要求用户提供文档地址，用户随后只回复 URL，则视为已有明确上下文，可以继续调用 MCP。查询开始后，多分组时询问分组；唯一分组会自动进入分类列表。

完整 Knife4j 深链接会直接定位接口：

```text
http://203.0.113.10:8080/doc.html#/default/uniform-study-exam-stat-controller/getUniformStudyExamStatDetailUsingGET
```

hash 中的分组、分类和 operationId 仅作为线索。MCP 必须在本次实时 Swagger 中逐项精确验证；验证成功后自动查询完整接口，未命中或不唯一时只返回候选项。

多分组文档必须由用户明确提供精确 `group`，服务不会自动猜测。每次回答应保留 Tool 返回的 `sourceNotice`。

## MCP Tools

| Tool | 用途 |
| --- | --- |
| `inspect_api_docs` | 检查根地址或深链接，验证导航线索并返回下一步 |
| `list_api_categories` | 分页列出分类及接口数量 |
| `get_api_category` | 按精确分类名查询摘要或完整接口 |
| `get_api_by_path` | 按精确路径和可选 Method 查询完整接口 |
| `search_apis` | 搜索路径、摘要、描述、分类和 operationId |

五个 Tool 都要求 `docsUrl`。完整接口结果包含请求参数、请求体 schema、所有响应状态、`schemaTree`、`flatFields`、`schemaReferences` 和 `unresolvedDynamicFields`。

`inspect_api_docs` 的 `nextAction` 规则：

| nextAction | Agent 行为 |
| --- | --- |
| `select_group` | 展示实时分组并询问用户 |
| `select_category` | 展示分类并询问用户 |
| `select_api` | 展示分类内接口并询问用户 |
| `get_api_detail` | 直接用已验证的 group、path、method 调用 `get_api_by_path` |
| `provide_swagger_json_url` | UI 发现失败，请用户提供直接 Swagger JSON 地址 |

MCP 不保存选择状态。后续每次调用仍携带原始 `docsUrl` 和已选择的精确 `group`。

动态 Map、外部引用、缺失引用、循环模型和最大深度边界会被明确标记，不会推测不存在的字段。同一路径存在多个 HTTP Method 时必须明确传入 `method`。

## 实时诊断

仅检查本机运行环境：

```bash
npx -y swagger-docs-mcp@0.1.0 doctor
```

实时检查某个文档入口：

```bash
npx -y swagger-docs-mcp@0.1.0 doctor http://203.0.113.10:8080/doc.html
```

多分组文档：

```bash
npx -y swagger-docs-mcp@0.1.0 doctor https://example.com/doc.html --group exact-group-name
```

## 升级与卸载

安装新版本时显式指定版本并允许替换当前同名配置：

```bash
npx -y swagger-docs-mcp@0.2.0 setup codex --replace
npx -y swagger-docs-mcp@0.2.0 setup claude --replace
npx -y swagger-docs-mcp@0.2.0 setup gemini --replace
```

卸载：

```bash
npx -y swagger-docs-mcp@0.1.0 remove codex
npx -y swagger-docs-mcp@0.1.0 remove claude
npx -y swagger-docs-mcp@0.1.0 remove gemini
```

卸载前会核验同名配置确实属于当前版本，避免误删其他 MCP。配置型客户端请在上表对应入口中删除 `swagger-docs`；CLI 不会直接修改其配置文件。

## 网络与数据边界

- 单次请求超时 10 秒，单个响应最大 20 MB。
- 最多跟随 3 次同源重定向；拒绝跨主机重定向和跨主机发现地址。
- 不支持 URL 认证信息，不读取外部 `$ref`。
- 只访问展示页、同源文档发现入口和发现出的规范地址。
- 每次 Tool 调用重新获取文档；上游失败时明确报错，不返回旧结果。
- stdio 的 stdout 只承载 MCP 协议，诊断错误写入 stderr。

## 本地开发

```bash
npm install
npm run check
node dist/index.js doctor http://127.0.0.1:8080/doc.html
```

将本地构建注册到客户端，便于发布前验证：

```bash
npm run build
node dist/index.js setup codex --local
node dist/index.js setup claude --local
node dist/index.js setup gemini --local
node dist/index.js setup cursor --local
```

本地模式会把当前 `dist/index.js` 的绝对路径写入客户端。发布安装和本地安装属于不同配置，切换时需显式使用 `--replace`。

## 架构

代码按稳定边界分层：

- `src/source`：安全 HTTP 获取、原始 JSON 与 Springfox/Knife4j 文档发现。
- `src/navigation`：Knife4j hash 线索解析，不接触网络和业务查询。
- `src/parser`、`src/swagger2`：版本无关解析器接口和 Swagger 2.0 实现。
- `src/service`：客户端无关的查询、分页和来源封装。
- `src/server`：MCP Tool 契约。
- `src/cli`：doctor 和多客户端安装体验。

增加 OpenAPI 3 支持时新增 `ApiSpecParser` 实现即可，不需要修改现有 Tool 契约。

## License

MIT
