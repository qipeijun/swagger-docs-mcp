import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Completeness, type InspectionEnvelope, type ToolEnvelope } from "../domain/types.js";
import { toAppError } from "../errors.js";
import { ApiDocsService } from "../service/api-docs-service.js";
import { readPackageVersion } from "../version.js";
import {
  categoriesDataOutputSchema,
  categoryDataOutputSchema,
  createToolOutputSchema,
  inspectDataOutputSchema,
  pathDataOutputSchema,
  searchDataOutputSchema
} from "./output-schemas.js";

const docsUrlSchema = z.url({ protocol: /^https?$/ }).describe("本次查询的 doc.html 或 Swagger JSON 完整地址");
const groupSchema = z.string().min(1).optional().describe("多分组文档的精确分组名；只有一个分组时可省略");
const pageSchema = z.number().int().min(1).default(1).describe("页码，从 1 开始");
const pageSizeSchema = z.number().int().min(1).max(100).default(20).describe("每页数量，最大 100");
function successResult<T>(envelope: ToolEnvelope<T> | InspectionEnvelope): CallToolResult {
  return {
    content: [{
      type: "text",
      text: `${envelope.sourceNotice}\n\n${JSON.stringify(envelope, null, 2)}`
    }],
    structuredContent: envelope as unknown as Record<string, unknown>
  };
}

function errorResult(error: unknown, requestedUrl?: string): CallToolResult {
  const appError = toAppError(error, requestedUrl);
  const failedAt = new Date().toISOString();
  const sourceNotice = `本次查询文档失败：${appError.requestedUrl ?? requestedUrl ?? "未提供地址"}；失败阶段：${appError.stage}；失败时间：${failedAt}；未返回任何历史文档。`;
  const payload = {
    source: {
      requestedUrl: appError.requestedUrl ?? requestedUrl ?? "",
      failedAt,
      fetchMode: "live",
      cacheUsed: false
    },
    sourceNotice,
    data: {},
    error: {
      code: appError.code,
      stage: appError.stage,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {})
    },
    ...(typeof appError.details?.nextAction === "string"
      ? { nextAction: appError.details.nextAction }
      : {}),
    warnings: [],
    completeness: Completeness.PARTIAL
  };
  return {
    isError: true,
    content: [{ type: "text", text: `${sourceNotice}\n\n${JSON.stringify(payload, null, 2)}` }],
    structuredContent: payload
  };
}

/** 创建无状态、只读的 MCP Server；可注入 Service 以便测试或扩展文档解析能力。 */
export function createMcpServer(service = new ApiDocsService()): McpServer {
  const server = new McpServer({
    name: "swagger-docs-mcp",
    version: readPackageVersion()
  }, {
    instructions: "不要仅因用户消息中出现文档 URL 就调用工具。只有用户明确表达查询、调试、搜索、列出或分析接口文档的意图，或者当前对话刚由 Agent 主动索要 docsUrl 时，才调用 inspect_api_docs。孤立 URL 应先询问用户希望执行什么操作。调用后根据 nextAction 引导选择；nextAction=get_api_detail 时直接用已验证的 group/path/method 调用 get_api_by_path。所有回答必须保留 sourceNotice，不猜测未验证的 hash 线索。"
  });
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  } as const;

  server.registerTool("inspect_api_docs", {
    title: "检查 Swagger 文档地址",
    description: "检查 doc.html、Knife4j hash 深链接或 Swagger JSON 地址，实时验证 hash 中的分组、分类和 operationId 线索，返回候选项与下一步操作（nextAction）。",
    inputSchema: z.object({
      docsUrl: docsUrlSchema,
      page: pageSchema,
      pageSize: pageSizeSchema
    }),
    outputSchema: createToolOutputSchema(inspectDataOutputSchema),
    annotations
  }, async ({ docsUrl, page, pageSize }) => {
    try {
      return successResult(await service.inspect(docsUrl, page, pageSize));
    } catch (error) {
      return errorResult(error, docsUrl);
    }
  });

  server.registerTool("list_api_categories", {
    title: "列出 Swagger 接口分类",
    description: "实时读取指定 docsUrl，列出分类及接口数量。",
    inputSchema: z.object({
      docsUrl: docsUrlSchema,
      group: groupSchema,
      page: pageSchema,
      pageSize: pageSizeSchema
    }),
    outputSchema: createToolOutputSchema(categoriesDataOutputSchema),
    annotations
  }, async ({ docsUrl, group, page, pageSize }) => {
    try {
      return successResult(await service.listCategories(docsUrl, group, page, pageSize));
    } catch (error) {
      return errorResult(error, docsUrl);
    }
  });

  server.registerTool("get_api_category", {
    title: "查询 Swagger 接口分类",
    description: "按精确分类名实时查询接口。summary 返回摘要，full 返回请求和递归响应 Schema。",
    inputSchema: z.object({
      docsUrl: docsUrlSchema,
      group: groupSchema,
      category: z.string().min(1).describe("Swagger tags 中的精确分类名"),
      detailLevel: z.enum(["summary", "full"]).default("summary").describe("返回摘要或完整接口文档"),
      page: pageSchema,
      pageSize: pageSizeSchema
    }),
    outputSchema: createToolOutputSchema(categoryDataOutputSchema),
    annotations
  }, async ({ docsUrl, group, category, detailLevel, page, pageSize }) => {
    try {
      return successResult(await service.getCategory({
        docsUrl,
        ...(group ? { group } : {}),
        category,
        detailLevel,
        page,
        pageSize
      }));
    } catch (error) {
      return errorResult(error, docsUrl);
    }
  });

  server.registerTool("get_api_by_path", {
    title: "按路径查询 Swagger 接口",
    description: "按精确路径和可选 HTTP Method 实时查询完整接口文档，返回递归 schemaTree 和 flatFields。",
    inputSchema: z.object({
      docsUrl: docsUrlSchema,
      group: groupSchema,
      path: z.string().startsWith("/").describe("Swagger paths 中的精确接口路径"),
      method: z.string().min(1).optional().describe("HTTP Method；同一路径有多个方法时必须提供")
    }),
    outputSchema: createToolOutputSchema(pathDataOutputSchema),
    annotations
  }, async ({ docsUrl, group, path, method }) => {
    try {
      return successResult(await service.getByPath({
        docsUrl,
        ...(group ? { group } : {}),
        path,
        ...(method ? { method } : {})
      }));
    } catch (error) {
      return errorResult(error, docsUrl);
    }
  });

  server.registerTool("search_apis", {
    title: "搜索 Swagger 接口",
    description: "在指定实时 Swagger 文档中搜索路径、摘要、描述、分类和 operationId。",
    inputSchema: z.object({
      docsUrl: docsUrlSchema,
      group: groupSchema,
      keyword: z.string().trim().min(1).describe("搜索关键词，不能仅包含空白字符"),
      page: pageSchema,
      pageSize: pageSizeSchema
    }),
    outputSchema: createToolOutputSchema(searchDataOutputSchema),
    annotations
  }, async ({ docsUrl, group, keyword, page, pageSize }) => {
    try {
      return successResult(await service.search({
        docsUrl,
        ...(group ? { group } : {}),
        keyword,
        page,
        pageSize
      }));
    } catch (error) {
      return errorResult(error, docsUrl);
    }
  });

  return server;
}
