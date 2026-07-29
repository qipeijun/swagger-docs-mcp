import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
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

interface CommandExecutionOptions {
  cwd: string;
  timeoutMs: number;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandExecutionOptions
) => CommandResult;

export interface SetupOptions {
  local: boolean;
  /** 为 true 时执行旧版本升级检查；无法保证无损替换时必须拒绝修改。 */
  upgrade?: boolean;
}

const SERVER_NAME = "swagger-docs";
const PACKAGE_NAME = "swagger-docs-mcp";
const CLIENT_COMMAND_TIMEOUT_MS = 15_000;

function runCommand(
  command: string,
  args: string[],
  options: CommandExecutionOptions = { cwd: tmpdir(), timeoutMs: CLIENT_COMMAND_TIMEOUT_MS }
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: options.cwd,
    timeout: options.timeoutMs
  });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new AppError(ErrorCode.CLIENT_NOT_FOUND, ErrorStage.CLIENT_SETUP, `未找到客户端命令：${command}`);
  }
  if (result.error) {
    const timedOut = (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
    throw new AppError(
      ErrorCode.CLIENT_COMMAND_FAILED,
      ErrorStage.CLIENT_SETUP,
      timedOut
        ? `${command} 执行超过 ${options.timeoutMs}ms，已停止`
        : `${command} 无法执行`
    );
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

  const packageId = `${PACKAGE_NAME}@${readPackageVersion()}`;
  return { command: "npx", args: ["-y", packageId], identity: packageId };
}

function toLaunchCommand(command: string, args: string[]): McpLaunchCommand {
  return { command, args, identity: args.at(-1) ?? command };
}

function existingMatches(actual: McpLaunchCommand | undefined, expected: McpLaunchCommand): boolean {
  return actual?.command === expected.command
    && actual.args.length === expected.args.length
    && actual.args.every((argument, index) => argument === expected.args[index]);
}

function existingBelongsToPackage(actual: McpLaunchCommand | undefined, expected: McpLaunchCommand): boolean {
  if (!actual) return false;
  if (expected.command === "npx") {
    return actual.command === "npx"
      && actual.args.length === 2
      && (actual.args[0] === "-y" || actual.args[0] === "--yes")
      // 本项目写入的配置始终锁定精确 SemVer；tag、range 和 npm alias 均不属于本包配置。
      && new RegExp(
        `^${PACKAGE_NAME}@\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z]+(?:\\.[0-9A-Za-z]+)*)?(?:\\+[0-9A-Za-z]+(?:\\.[0-9A-Za-z]+)*)?$`
      ).test(actual.args[1] ?? "");
  }
  return actual.command === expected.command
    && actual.args.length === 1
    && actual.args[0] === expected.identity;
}

/** 解析 CLI 展示的命令行参数，仅用于启动命令一致性核验，不执行其中任何内容。 */
function parseCommandTokens(value: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let escaping = false;
  for (const character of value.trim()) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (quote || escaping) return undefined;
  if (current) tokens.push(current);
  return tokens;
}

function parseCodexInspection(output: string): McpLaunchCommand | undefined {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const transport = parsed.transport;
    if (!transport || typeof transport !== "object" || Array.isArray(transport)) return undefined;
    const command = (transport as Record<string, unknown>).command;
    const args = (transport as Record<string, unknown>).args;
    if (typeof command !== "string" || !Array.isArray(args) || !args.every((item) => typeof item === "string")) {
      return undefined;
    }
    return toLaunchCommand(command, args);
  } catch {
    return undefined;
  }
}

function parseClaudeInspection(output: string): McpLaunchCommand | undefined {
  const command = output.match(/^\s*command\s*:\s*(.+?)\s*$/im)?.[1];
  const rawArgs = output.match(/^\s*args\s*:\s*(.*?)\s*$/im)?.[1];
  if (!command || rawArgs === undefined) return undefined;
  const args = parseCommandTokens(rawArgs);
  return args ? toLaunchCommand(command, args) : undefined;
}

function parseGeminiInspection(output: string): McpLaunchCommand | undefined {
  const line = output.split(/\r?\n/)
    .find((candidate) => /^\s*(?:✓|✗)?\s*swagger-docs\s*:/.test(candidate));
  const rawCommand = line
    ?.match(/^\s*(?:✓|✗)?\s*swagger-docs\s*:\s*(.*?)\s*$/)?.[1]
    ?.replace(/^command\s*:\s*/i, "")
    .replace(/\s+\(stdio\)(?:\s+-\s+.*)?\s*$/, "");
  if (!rawCommand) return undefined;
  const tokens = parseCommandTokens(rawCommand);
  return tokens?.length ? toLaunchCommand(tokens[0]!, tokens.slice(1)) : undefined;
}

interface CliAdapter {
  command: AutomaticClient;
  inspectArgs: string[];
  inspectIsList: boolean;
  addArgs: (expected: McpLaunchCommand) => string[];
  removeArgs: string[];
  parseInspection: (output: string) => McpLaunchCommand | undefined;
}

