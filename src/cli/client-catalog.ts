export const SUPPORTED_CLIENT_IDS = [
  "codex",
  "claude",
  "gemini",
  "vscode",
  "cursor",
  "windsurf",
  "trae",
  "cline",
  "roo",
  "kiro",
  "opencode"
] as const;

export type SupportedClient = (typeof SUPPORTED_CLIENT_IDS)[number];
export type AutomaticClient = Extract<SupportedClient, "codex" | "claude" | "gemini">;

/** 客户端安装模式：自动模式会调用官方 CLI，配置模式只生成配置且不写用户文件。 */
export enum ClientSetupMode {
  AUTOMATIC = "automatic",
  CONFIG = "config"
}

/** 客户端配置结构。新增客户端时必须显式选择结构，避免误套通用 JSON。 */
export enum ClientConfigShape {
  MCP_SERVERS = "mcp_servers",
  VSCODE_SERVERS = "vscode_servers",
  OPENCODE_V2 = "opencode_v2"
}

export interface McpLaunchCommand {
  command: string;
  args: string[];
  identity: string;
}

export interface ClientDefinition {
  id: SupportedClient;
  displayName: string;
  aliases: readonly string[];
  setupMode: ClientSetupMode;
  configShape?: ClientConfigShape;
  configLocation: string;
  verifyHint: string;
}

const CLIENT_DEFINITIONS: readonly ClientDefinition[] = [
  {
    id: "codex",
    displayName: "OpenAI Codex",
    aliases: [],
    setupMode: ClientSetupMode.AUTOMATIC,
    configLocation: "Codex 用户级 MCP 配置",
    verifyHint: "codex mcp get swagger-docs"
  },
  {
    id: "claude",
    displayName: "Claude Code",
    aliases: ["claude-code"],
    setupMode: ClientSetupMode.AUTOMATIC,
    configLocation: "Claude Code 用户级 MCP 配置",
    verifyHint: "claude mcp get swagger-docs"
  },
  {
    id: "gemini",
    displayName: "Gemini CLI",
    aliases: ["gemini-cli"],
    setupMode: ClientSetupMode.AUTOMATIC,
    configLocation: "~/.gemini/settings.json",
    verifyHint: "gemini mcp list"
  },
  {
    id: "vscode",
    displayName: "VS Code / GitHub Copilot",
    aliases: ["vs-code", "copilot", "github-copilot"],
    setupMode: ClientSetupMode.CONFIG,
    configShape: ClientConfigShape.VSCODE_SERVERS,
    configLocation: "VS Code 用户配置或工作区 .vscode/mcp.json",
    verifyHint: "在 MCP: List Servers 中查看 swagger-docs"
  },
  {
    id: "cursor",
    displayName: "Cursor",
    aliases: [],
    setupMode: ClientSetupMode.CONFIG,
    configShape: ClientConfigShape.MCP_SERVERS,
    configLocation: "~/.cursor/mcp.json 或项目 .cursor/mcp.json",
    verifyHint: "在 Cursor MCP 设置中查看 swagger-docs"
  },
  {
    id: "windsurf",
    displayName: "Windsurf",
    aliases: [],
    setupMode: ClientSetupMode.CONFIG,
    configShape: ClientConfigShape.MCP_SERVERS,
    configLocation: "~/.codeium/windsurf/mcp_config.json",
    verifyHint: "在 Windsurf Settings > Cascade > MCP Servers 中查看"
  },
  {
    id: "trae",
    displayName: "Trae",
    aliases: [],
    setupMode: ClientSetupMode.CONFIG,
    configShape: ClientConfigShape.MCP_SERVERS,
    configLocation: "Trae MCP 设置界面",
    verifyHint: "在 Agent 的 MCP 工具列表中查看 swagger-docs"
  },
  {
    id: "cline",
    displayName: "Cline",
    aliases: [],
    setupMode: ClientSetupMode.CONFIG,
    configShape: ClientConfigShape.MCP_SERVERS,
    configLocation: "Cline IDE 配置界面；CLI 可使用 ~/.cline/mcp.json",
    verifyHint: "在 Cline MCP Servers 中确认工具已加载"
  },
  {
    id: "roo",
    displayName: "Roo Code",
    aliases: ["roo-code"],
    setupMode: ClientSetupMode.CONFIG,
    configShape: ClientConfigShape.MCP_SERVERS,
    configLocation: "Roo Code 全局 MCP 设置或项目 .roo/mcp.json",
    verifyHint: "在 Roo Code MCP Servers 中确认工具已加载"
  },
  {
    id: "kiro",
    displayName: "Kiro",
    aliases: ["kiro-cli"],
    setupMode: ClientSetupMode.CONFIG,
    configShape: ClientConfigShape.MCP_SERVERS,
    configLocation: "~/.kiro/settings/mcp.json 或项目 .kiro/settings/mcp.json",
    verifyHint: "在 Kiro 会话中运行 /mcp"
  },
  {
    id: "opencode",
    displayName: "OpenCode v2",
    aliases: ["open-code"],
    setupMode: ClientSetupMode.CONFIG,
    configShape: ClientConfigShape.OPENCODE_V2,
    configLocation: "OpenCode v2 配置的 mcp.servers 节点",
    verifyHint: "运行 opencode2 mcp list"
  }
];

