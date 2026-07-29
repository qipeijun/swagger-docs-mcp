import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/server/create-server.js";
import { swagger2Fixture } from "./fixtures/swagger2.js";
import { sendJson, startHttpServer, type TestHttpServer } from "./helpers/http-server.js";

describe("MCP 协议集成", () => {
  let httpServer: TestHttpServer;
  let docsUrl: string;
  let client: Client;
  const mcpServer = createMcpServer();

  beforeAll(async () => {
    httpServer = await startHttpServer((request, response) => {
      if (request.url === "/doc.html") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<html></html>");
        return;
      }
      if (request.url === "/swagger-resources") {
        return sendJson(response, [{ name: "default", location: "/v2/api-docs" }]);
      }
      sendJson(response, swagger2Fixture);
    });
    docsUrl = `${httpServer.origin}/v2/api-docs`;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "integration-test", version: "1.0.0" });
    await Promise.all([
      mcpServer.connect(serverTransport),
      client.connect(clientTransport)
    ]);
  });

  it("通过 inspect_api_docs 验证深链接并返回下一步", async () => {
    const result = await client.callTool({
      name: "inspect_api_docs",
      arguments: {
        docsUrl: `${httpServer.origin}/doc.html#/default/uniform-study-exam-stat-controller/getBaselineClassStat`
      }
    });
    const structured = result.structuredContent as {
      data: {
        nextAction: string;
        selection: { api: { value: { path: string; method: string }; verified: boolean } };
      };
    };
    expect(result.isError).not.toBe(true);
    expect(structured.data).toMatchObject({
      nextAction: "get_api_detail",
      selection: {
        api: {
          value: { path: "/api/v1/study-exam-stat/baseline-class-stat", method: "POST" },
          verified: true
        }
      }
    });
  });

  afterAll(async () => {
    await client.close();
    await mcpServer.close();
    await httpServer.close();
  });

  it("列出五个稳定 Tool", async () => {
    const result = await client.listTools();
    expect(client.getInstructions()).toContain("inspect_api_docs");
    expect(client.getInstructions()).toContain("孤立 URL 应先询问");
    expect(result.tools.find((tool) => tool.name === "inspect_api_docs")?.description)
      .toContain("不要因为消息中只有 URL 就调用");
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "get_api_by_path",
      "get_api_category",
      "inspect_api_docs",
      "list_api_categories",
      "search_apis"
    ]);
  });

  it("通过真实 tools/call 返回结构化来源和递归字段", async () => {
    const result = await client.callTool({
      name: "get_api_by_path",
      arguments: {
        docsUrl,
        path: "/api/v1/study-exam-stat/baseline-class-stat",
        method: "POST"
      }
    });
    const structured = result.structuredContent as {
      sourceNotice: string;
      data: { response: { flatFields: Array<{ path: string }> } };
    };
    expect(result.isError).not.toBe(true);
    expect(structured.sourceNotice).toContain(docsUrl);
    expect(structured.data.response.flatFields.map((field) => field.path)).toContain(
      "data[].baselineDetailList[].students[].studentId"
    );
  });

  it("失败响应也保留地址、阶段且不返回历史数据", async () => {
    const result = await client.callTool({
      name: "get_api_by_path",
      arguments: { docsUrl, path: "/not-found" }
    });
    const structured = result.structuredContent as {
      sourceNotice: string;
      source: { requestedUrl: string; cacheUsed: boolean };
      error: { code: string; stage: string };
    };
    expect(result.isError).toBe(true);
    expect(structured.source.requestedUrl).toBe(docsUrl);
    expect(structured.source.cacheUsed).toBe(false);
    expect(structured.sourceNotice).toContain("未返回任何历史文档");
    expect(structured.error).toMatchObject({ code: "PATH_NOT_FOUND", stage: "query_document" });
  });
});