function cliAdapter(client: AutomaticClient): CliAdapter {
  switch (client) {
    case "codex":
      return {
        command: "codex",
        inspectArgs: ["mcp", "get", SERVER_NAME, "--json"],
        inspectIsList: false,
        addArgs: (expected) => ["mcp", "add", SERVER_NAME, "--", expected.command, ...expected.args],
        removeArgs: ["mcp", "remove", SERVER_NAME],
        parseInspection: parseCodexInspection
      };
    case "claude":
      return {
        command: "claude",
        inspectArgs: ["mcp", "get", SERVER_NAME],
        inspectIsList: false,
        addArgs: (expected) => ["mcp", "add", "--scope", "user", SERVER_NAME, "--", expected.command, ...expected.args],
        removeArgs: ["mcp", "remove", "--scope", "user", SERVER_NAME],
        parseInspection: parseClaudeInspection
      };
    case "gemini":
      return {
        command: "gemini",
        inspectArgs: ["mcp", "list"],
        inspectIsList: true,
        addArgs: (expected) => [
          "mcp", "add", "--scope", "user", SERVER_NAME, expected.command, "--", ...expected.args
        ],
        removeArgs: ["mcp", "remove", "--scope", "user", SERVER_NAME],
        parseInspection: parseGeminiInspection
      };
  }
}

interface ClientInspection {
  found: boolean;
  launch?: McpLaunchCommand;
}

function inspectClient(adapter: CliAdapter, runner: CommandRunner): ClientInspection {
  // 在临时目录执行，避免 Claude/Codex/Gemini 合并当前仓库的项目级 MCP 配置。
  const result = runner(adapter.command, adapter.inspectArgs, {
    cwd: tmpdir(),
    timeoutMs: CLIENT_COMMAND_TIMEOUT_MS
  });
  if (result.status !== 0 && !inspectionMeansMissing(adapter, result)) {
    throw new AppError(
      ErrorCode.CLIENT_COMMAND_FAILED,
      ErrorStage.CLIENT_SETUP,
      formatFailure(adapter.command, result)
    );
  }
  if (result.status !== 0) return { found: false };
  // Codex 的 --json 契约只存在于 stdout；诊断 stderr 不得混入结构化身份数据。
  const rawOutput = adapter.command === "codex" ? result.stdout : `${result.stdout}\n${result.stderr}`;
  // Gemini 仅提供全局 list；归属判断必须限制在目标服务所在行，避免其他服务内容造成误判。
  const serverLinePattern = new RegExp(`(^|\\s)${SERVER_NAME}(?=\\s|:)`);
  const output = adapter.inspectIsList
    ? rawOutput.split(/\r?\n/).filter((line) => serverLinePattern.test(line)).join("\n")
    : rawOutput;
  const found = adapter.inspectIsList ? output.includes(SERVER_NAME) : result.status === 0;
  const launch = adapter.parseInspection(output);
  return launch ? { found, launch } : { found };
}

/** 仅识别客户端已验证的“配置不存在”输出，其他非零退出一律视为检查失败。 */
function inspectionMeansMissing(adapter: CliAdapter, result: CommandResult): boolean {
  const lines = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) return false;
  if (adapter.command === "codex") {
    return lines[0] === `Error: No MCP server named '${SERVER_NAME}' found.`;
  }
  if (adapter.command === "claude") {
    return lines[0] === `No MCP server found with name: "${SERVER_NAME}". Configured servers:`;
  }
  return false;
}

function formatFailure(command: string, result: CommandResult): string {
  return `${command} 执行失败（退出码 ${result.status}）；请直接运行该客户端的 MCP 命令查看详细原因`;
}

/**
 * 删除前再次确认目标配置没有变化，避免检查与删除之间出现的同名配置切换被误删。
 * 客户端 CLI 不提供原子 compare-and-delete，因此这里只用于用户显式发起的卸载。
 */
function removeMatchingAndVerify(
  adapter: CliAdapter,
  target: McpLaunchCommand,
  runner: CommandRunner
): void {
  const latest = inspectClient(adapter, runner);
  if (!latest.found || !existingMatches(latest.launch, target)) {
    throw new AppError(
      ErrorCode.CLIENT_CONFIG_CONFLICT,
      ErrorStage.CLIENT_SETUP,
      `${getClientDefinition(adapter.command).displayName} 配置在删除前发生变化，已停止卸载`
    );
  }
  const removed = runner(adapter.command, adapter.removeArgs);
  if (removed.status !== 0) {
    throw new AppError(ErrorCode.CLIENT_COMMAND_FAILED, ErrorStage.CLIENT_SETUP, formatFailure(adapter.command, removed));
  }
  if (inspectClient(adapter, runner).found) {
    throw new AppError(
      ErrorCode.CLIENT_COMMAND_FAILED,
      ErrorStage.CLIENT_SETUP,
      `${getClientDefinition(adapter.command).displayName} 删除命令执行后同名配置仍然存在`
    );
  }
}

