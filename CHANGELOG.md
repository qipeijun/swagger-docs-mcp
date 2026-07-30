# 更新日志

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.4] - 2026-07-30

### 修正

- 精简 Swagger 来源说明，展示文档标题和实时验证的 Knife4j 分组，避免重复输出相同地址。
- 将获取时间格式化为易读的北京时间，并使用明确的 Markdown 链接区分文档入口与 Swagger JSON。

## [0.1.3] - 2026-07-30

### 新增

- `doctor` 支持 Knife4j 深链接验证和 `--json` 机器可读输出，成功与失败均返回稳定结构。
- npm 发布后从干净临时目录验证 Registry 精确版本、CLI bin 和 JSON 诊断结果。

### 文档

- 增加 MCP 读取接口文档后由主 Agent 继续开发、调试和验证的任务模板与能力边界。

## [0.1.2] - 2026-07-30

### 修正

- 优化所有对外文案：去除 Tool description 中的冗余规则重复，修正术语不精确、中英文混排和措辞模糊等问题。
- 精简操作告警信息与错误消息，统一 Schema、HTTP 等大小写规范。
- README 顶部新增落地页 badge 链接。
- npm keywords 补充 `knife4j`、`springfox`。

## [0.1.1] - 2026-07-30

### 修正

- 更新 README 与官网的安装入口、运行环境和客户端能力说明。
- 修正官网终端示例、移动端命令排版和客户端分组展示，明确虚拟示例边界。
- 增加项目徽章和可复制给 Agent 的安全接入任务。
- 发布构建前清理旧产物，并让客户端测试自动读取当前包版本。

## [0.1.0] - 2026-07-29

### 新增

- 提供 5 个只读 MCP Tool，支持实时检查、分类查询、路径查询和关键词搜索。
- 支持 Swagger 2.0 JSON、Knife4j / Springfox 文档发现与 hash 深链接验证。
- 支持请求和响应 Schema 树、扁平字段、解析引用和完整性告警。
- 提供 11 类 MCP 客户端的自动配置或配置模板。
- 提供严格 CLI 参数校验、跨版本升级检查、安全卸载和可选来源白名单。
- 增加 CI、npm Trusted Publishing 工作流、发布前完整检查和公开库入口。

[0.1.4]: https://github.com/qipeijun/swagger-docs-mcp/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/qipeijun/swagger-docs-mcp/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/qipeijun/swagger-docs-mcp/releases/tag/v0.1.2
[0.1.1]: https://github.com/qipeijun/swagger-docs-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/qipeijun/swagger-docs-mcp/releases/tag/v0.1.0
