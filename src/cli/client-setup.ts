import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { AppError, ErrorCode, ErrorStage } from "../errors.js";
import { readPackageVersion } from "../version.js";
import {
  createClientConfig,
  getClientDefinition,
  isAutomaticClient,
  type AutomaticClient,
  type McpLaunchCommand,
  type SupportedClient
} from "./client-catalog.js";

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => CommandResult;

export interface SetupOptions {
  replace: boolean;
  local: boolean;
}

const SERVER_NAME = "swagger-docs";

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new AppError(ErrorCode.CLIENT_NOT_FOUND, ErrorStage.CLIENT_SETUP, `未找到客户端命令：${command}`);
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function serverCommand(local: boolean): McpLaunchCommand {
  if (local) {
    const distEntry = fileURLToPath(new URL("../../dist/index.js", import.meta.url));
    if (!existsSync(distEntry)) {
      throw new AppError(
        ErrorCode.CLIENT_COMMAND_FAILED,
        ErrorStage.CLIENT_SETUP,
        `本地入口不存在，请先运行 npm run build：${distEntry}`
      );
    }
    return { command: process.execPath, args: [distEntry], identity: distEntry };
  }

  const packageId = `swagger-docs-mcp@${readPackageVersion()}`;
  return { command: "npx", args: ["-y", packageId], identity: packageId };
}

function existingMatches(output: string, expected: McpLaunchCommand): boolean {
  return output.includes(expected.command)
    && expected.args.every((argument) => output.includes(argument));
}

interface CliAdapter {
  command: AutomaticClient;
  inspectArgs: string[];
  inspectIsList: boolean;
  addArgs: (expected: McpLaunchCommand) => string[];
  removeArgs: string[];
}

function cliAdapter(client: AutomaticClient): CliAdapter {
  switch (client) {
    case "codex":
      return {
        command: "codex",
        inspectArgs: ["mcp", "get", SERVER_NAME],
        inspectIsList: false,
        addArgs: (expected) => ["mcp", "add", SERVER_NAME, "--", expected.command, ...expected.args],
        removeArgs: ["mcp", "remove", SERVER_NAME]
      };
    case "claude":
      return {
        command: "claude",
        inspectArgs: ["mcp", "get", SERVER_NAME],
        inspectIsList: false,
        addArgs: (expected) => ["mcp", "add", "--scope", "user", SERVER_NAME, "--", expected.command, ...expected.args],
        removeArgs: ["mcp", "remove", "--scope", "user", SERVER_NAME]
      };
    case "gemini":
      return {
        command: "gemini",
        inspectArgs: ["mcp", "list"],
        inspectIsList: true,
        addArgs: (expected) => [
          "mcp", "add", "--scope", "user", SERVER_NAME, expected.command, "--", ...expected.args
        ],
        removeArgs: ["mcp", "remove", "--scope", "user", SERVER_NAME]
      };
  }
}

function inspectClient(adapter: CliAdapter, runner: CommandRunner): { found: boolean; result: CommandResult } {
  const result = runner(adapter.command, adapter.inspectArgs);
  if (adapter.inspectIsList && result.status !== 0) {
    throw new AppError(
      ErrorCode.CLIENT_COMMAND_FAILED,
      ErrorStage.CLIENT_SETUP,
      formatFailure(adapter.command, result)
    );
  }
  const output = `${result.stdout}\n${result.stderr}`;
  return {
    found: adapter.inspectIsList ? output.includes(SERVER_NAME) : result.status === 0,
    result
  };
}

function formatFailure(command: string, result: CommandResult): string {
  const details = result.stderr.trim() || result.stdout.trim() || `退出码 ${result.status}`;
  return `${command} 执行失败：${details}`;
}

/**
 * 幂等安装 MCP 客户端配置。发现同名但指向其他命令的配置时拒绝覆盖，
 * 只有用户明确传入 --replace 才执行定向替换。
 */