/**
 * 幂等安装 MCP 客户端配置。任何同名冲突都拒绝覆盖；升级仅做安全检查，
 * 当前客户端 CLI 无法保证完整、原子恢复旧配置时不会进入删除或写入流程。
 */
export function setupClient(
  client: SupportedClient,
  options: SetupOptions,
  runner: CommandRunner = runCommand
): string {
  const expected = serverCommand(options.local);
  if (!isAutomaticClient(client)) {
    if (options.upgrade) {
      throw new AppError(
        ErrorCode.INVALID_CLI_ARGUMENT,
        ErrorStage.CLIENT_SETUP,
        `${getClientDefinition(client).displayName} 不支持自动升级；请重新生成配置并手动更新`
      );
    }
    return JSON.stringify(createClientConfig(client, expected), null, 2);
  }

  const adapter = cliAdapter(client);
  const inspected = inspectClient(adapter, runner);
  if (!inspected.found && options.upgrade) {
    throw new AppError(
      ErrorCode.CLIENT_NOT_FOUND,
      ErrorStage.CLIENT_SETUP,
      `${getClientDefinition(client).displayName} 未找到可升级的 ${SERVER_NAME} 配置；请先执行 setup ${client}`
    );
  }
  if (inspected.found) {
    if (existingMatches(inspected.launch, expected)) {
      return `${getClientDefinition(client).displayName} 已存在相同的 ${SERVER_NAME} 配置，无需重复安装。`;
    }
    const belongsToPackage = existingBelongsToPackage(inspected.launch, expected);
    if (!belongsToPackage) {
      throw new AppError(
        ErrorCode.CLIENT_CONFIG_CONFLICT,
        ErrorStage.CLIENT_SETUP,
        options.upgrade
          ? `拒绝升级：${getClientDefinition(client).displayName} 中同名配置不属于当前 swagger-docs-mcp`
          : `${getClientDefinition(client).displayName} 已存在同名外部配置；请手动迁移或更名，setup 不会覆盖`,
        { details: { expected: expected.identity, ownership: "foreign" } }
      );
    }
    if (!options.upgrade) {
      throw new AppError(
        ErrorCode.CLIENT_CONFIG_CONFLICT,
        ErrorStage.CLIENT_SETUP,
        `${getClientDefinition(client).displayName} 已安装其他版本；请先备份客户端配置并手动升级`,
        { details: { expected: expected.identity, ownership: "same-package" } }
      );
    }
    throw new AppError(
      ErrorCode.CLIENT_CONFIG_CONFLICT,
      ErrorStage.CLIENT_SETUP,
      `拒绝自动升级：${getClientDefinition(client).displayName} CLI 无法提供可验证的原子替换与完整回滚；请备份后手动更新启动命令`,
      { details: { expected: expected.identity, ownership: "same-package", recovery: "manual" } }
    );
  }

  const added = runner(adapter.command, adapter.addArgs(expected));
  if (added.status !== 0) {
    throw new AppError(
      ErrorCode.CLIENT_COMMAND_FAILED,
      ErrorStage.CLIENT_SETUP,
      `${formatFailure(adapter.command, added)}；为避免误删并发写入的同名配置，未执行自动清理，请手动检查`,
      { details: { expected: expected.identity, cleanup: "skipped" } }
    );
  }

  const verified = inspectClient(adapter, runner);
  if (!verified.found || !existingMatches(verified.launch, expected)) {
    throw new AppError(
      ErrorCode.CLIENT_COMMAND_FAILED,
      ErrorStage.CLIENT_SETUP,
      `${getClientDefinition(client).displayName} 配置写入后未通过启动命令一致性核验；为避免误删同名配置，未执行自动清理，请手动检查`,
      { details: { expected: expected.identity, cleanup: "skipped" } }
    );
  }
  return `${getClientDefinition(client).displayName} 配置已写入并通过启动命令一致性核验：${SERVER_NAME}，命令：${expected.command} ${expected.args.join(" ")}`;
}

/** 仅卸载能够确认属于 swagger-docs-mcp 的自动客户端配置，避免误删同名外部服务。 */
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
  if (!existingBelongsToPackage(inspected.launch, expected)) {
    throw new AppError(
      ErrorCode.CLIENT_CONFIG_CONFLICT,
      ErrorStage.CLIENT_SETUP,
      `拒绝删除：${getClientDefinition(client).displayName} 中同名配置不属于当前 swagger-docs-mcp`,
      { details: { expected: expected.identity, ownership: "foreign" } }
    );
  }

  removeMatchingAndVerify(adapter, inspected.launch!, runner);
  return `${getClientDefinition(client).displayName} 已卸载 ${SERVER_NAME}。`;
}
