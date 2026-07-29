import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("官网发布内容", () => {
  const html = readFileSync(new URL("../docs/index.html", import.meta.url), "utf8");

  it("使用项目相对首页链接并明确标记 npm 预发布状态", () => {
    expect(html).toContain('href="./" class="nav-logo"');
    expect(html).not.toContain('href="/" class="nav-logo"');
    expect(html).toContain("npx --yes swagger-docs-mcp@latest setup claude");
    expect(html).toContain("当前尚未发布到 npm Registry，以下命令暂不可用");
    expect(html).toContain("npm 首次发布后可用；当前为预发布演示");
    expect(html).not.toContain("npmjs.com/package/swagger-docs-mcp");
    expect(html).not.toContain("当前版本完整支持 Swagger 2.0");
  });

  it("包含跳转链接和真正生效的减少动态效果分支", () => {
    expect(html).toContain('class="skip-link" href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).toContain("if (reduceMotion)");
  });
});
