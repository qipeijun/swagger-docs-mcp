import { afterEach, describe, expect, it } from "vitest";
import { ApiDocumentType, NavigationNextAction } from "../src/domain/types.js";
import { ApiDocsService } from "../src/service/api-docs-service.js";
import { swagger2Fixture } from "./fixtures/swagger2.js";
import { sendJson, startHttpServer, type TestHttpServer } from "./helpers/http-server.js";

describe("文档地址导航", () => {
  const servers: TestHttpServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  async function startKnife4jServer(): Promise<TestHttpServer> {
    const server = await startHttpServer((request, response) => {
      if (request.url === "/swagger-resources") {
        return sendJson(response, [{ name: "default", location: "/v2/api-docs" }]);
      }
      if (request.url === "/v2/api-docs") return sendJson(response, swagger2Fixture);
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><html></html>");
    });
    servers.push(server);
    return server;
  }

  it("根地址自动进入唯一分组并返回分类", async () => {
    const server = await startKnife4jServer();
    const docsUrl = `${server.origin}/doc.html#`;
    const result = await new ApiDocsService().inspect(docsUrl, 1, 20);

    expect(result.source).toMatchObject({
      requestedUrl: docsUrl,
      documentEntryUrl: `${server.origin}/doc.html`,
      resolvedSpecUrl: `${server.origin}/v2/api-docs`,
      group: "default",
      cacheUsed: false
    });
    expect(result.data).toMatchObject({
      documentType: ApiDocumentType.KNIFE4J_UI,
      selection: { group: { value: { name: "default" }, verified: true } },
      nextAction: NavigationNextAction.SELECT_CATEGORY
    });
    expect(result.data.candidates.categories?.pagination.total).toBe(2);
    expect(server.requests[0]).toBe("/doc.html");
    expect(result.sourceNotice).toMatch(
      new RegExp(
        `^Swagger 来源：测试教学平台（Knife4j 分组：default）；\\[文档入口\\]\\(<${server.origin}/doc\\.html>\\)；`
        + `\\[Swagger JSON\\]\\(<${server.origin}/v2/api-docs>\\)；`
        + "获取时间：\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}（北京时间）；实时获取，未使用缓存。$"
      )
    );
  });

  it("分类链接返回该分类接口候选", async () => {
    const server = await startKnife4jServer();
    const result = await new ApiDocsService().inspect(
      `${server.origin}/doc.html#/default/uniform-study-exam-stat-controller`,
      1,
      20
    );
    expect(result.data.nextAction).toBe(NavigationNextAction.SELECT_API);
    expect(result.data.selection.category).toEqual({
      value: { name: "uniform-study-exam-stat-controller" },
      verified: true
    });
    expect(result.data.candidates.apis?.pagination.total).toBe(2);
  });

  it("完整深链接精确映射到真实 path 和 method", async () => {
    const server = await startKnife4jServer();
    const docsUrl = `${server.origin}/doc.html#/default/uniform-study-exam-stat-controller/getBaselineClassStat`;
    const result = await new ApiDocsService().inspect(docsUrl, 1, 20);

    expect(result.data.nextAction).toBe(NavigationNextAction.GET_API_DETAIL);
    expect(result.data.selection.api).toEqual({
      value: {
        operationId: "getBaselineClassStat",
        path: "/api/v1/study-exam-stat/baseline-class-stat",
        method: "POST"
      },
      verified: true
    });
    expect(result.sourceNotice).toContain("测试教学平台（Knife4j 分组：default）");
  });

  it("错误 hash 线索只返回候选，不自动猜测", async () => {
    const server = await startKnife4jServer();
    const service = new ApiDocsService();
    const invalidGroup = await service.inspect(
      `${server.origin}/doc.html#/stale/uniform-study-exam-stat-controller/getBaselineClassStat`,
      1,
      20
    );
    expect(invalidGroup.data.nextAction).toBe(NavigationNextAction.SELECT_GROUP);
    expect(invalidGroup.data.selection.group?.verified).toBe(false);
    expect(invalidGroup.data.candidates.groups).toEqual([{ name: "default" }]);

    const invalidCategory = await service.inspect(
      `${server.origin}/doc.html#/default/stale-controller/getBaselineClassStat`,
      1,
      20
    );
    expect(invalidCategory.data.nextAction).toBe(NavigationNextAction.SELECT_CATEGORY);
    expect(invalidCategory.data.selection.category?.verified).toBe(false);
    expect(invalidCategory.warnings.join(" ")).toContain("未通过实时文档验证");
  });

  it("多分组且无有效线索时返回分组选择", async () => {
    const server = await startHttpServer((request, response) => {
      if (request.url === "/swagger-resources") {
        return sendJson(response, [
          { name: "backend-a", location: "/a/api-docs" },
          { name: "backend-b", location: "/b/api-docs" }
        ]);
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html></html>");
    });
    servers.push(server);
    const result = await new ApiDocsService().inspect(`${server.origin}/doc.html#`, 1, 20);
    expect(result.source.resolvedSpecUrl).toBeUndefined();
    expect(result.data.nextAction).toBe(NavigationNextAction.SELECT_GROUP);
    expect(result.data.candidates.groups).toEqual([{ name: "backend-a" }, { name: "backend-b" }]);
    expect(result.sourceNotice).toContain("尚未选择分组");
    expect(server.requests).toEqual(["/doc.html", "/swagger-resources"]);
  });

  it("直接 Swagger JSON 地址跳过 UI 分组发现", async () => {
    const server = await startHttpServer((_request, response) => sendJson(response, swagger2Fixture));
    servers.push(server);
    const result = await new ApiDocsService().inspect(`${server.origin}/v2/api-docs`, 1, 20);
    expect(result.data.documentType).toBe(ApiDocumentType.SWAGGER_JSON);
    expect(result.data.groups).toEqual([]);
    expect(result.data.nextAction).toBe(NavigationNextAction.SELECT_CATEGORY);
    expect(server.requests).toEqual(["/v2/api-docs"]);
  });
});
