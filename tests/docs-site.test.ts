import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("官网发布内容", () => {
  const html = readFileSync(new URL("../docs/index.html", import.meta.url), "utf8");

  it("使用项目相对首页链接并准确展示产品定位与安装状态", () => {
    expect(html).toContain('href="./" class="nav-logo"');
    expect(html).not.toContain('href="/" class="nav-logo"');
    expect(html).toContain("npx --yes swagger-docs-mcp@latest setup claude");
    expect(html).toContain("AI Agent &thinsp;×&thinsp; Swagger / Knife4j");
    expect(html).toContain("需要 Node.js 20 或更高版本。以下命令将为 Claude Code 写入 MCP 配置并核验启动命令。");
    expect(html).toContain("# 配置 Claude Code MCP 客户端");
    expect(html).not.toContain("npm 已发布");
    expect(html).not.toContain("# 已发布到 npm，可直接运行");
    expect(html).not.toContain("swagger-docs-mcp</code> 已发布到 npm Registry");
    expect(html).toContain("https://www.npmjs.com/package/swagger-docs-mcp");
    expect(html).not.toContain("npm 预发布");
    expect(html).not.toContain("当前 npm 包尚未发布");
    expect(html).not.toContain("npm 首次发布后");
    expect(html).not.toContain("以下命令暂不可用");
    expect(html).not.toContain("当前为预发布演示");
    expect(html).not.toContain("当前版本完整支持 Swagger 2.0");
  });

  it("使用明确标注的虚拟示例并按接入能力分组客户端", () => {
    expect(html).toContain("// 虚拟示例输出：");
    expect(html).toContain("https://api.example.com/doc.html");
    expect(html).not.toContain("uniform-study-exam-stat-controller");
    expect(html).not.toContain("user-management-controller");
    expect(html).not.toContain("system-config-controller");

    const automaticStart = html.indexOf('data-client-group="automatic"');
    const templateStart = html.indexOf('data-client-group="template"');
    const agentInstallStart = html.indexOf('id="agent-install"');
    const automaticGroup = html.slice(automaticStart, templateStart);
    const templateGroup = html.slice(templateStart, agentInstallStart);

    expect(automaticGroup).toContain("自动配置并核验");
    expect(automaticGroup).toContain("OpenAI Codex");
    expect(automaticGroup).toContain("Claude Code");
    expect(automaticGroup).toContain("Gemini CLI");
    expect(templateGroup).toContain("仅生成配置");
    for (const client of ["VS Code Copilot", "Cursor", "Windsurf", "Trae", "Cline", "Roo Code", "Kiro", "OpenCode v2"]) {
      expect(templateGroup).toContain(client);
    }
  });

  it("包含跳转链接和真正生效的减少动态效果分支", () => {
    expect(html).toContain('class="skip-link" href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).toContain("if (reduceMotion)");
  });

  it("提供可复制给任意 Agent 的安全接入任务", () => {
    expect(html).toContain('id="agentInstallPrompt"');
    expect(html).toContain('id="copyAgentPrompt"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("navigator.clipboard.writeText");
    expect(html).toContain("不要猜测客户端或配置格式");
    expect(html).toContain("不要覆盖、删除或猜测修复");
    expect(html).toContain("npx --yes swagger-docs-mcp@latest doctor");
  });
});
