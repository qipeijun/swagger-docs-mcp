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
import { readPackageVersion } from "../src/version.js";

const currentPackageId = `swagger-docs-mcp@${readPackageVersion()}`;

const launch: McpLaunchCommand = {
  command: "npx",
  args: ["-y", currentPackageId],
  identity: currentPackageId
};

describe("客户端配置目录", () => {
  it("覆盖已支持的 MCP 客户端并提供常用别名", () => {
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
          args: ["-y", currentPackageId],
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
          args: ["-y", currentPackageId],
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
            command: ["npx", "-y", currentPackageId],
            codemode: false
          }
        }
      }
    });
  });

  it("客户端清单明确区分自动配置和仅生成配置", () => {
    const catalog = formatClientCatalog();
    expect(catalog).toContain("gemini: Gemini CLI；自动写入并核验启动命令一致性");
    expect(catalog).toContain("trae: Trae；生成配置，不写文件");
    expect(getClientDefinition("windsurf").configLocation).toContain("mcp_config.json");
  });
});

describe("客户端安装流程", () => {
  it.each([
    {
      client: "codex" as const,
      command: "codex",
      addArgs: ["mcp", "add", "swagger-docs", "--", "npx", "-y", currentPackageId]
    },
    {
      client: "claude" as const,
      command: "claude",
      addArgs: [
        "mcp", "add", "--scope", "user", "swagger-docs", "--",
        "npx", "-y", currentPackageId
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
        ? {
            status: 0,
            stdout: client === "codex"
              ? JSON.stringify({ transport: { type: "stdio", command: "npx", args: ["-y", currentPackageId] } })
              : `command: npx\nargs: -y ${currentPackageId}`,
            stderr: ""
          }
        : {
            status: 1,
            stdout: "",
            stderr: client === "codex"
              ? "Error: No MCP server named 'swagger-docs' found."
              : "No MCP server found with name: \"swagger-docs\". Configured servers:"
          };
    });

    expect(setupClient(client, { local: false }, runner)).toContain("通过启动命令一致性核验");
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("Codex 核验只解析 JSON stdout，不受诊断 stderr 干扰", () => {
    const runner: CommandRunner = (_command, args) => {
      if (args[1] === "add") return { status: 0, stdout: "added", stderr: "" };
      const installed = args.includes("--json") && runnerCallCount > 0;
      runnerCallCount += 1;
      return installed
        ? {
            status: 0,
            stdout: JSON.stringify({
              transport: { command: "npx", args: ["-y", currentPackageId] }
            }),
            stderr: "diagnostic warning"
          }
        : { status: 1, stdout: "", stderr: "Error: No MCP server named 'swagger-docs' found." };
    };
    let runnerCallCount = 0;

    expect(setupClient("codex", { local: false }, runner))
      .toContain("通过启动命令一致性核验");
  });

  it("Gemini CLI 使用用户级配置并在写入后重新核验", () => {
    let installed = false;
    const runner = vi.fn<CommandRunner>((command, args) => {
      expect(command).toBe("gemini");
      if (args[1] === "add") {
        installed = true;
        expect(args).toEqual([
          "mcp", "add", "--scope", "user", "swagger-docs",
          "npx", "--", "-y", currentPackageId
        ]);
        return { status: 0, stdout: "added", stderr: "" };
      }
      return {
        status: 0,
        stdout: installed
          ? `✓ swagger-docs: command: npx -y ${currentPackageId} (stdio) - Connected`
          : "No MCP servers",
        stderr: ""
      };
    });

    const result = setupClient("gemini", { local: false }, runner);
    expect(result).toContain("Gemini CLI 配置已写入并通过启动命令一致性核验");
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("同名配置不匹配时拒绝静默覆盖", () => {
    const runner: CommandRunner = () => ({
      status: 0,
      stdout: "swagger-docs: node /other/server.js",
      stderr: ""
    });

    expect(() => setupClient("gemini", { local: false }, runner)).toThrow(
      expect.objectContaining({ code: ErrorCode.CLIENT_CONFIG_CONFLICT })
    );
  });

  it("upgrade 拒绝替换外部程序创建的同名配置", () => {
    const runner: CommandRunner = () => ({
      status: 0,
      stdout: "swagger-docs: node /other/server.js",
      stderr: ""
    });

    expect(() => setupClient("gemini", {
      local: false,
      upgrade: true
    }, runner)).toThrow(expect.objectContaining({
      code: ErrorCode.CLIENT_CONFIG_CONFLICT,
      message: expect.stringContaining("拒绝升级")
    }));
  });

  it("upgrade 在未安装时不隐式执行 setup", () => {
    const runner: CommandRunner = () => ({
      status: 1,
      stdout: "",
      stderr: "No MCP server found with name: \"swagger-docs\". Configured servers:"
    });

    expect(() => setupClient("claude", {
      local: false,
      upgrade: true
    }, runner)).toThrow(expect.objectContaining({
      code: ErrorCode.CLIENT_NOT_FOUND,
      message: expect.stringContaining("请先执行 setup claude")
    }));
  });

  it("无法完整、原子恢复旧配置时拒绝自动升级且不执行写操作", () => {
    let mutationCalled = false;
    const runner = vi.fn<CommandRunner>((_command, args) => {
      if (args[1] === "remove" || args[1] === "add") mutationCalled = true;
      return {
        status: 0,
        stdout: [
          "command: npx",
          "args: -y swagger-docs-mcp@0.0.9",
          "environment:",
          "  API_TOKEN=secret"
        ].join("\n"),
        stderr: ""
      };
    });

    expect(() => setupClient("claude", { local: false, upgrade: true }, runner)).toThrow(
      expect.objectContaining({ message: expect.stringContaining("拒绝自动升级") })
    );
    expect(mutationCalled).toBe(false);
  });

  it("允许卸载由旧版本包创建的配置", () => {
    let removed = false;
    const runner: CommandRunner = (_command, args) => {
      if (args[1] === "remove") {
        removed = true;
        return { status: 0, stdout: "removed", stderr: "" };
      }
      return removed
        ? {
            status: 1,
            stdout: "",
            stderr: "No MCP server found with name: \"swagger-docs\". Configured servers:"
          }
        : { status: 0, stdout: "command: npx\nargs: -y swagger-docs-mcp@0.0.9", stderr: "" };
    };

    expect(removeClient("claude", false, runner)).toContain("已卸载");
    expect(removed).toBe(true);
  });

  it("冲突详情不包含客户端原始配置输出", () => {
    const secret = "SECRET_TOKEN_SHOULD_NOT_LEAK";
    const runner: CommandRunner = () => ({
      status: 0,
      stdout: `swagger-docs: node /other/server.js env=${secret}`,
      stderr: ""
    });

    try {
      setupClient("gemini", { local: false }, runner);
      throw new Error("expected setupClient to throw");
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });

  it("Gemini 只使用目标服务所在行判断配置归属", () => {
    const runner: CommandRunner = () => ({
      status: 0,
      stdout: [
        "swagger-docs: node /other/server.js",
        "another-server: npx -y swagger-docs-mcp@0.1.0"
      ].join("\n"),
      stderr: ""
    });

    expect(() => removeClient("gemini", false, runner)).toThrow(expect.objectContaining({
      code: ErrorCode.CLIENT_CONFIG_CONFLICT
    }));
  });

  it("命令参数提到包名但启动命令不是 npx 时拒绝升级和卸载", () => {
    const runner: CommandRunner = () => ({
      status: 0,
      stdout: "command: node\nargs: /external/swagger-docs-mcp/server.js",
      stderr: ""
    });

    expect(() => setupClient("claude", {
      local: false,
      upgrade: true
    }, runner)).toThrow(expect.objectContaining({ code: ErrorCode.CLIENT_CONFIG_CONFLICT }));
    expect(() => removeClient("claude", false, runner)).toThrow(
      expect.objectContaining({ code: ErrorCode.CLIENT_CONFIG_CONFLICT })
    );
  });

  it.each([
    "swagger-docs-mcp@npm:foreign-package",
    "swagger-docs-mcp@0.1.0 --external"
  ])("拒绝认领 npm alias 或带额外参数的配置：%s", (argsText) => {
    let removeCalled = false;
    const runner: CommandRunner = (_command, args) => {
      if (args[1] === "remove") removeCalled = true;
      return { status: 0, stdout: `command: npx\nargs: -y ${argsText}`, stderr: "" };
    };

    expect(() => setupClient("claude", { local: false, upgrade: true }, runner)).toThrow(
      expect.objectContaining({ code: ErrorCode.CLIENT_CONFIG_CONFLICT })
    );
    expect(() => removeClient("claude", false, runner)).toThrow(
      expect.objectContaining({ code: ErrorCode.CLIENT_CONFIG_CONFLICT })
    );
    expect(removeCalled).toBe(false);
  });

  it.each([
    { client: "codex" as const, stderr: "permission denied" },
    { client: "claude" as const, stderr: "authentication failed" },
    {
      client: "claude" as const,
      stderr: [
        "permission denied while reading config",
        "No MCP server found with name: \"swagger-docs\". Configured servers:"
      ].join("\n")
    },
    {
      client: "claude" as const,
      stderr: "No MCP server found with name: \"swagger-docs\". Configured servers: permission denied while reading config"
    }
  ])("$client 检查命令失败时不解释为配置不存在", ({ client, stderr }) => {
    let mutationCalled = false;
    const runner: CommandRunner = (_command, args) => {
      if (args[1] === "add" || args[1] === "remove") mutationCalled = true;
      return { status: 1, stdout: "", stderr };
    };

    expect(() => setupClient(client, { local: false }, runner)).toThrow(
      expect.objectContaining({ code: ErrorCode.CLIENT_COMMAND_FAILED })
    );
    expect(mutationCalled).toBe(false);
  });

  it("Claude 单行混合 not-found 与权限错误时卸载失败且不执行删除", () => {
    let removeCalled = false;
    const runner: CommandRunner = (_command, args) => {
      if (args[1] === "remove") removeCalled = true;
      return {
        status: 1,
        stdout: "",
        stderr: "No MCP server found with name: \"swagger-docs\". Configured servers: permission denied while reading config"
      };
    };

    expect(() => removeClient("claude", false, runner)).toThrow(
      expect.objectContaining({ code: ErrorCode.CLIENT_COMMAND_FAILED })
    );
    expect(removeCalled).toBe(false);
  });

  it("新增命令失败时不按名称自动清理", () => {
    let removeCalled = false;
    let calls = 0;
    const runner: CommandRunner = (_command, args) => {
      if (args[1] === "remove") removeCalled = true;
      calls += 1;
      if (calls === 1) {
        return { status: 1, stdout: "", stderr: "Error: No MCP server named 'swagger-docs' found." };
      }
      return { status: 1, stdout: "", stderr: "write failed" };
    };

    expect(() => setupClient("codex", { local: false }, runner)).toThrow(
      expect.objectContaining({ message: expect.stringContaining("未执行自动清理") })
    );
    expect(removeCalled).toBe(false);
  });

  it("核验时出现并发外部同名配置不会触发删除", () => {
    let removeCalled = false;
    let installed = false;
    const runner: CommandRunner = (_command, args) => {
      if (args[1] === "add") {
        installed = true;
        return { status: 0, stdout: "added", stderr: "" };
      }
      if (args[1] === "remove") removeCalled = true;
      return installed
        ? { status: 0, stdout: "command: node\nargs: /external/server.js", stderr: "" }
        : {
            status: 1,
            stdout: "",
            stderr: "No MCP server found with name: \"swagger-docs\". Configured servers:"
          };
    };

    expect(() => setupClient("claude", { local: false }, runner)).toThrow(
      expect.objectContaining({ message: expect.stringContaining("未执行自动清理") })
    );
    expect(removeCalled).toBe(false);
  });

  it("卸载前配置发生变化时停止删除", () => {
    let inspectionCount = 0;
    let removeCalled = false;
    const runner: CommandRunner = (_command, args) => {
      if (args[1] === "remove") {
        removeCalled = true;
        return { status: 0, stdout: "removed", stderr: "" };
      }
      inspectionCount += 1;
      return inspectionCount === 1
        ? { status: 0, stdout: "command: npx\nargs: -y swagger-docs-mcp@0.0.9", stderr: "" }
        : { status: 0, stdout: "command: node\nargs: /external/server.js", stderr: "" };
    };

    expect(() => removeClient("claude", false, runner)).toThrow(
      expect.objectContaining({ code: ErrorCode.CLIENT_CONFIG_CONFLICT })
    );
    expect(removeCalled).toBe(false);
  });

  it.each([
    "permission denied",
    [
      "permission denied while reading config",
      "No MCP server found with name: \"swagger-docs\". Configured servers:"
    ].join("\n"),
    "No MCP server found with name: \"swagger-docs\". Configured servers: permission denied while reading config"
  ])("卸载后的检查失败不会误报成功：%s", (failureOutput) => {
    let callCount = 0;
    const runner: CommandRunner = (_command, args) => {
      if (args[1] === "remove") return { status: 0, stdout: "removed", stderr: "" };
      callCount += 1;
      if (callCount <= 2) {
        return { status: 0, stdout: "command: npx\nargs: -y swagger-docs-mcp@0.0.9", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: failureOutput };
    };

    expect(() => removeClient("claude", false, runner)).toThrow(
      expect.objectContaining({ code: ErrorCode.CLIENT_COMMAND_FAILED })
    );
  });

  it("配置型客户端 upgrade 明确失败，不输出未落地模板", () => {
    expect(() => setupClient("cursor", {
      local: false,
      upgrade: true
    })).toThrow(expect.objectContaining({
      code: ErrorCode.INVALID_CLI_ARGUMENT,
      message: expect.stringContaining("不支持自动升级")
    }));
  });

  it("配置型客户端只输出 JSON，不执行外部命令", () => {
    const runner = vi.fn<CommandRunner>();
    const output = setupClient("vscode", { local: false }, runner);
    expect(JSON.parse(output)).toHaveProperty("servers.swagger-docs.command", "npx");
    expect(runner).not.toHaveBeenCalled();
  });

  it("不会擅自删除配置型客户端的文件", () => {
    expect(() => removeClient("cursor", false)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_CLI_ARGUMENT })
    );
  });
});
