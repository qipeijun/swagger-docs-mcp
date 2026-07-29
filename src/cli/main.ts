import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AppError, ErrorCode, ErrorStage, toAppError } from "../errors.js";
import { createMcpServer } from "../server/create-server.js";
import { ApiDocsService } from "../service/api-docs-service.js";
import { readPackageVersion } from "../version.js";
import { formatClientCatalog, normalizeClient, type SupportedClient } from "./client-catalog.js";
import { removeClient, setupClient } from "./client-setup.js";

function writeLine(message = ""): void {
  process.stdout.write(`${message}\n`);
}

function printHelp(): void {
  writeLine(`swagger-docs-mcp ${readPackageVersion()}

用法：
  swagger-docs-mcp                         启动 stdio MCP 服务
  swagger-docs-mcp serve                   启动 stdio MCP 服务
  swagger-docs-mcp doctor [docsUrl] [--group <name>]
  swagger-docs-mcp setup list
  swagger-docs-mcp setup <client> [--local]
  swagger-docs-mcp upgrade <client> [--local]
  swagger-docs-mcp remove <client> [--local]
  swagger-docs-mcp --version
  swagger-docs-mcp --help

说明：
  setup 只安装或生成 MCP 启动配置，不保存任何 Swagger 文档地址。
  Codex、Claude Code、Gemini CLI 自动写入并核验启动命令；其他客户端输出可粘贴 JSON。
  upgrade 仅检查旧版本配置归属；无法保证完整回滚时会停止并要求手动升级。`);
}

export type ParsedCliCommand =
  | { command: "serve" }
  | { command: "help" }
  | { command: "version" }
  | { command: "doctor"; docsUrl?: string; group?: string }
  | { command: "setup-list" }
  | { command: "setup"; client: string; local: boolean }
  | { command: "upgrade"; client: string; local: boolean }
  | { command: "remove"; client: string; local: boolean };

function invalidArgument(message: string): never {
  throw new AppError(ErrorCode.INVALID_CLI_ARGUMENT, ErrorStage.CLIENT_SETUP, message);
}

function parseClientFlags(args: string[]): {
  client: string;
  local: boolean;
} {
  const positionals: string[] = [];
  const seen = new Set<string>();
  for (const argument of args) {
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }
    if (argument !== "--local") {
      invalidArgument(`未知选项：${argument}`);
    }
    if (seen.has(argument)) invalidArgument(`选项不能重复：${argument}`);
    seen.add(argument);
  }
  if (positionals.length !== 1) invalidArgument("必须且只能指定一个客户端");
  return {
    client: positionals[0]!,
    local: seen.has("--local")
  };
}

/** 严格解析 CLI 参数；未知选项、重复选项和多余位置参数都会立即失败。 */
export function parseCliArguments(args: string[]): ParsedCliCommand {
  const command = args[0];
  if (!command) return { command: "serve" };
  if (command === "serve") {
    if (args.length !== 1) invalidArgument("serve 不接受额外参数");
    return { command: "serve" };
  }
  if (command === "--help" || command === "-h" || command === "help") {
    if (args.length !== 1) invalidArgument("help 不接受额外参数");
    return { command: "help" };
  }
  if (command === "--version" || command === "-v") {
    if (args.length !== 1) invalidArgument("version 不接受额外参数");
    return { command: "version" };
  }
  if (command === "doctor") {
    let docsUrl: string | undefined;
    let group: string | undefined;
    for (let index = 1; index < args.length; index += 1) {
      const argument = args[index]!;
      if (argument === "--group") {
        if (group !== undefined) invalidArgument("--group 不能重复");
        const value = args[index + 1];
        if (!value || value.startsWith("-")) invalidArgument("--group 必须提供分组名称");
        group = value;
        index += 1;
      } else if (argument.startsWith("-")) {
        invalidArgument(`未知选项：${argument}`);
      } else if (docsUrl === undefined) {
        docsUrl = argument;
      } else {
        invalidArgument(`doctor 不接受额外参数：${argument}`);
      }
    }
    if (group && !docsUrl) invalidArgument("--group 必须与 docsUrl 一起使用");
    return { command: "doctor", ...(docsUrl ? { docsUrl } : {}), ...(group ? { group } : {}) };
  }
  if (command === "setup") {
    if (args[1] === "list") {
      if (args.length !== 2) invalidArgument("setup list 不接受额外参数");
      return { command: "setup-list" };
    }
    const parsed = parseClientFlags(args.slice(1));
    return { command: "setup", ...parsed };
  }
  if (command === "upgrade") {
    const parsed = parseClientFlags(args.slice(1));
    return { command: "upgrade", client: parsed.client, local: parsed.local };
  }
  if (command === "remove") {
    const parsed = parseClientFlags(args.slice(1));
    return { command: "remove", client: parsed.client, local: parsed.local };
  }
  invalidArgument(`未知命令：${command}。使用 --help 查看帮助。`);
}

async function serve(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());

  const close = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}

async function doctor(docsUrl?: string, group?: string): Promise<void> {
  writeLine(`swagger-docs-mcp: ${readPackageVersion()}`);
  writeLine(`Node.js: ${process.version}`);
  const majorVersion = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(majorVersion) || majorVersion < 20) {
    throw new AppError(
      ErrorCode.UNSUPPORTED_NODE_VERSION,
      ErrorStage.RUNTIME_CHECK,
      `需要 Node.js 20 或更高版本，当前为 ${process.version}`
    );
  }
  writeLine("数据源保存：禁用");
  writeLine("跨调用缓存：禁用");
  if (!docsUrl) {
    writeLine("运行状态：正常。传入 docsUrl 可继续验证实时文档发现。 ");
    return;
  }

  const loaded = await new ApiDocsService().load(docsUrl, group);
  writeLine(loaded.sourceNotice);
  writeLine(`接口数量：${loaded.document.operations.length}`);
  writeLine(`文档指纹：${loaded.source.documentFingerprint}`);
}

function parseClient(value: string | undefined): SupportedClient {
  const client = normalizeClient(value);
  if (!client) {
    throw new AppError(
      ErrorCode.CLIENT_NOT_FOUND,
      ErrorStage.CLIENT_SETUP,
      "未知客户端。运行 swagger-docs-mcp setup list 查看支持范围"
    );
  }
  return client;
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseCliArguments(args);
  if (parsed.command === "serve") {
    await serve();
    return;
  }
  if (parsed.command === "help") {
    printHelp();
    return;
  }
  if (parsed.command === "version") {
    writeLine(readPackageVersion());
    return;
  }
  if (parsed.command === "doctor") {
    await doctor(parsed.docsUrl, parsed.group);
    return;
  }
  if (parsed.command === "setup-list") {
    writeLine(formatClientCatalog());
    return;
  }
  if (parsed.command === "setup") {
    const client = parseClient(parsed.client);
    writeLine(setupClient(client, {
      local: parsed.local
    }));
    return;
  }
  if (parsed.command === "upgrade") {
    const client = parseClient(parsed.client);
    writeLine(setupClient(client, {
      local: parsed.local,
      upgrade: true
    }));
    return;
  }
  const client = parseClient(parsed.client);
  writeLine(removeClient(client, parsed.local));
}

export function reportCliError(error: unknown): void {
  const appError = error instanceof AppError ? error : toAppError(error);
  process.stderr.write(`[${appError.code}] ${appError.message}\n`);
}
