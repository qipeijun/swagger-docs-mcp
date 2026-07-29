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
  swagger-docs-mcp setup <client> [--replace] [--local]
  swagger-docs-mcp remove <client> [--local]
  swagger-docs-mcp --version
  swagger-docs-mcp --help

说明：
  setup 只安装或生成 MCP 启动配置，不保存任何 Swagger 文档地址。
  Codex、Claude Code、Gemini CLI 自动安装；其他客户端输出可粘贴 JSON。`);
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
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

async function doctor(args: string[]): Promise<void> {
  const docsUrl = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
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

  const group = optionValue(args, "--group");
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
  const command = args[0];
  if (!command || command === "serve") {
    await serve();
    return;
  }
  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }
  if (command === "--version" || command === "-v") {
    writeLine(readPackageVersion());
    return;
  }
  if (command === "doctor") {
    await doctor(args.slice(1));
    return;
  }
  if (command === "setup") {
    if (args[1] === "list") {
      writeLine(formatClientCatalog());
      return;
    }
    const client = parseClient(args[1]);
    writeLine(setupClient(client, {
      replace: args.includes("--replace"),
      local: args.includes("--local")
    }));
    return;
  }
  if (command === "remove") {
    const client = parseClient(args[1]);
    writeLine(removeClient(client, args.includes("--local")));
    return;
  }

  throw new AppError(
    ErrorCode.INVALID_CLI_ARGUMENT,
    ErrorStage.CLIENT_SETUP,
    `未知命令：${command}。使用 --help 查看帮助。`
  );
}

export function reportCliError(error: unknown): void {
  const appError = error instanceof AppError ? error : toAppError(error);
  process.stderr.write(`[${appError.code}] ${appError.message}\n`);
  if (appError.details) {
    process.stderr.write(`${JSON.stringify(appError.details, null, 2)}\n`);
  }
}
