import { describe, expect, it, vi } from "vitest";
import {
  createClientConfig,
  formatClientCatalog,
  getClientDefinition,
  normalizeClient,
  SUPPORTED_CLIENT_IDS,
  type McpLaunchCommand
} from "../src/cli/client-catalog.js";
import { removeClient, setupClient, type CommandRunner } from "../src/cli/client-setup.js";
import { ErrorCode } from "../src/errors.js";

const launch: McpLaunchCommand = {
  command: "npx",
  args: ["-y", "swagger-docs-mcp@0.1.0"],
  identity: "swagger-docs-mcp@0.1.0"
};

describe("客户端配置目录", () => {
  it("覆盖锁定的主流 MCP 客户端并支持常用别名", () => {
    expect(SUPPORTED_CLIENT_IDS).toHaveLength(11);
    expect(normalizeClient("claude-code")).toBe("claude");
    expect(normalizeClient("github-copilot")).toBe("vscode");
    expect(normalizeClient("roo-code")).toBe("roo");
    expect(normalizeClient("unknown")).toBeUndefined();
  });

  it("为通用 mcpServers 客户端生成标准 stdio 配置", () => {
    expect(createClientConfig("cursor", launch)).toEqual({
      mcpServers: {
        "swagger-docs": {
          command: "npx",
          args: ["-y", "swagger-docs-mcp@0.1.0"],
          env: {}
        }
      }
    });
  });

  it("为 VS Code 和 OpenCode 生成各自的官方结构", () => {
    expect(createClientConfig("vscode", launch)).toEqual({
      servers: {
        "swagger-docs": {
          command: "npx",
          args: ["-y", "swagger-docs-mcp@0.1.0"],
          env: {}
        }
      }
    });
    expect(createClientConfig("opencode", launch)).toEqual({
      $schema: "https://opencode.ai/config.json",
      mcp: {
        servers: {
          "swagger-docs": {
            type: "local",
            command: ["npx", "-y", "swagger-docs-mcp@0.1.0"],
            codemode: false
          }
        }
      }
    });
  });

  it("客户端清单明确区分自动安装和仅生成配置", () => {
    const catalog = formatClientCatalog();
    expect(catalog).toContain("gemini: Gemini CLI；自动安装并核验");
    expect(catalog).toContain("trae: Trae；生成配置，不写文件");
    expect(getClientDefinition("windsurf").configLocation).toContain("mcp_config.json");
  });
});

describe("客户端安装流程", () => {
  it.each([
    {
      client: "codex" as const,
      command: "codex",
      addArgs: ["mcp", "add", "swagger-docs", "--", "npx", "-y", "swagger-docs-mcp@0.1.0"]
    },
    {
      client: "claude" as const,
      command: "claude",
      addArgs: [
        "mcp", "add", "--scope", "user", "swagger-docs", "--",
        "npx", "-y", "swagger-docs-mcp@0.1.0"
      ]
    }
  ])("$client 使用官方 CLI 参数并在写入后核验", ({ client, command, addArgs }) => {
    let installed = false;
    const runner = vi.fn<CommandRunner>((actualCommand, args) => {
      expect(actualCommand).toBe(command);
      if (args[1] === "add") {
        expect(args).toEqual(addArgs);
        installed = true;
        return { status: 0, stdout: "added", stderr: "" };
      }
      return installed
        ? { status: 0, stdout: "command: npx\nargs: -y swagger-docs-mcp@0.1.0", stderr: "" }
        : { status: 1, stdout: "", stderr: "not found" };
    });

    expect(setupClient(client, { replace: false, local: false }, runner)).toContain("已安装并核验");
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("Gemini CLI 使用用户级配置并在写入后重新核验", () => {
    let installed = false;
    const runner = vi.fn<CommandRunner>((command, args) => {
      expect(command).toBe("gemini");
      if (args[1] === "add") {
        installed = true;
        expect(args).toEqual([
          "mcp", "add", "--scope", "user", "swagger-docs",
          "npx", "--", "-y", "swagger-docs-mcp@0.1.0"
        ]);
        return { status: 0, stdout: "added", stderr: "" };
      }
      return {
        status: 0,
        stdout: installed ? "swagger-docs: npx -y swagger-docs-mcp@0.1.0 (stdio)" : "No MCP servers",
        stderr: ""
      };
    });

    const result = setupClient("gemini", { replace: false, local: false }, runner);
    expect(result).toContain("Gemini CLI 已安装并核验");
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("同名配置不匹配时拒绝静默覆盖", () => {
    const runner: CommandRunner = () => ({
      status: 0,
      stdout: "swagger-docs: node /other/server.js",
      stderr: ""
    });

    expect(() => setupClient("gemini", { replace: false, local: false }, runner)).toThrow(
      expect.objectContaining({ code: ErrorCode.CLIENT_CONFIG_CONFLICT })
    );
  });

  it("配置型客户端只输出 JSON，不执行外部命令", () => {
    const runner = vi.fn<CommandRunner>();
    const output = setupClient("vscode", { replace: false, local: false }, runner);
    expect(JSON.parse(output)).toHaveProperty("servers.swagger-docs.command", "npx");
    expect(runner).not.toHaveBeenCalled();
  });

  it("不会擅自删除配置型客户端的文件", () => {
    expect(() => removeClient("cursor", false)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_CLI_ARGUMENT })
    );
  });
});