export function setupClient(
  client: SupportedClient,
  options: SetupOptions,
  runner: CommandRunner = runCommand
): string {
  const expected = serverCommand(options.local);
  if (!isAutomaticClient(client)) {
    return JSON.stringify(createClientConfig(client, expected), null, 2);
  }

  const adapter = cliAdapter(client);
  const inspected = inspectClient(adapter, runner);
  if (inspected.found) {
    const combinedOutput = `${inspected.result.stdout}\n${inspected.result.stderr}`;
    if (existingMatches(combinedOutput, expected)) {
      return `${getClientDefinition(client).displayName} 已存在相同的 ${SERVER_NAME} 配置，无需重复安装。`;
    }
    if (!options.replace) {
      throw new AppError(
        ErrorCode.CLIENT_CONFIG_CONFLICT,
        ErrorStage.CLIENT_SETUP,
        `${getClientDefinition(client).displayName} 已存在同名但不同的 ${SERVER_NAME} 配置；确认后使用 --replace 替换`,
        { details: { existing: combinedOutput.trim(), expected: expected.identity } }
      );
    }
    const removed = runner(adapter.command, adapter.removeArgs);
    if (removed.status !== 0) {
      throw new AppError(ErrorCode.CLIENT_COMMAND_FAILED, ErrorStage.CLIENT_SETUP, formatFailure(adapter.command, removed));
    }
  }

  const added = runner(adapter.command, adapter.addArgs(expected));
  if (added.status !== 0) {
    throw new AppError(ErrorCode.CLIENT_COMMAND_FAILED, ErrorStage.CLIENT_SETUP, formatFailure(adapter.command, added));
  }

  const verified = inspectClient(adapter, runner);
  const verifiedOutput = `${verified.result.stdout}\n${verified.result.stderr}`;
  if (!verified.found || !existingMatches(verifiedOutput, expected)) {
    throw new AppError(
      ErrorCode.CLIENT_COMMAND_FAILED,
      ErrorStage.CLIENT_SETUP,
      `${getClientDefinition(client).displayName} 配置写入后未通过身份核验`,
      { details: { output: verifiedOutput.trim(), expected: expected.identity } }
    );
  }
  return `${getClientDefinition(client).displayName} 已安装并核验 ${SERVER_NAME}，命令：${expected.command} ${expected.args.join(" ")}`;
}

export function removeClient(
  client: SupportedClient,
  local: boolean,
  runner: CommandRunner = runCommand
): string {
  if (!isAutomaticClient(client)) {
    const definition = getClientDefinition(client);
    throw new AppError(
      ErrorCode.INVALID_CLI_ARGUMENT,
      ErrorStage.CLIENT_SETUP,
      `${definition.displayName} 请从 ${definition.configLocation} 删除 swagger-docs；CLI 不擅自修改配置文件`
    );
  }
  const expected = serverCommand(local);
  const adapter = cliAdapter(client);
  const inspected = inspectClient(adapter, runner);
  if (!inspected.found) {
    return `${getClientDefinition(client).displayName} 未配置 ${SERVER_NAME}，无需卸载。`;
  }
  const combinedOutput = `${inspected.result.stdout}\n${inspected.result.stderr}`;
  if (!existingMatches(combinedOutput, expected)) {
    throw new AppError(
      ErrorCode.CLIENT_CONFIG_CONFLICT,
      ErrorStage.CLIENT_SETUP,
      `拒绝删除：${getClientDefinition(client).displayName} 中同名配置不属于当前 swagger-docs-mcp`,
      { details: { existing: combinedOutput.trim(), expected: expected.identity } }
    );
  }

  const removed = runner(adapter.command, adapter.removeArgs);
  if (removed.status !== 0) {
    throw new AppError(ErrorCode.CLIENT_COMMAND_FAILED, ErrorStage.CLIENT_SETUP, formatFailure(adapter.command, removed));
  }
  return `${getClientDefinition(client).displayName} 已卸载 ${SERVER_NAME}。`;
}