const DEFINITION_BY_ID = new Map(CLIENT_DEFINITIONS.map((definition) => [definition.id, definition]));
const CLIENT_BY_INPUT = new Map<string, SupportedClient>();
for (const definition of CLIENT_DEFINITIONS) {
  CLIENT_BY_INPUT.set(definition.id, definition.id);
  for (const alias of definition.aliases) {
    CLIENT_BY_INPUT.set(alias, definition.id);
  }
}

/** 将用户输入的正式名称或稳定别名归一化为客户端 ID；未知输入返回 undefined。 */
export function normalizeClient(value: string | undefined): SupportedClient | undefined {
  return value ? CLIENT_BY_INPUT.get(value.toLowerCase()) : undefined;
}

/** 返回客户端的集中定义。调用方不应自行复制配置位置或安装模式。 */
export function getClientDefinition(client: SupportedClient): ClientDefinition {
  const definition = DEFINITION_BY_ID.get(client);
  if (!definition) {
    throw new Error(`缺少客户端定义：${client}`);
  }
  return definition;
}

export function isAutomaticClient(client: SupportedClient): client is AutomaticClient {
  return getClientDefinition(client).setupMode === ClientSetupMode.AUTOMATIC;
}

/**
 * 按客户端官方结构生成 stdio 配置。此方法只返回对象，不读取或修改客户端配置文件。
 */
export function createClientConfig(client: SupportedClient, launch: McpLaunchCommand): Record<string, unknown> {
  const definition = getClientDefinition(client);
  if (!definition.configShape) {
    throw new Error(`${definition.displayName} 使用官方 CLI 安装，不提供手工配置结构`);
  }

  const stdio = {
    command: launch.command,
    args: launch.args,
    env: {}
  };

  switch (definition.configShape) {
    case ClientConfigShape.MCP_SERVERS:
      return { mcpServers: { "swagger-docs": stdio } };
    case ClientConfigShape.VSCODE_SERVERS:
      return { servers: { "swagger-docs": stdio } };
    case ClientConfigShape.OPENCODE_V2:
      return {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          servers: {
            "swagger-docs": {
              type: "local",
              command: [launch.command, ...launch.args],
              codemode: false
            }
          }
        }
      };
  }
}

/** 输出面向用户的客户端能力清单，供 setup list 和帮助信息复用。 */
export function formatClientCatalog(): string {
  const rows = CLIENT_DEFINITIONS.map((definition) => {
    const mode = definition.setupMode === ClientSetupMode.AUTOMATIC
      ? "自动写入并核验启动命令一致性"
      : "生成配置，不写文件";
    return `- ${definition.id}: ${definition.displayName}；${mode}；${definition.configLocation}`;
  });
  return ["支持的 MCP 客户端：", ...rows].join("\n");
}
