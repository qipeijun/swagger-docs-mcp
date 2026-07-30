import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Completeness } from "../src/domain/types.js";
import { ErrorCode } from "../src/errors.js";
import { ApiDocsService } from "../src/service/api-docs-service.js";
import { swagger2Fixture } from "./fixtures/swagger2.js";
import { sendJson, startHttpServer, type TestHttpServer } from "./helpers/http-server.js";

describe("ApiDocsService", () => {
  let server: TestHttpServer;
  let docsUrl: string;
  const service = new ApiDocsService();

  beforeAll(async () => {
    server = await startHttpServer((_request, response) => sendJson(response, swagger2Fixture));
    docsUrl = `${server.origin}/v2/api-docs`;
  });
  afterAll(async () => server.close());

  it("分类、搜索和分页返回实时来源", async () => {
    const categories = await service.listCategories(docsUrl, undefined, 1, 1);
    expect(categories.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(categories.sourceNotice).toMatch(
      /^Swagger 来源：测试教学平台；\[Swagger JSON\]\(<http:\/\/[^>]+\/v2\/api-docs>\)；获取时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}（北京时间）；实时获取，未使用缓存。$/
    );
    expect(categories.sourceNotice.split(docsUrl)).toHaveLength(2);
    expect(categories.source.cacheUsed).toBe(false);

    const search = await service.search({ docsUrl, keyword: "基线", page: 1, pageSize: 20 });
    expect(search.data.items).toHaveLength(2);
    expect(search.data.items[0]?.matchedFields).toContain("summary");
  });

  it("每次调用重新获取，不串用旧文档", async () => {
    const before = server.requests.length;
    await service.listCategories(docsUrl, undefined, 1, 20);
    await service.listCategories(docsUrl, undefined, 1, 20);
    expect(server.requests.length - before).toBe(2);
  });

  it("连续查询不同地址时来源与内容不串用", async () => {
    const secondDocument = {
      ...swagger2Fixture,
      info: { title: "另一个后端", version: "2.0.0" },
      paths: {}
    };
    const secondServer = await startHttpServer((_request, response) => sendJson(response, secondDocument));
    try {
      const first = await service.listCategories(docsUrl, undefined, 1, 20);
      const secondUrl = `${secondServer.origin}/v2/api-docs`;
      const second = await service.listCategories(secondUrl, undefined, 1, 20);
      expect(first.source.title).toBe("测试教学平台");
      expect(second.source).toMatchObject({ requestedUrl: secondUrl, title: "另一个后端" });
      expect(second.data.pagination.total).toBe(0);
      expect(second.source.documentFingerprint).not.toBe(first.source.documentFingerprint);
    } finally {
      await secondServer.close();
    }
  });

  it("上游由成功转为失败时不返回旧结果", async () => {
    let available = true;
    const unstableServer = await startHttpServer((_request, response) => {
      if (available) return sendJson(response, swagger2Fixture);
      response.writeHead(503, { "content-type": "text/plain" });
      response.end("unavailable");
    });
    try {
      const unstableUrl = `${unstableServer.origin}/v2/api-docs`;
      await expect(service.listCategories(unstableUrl, undefined, 1, 20)).resolves.toBeDefined();
      available = false;
      await expect(service.listCategories(unstableUrl, undefined, 1, 20))
        .rejects.toMatchObject({ code: ErrorCode.HTTP_ERROR });
    } finally {
      await unstableServer.close();
    }
  });

  it("同路径多 Method 时要求明确选择", async () => {
    await expect(service.getByPath({ docsUrl, path: "/api/v1/study-exam-stat/baseline-class-stat" }))
      .rejects.toMatchObject({ code: ErrorCode.METHOD_REQUIRED, details: { methods: ["GET", "POST"] } });

    const result = await service.getByPath({
      docsUrl,
      path: "/api/v1/study-exam-stat/baseline-class-stat",
      method: "post"
    });
    expect(result.data.response?.flatFields.map((field) => field.path)).toContain(
      "data[].baselineDetailList[].students[].studentId"
    );
  });

  it("动态字段使顶层完整性变为 partial", async () => {
    const result = await service.getByPath({ docsUrl, path: "/api/v1/maps" });
    expect(result.completeness).toBe(Completeness.PARTIAL);
    expect(result.warnings.join(" ")).toContain("解析边界");
  });

  it("未命中时只返回候选，不自动猜测", async () => {
    await expect(service.getCategory({
      docsUrl,
      category: "uniform-study-exam",
      detailLevel: "summary",
      page: 1,
      pageSize: 20
    })).rejects.toMatchObject({ code: ErrorCode.CATEGORY_NOT_FOUND });
    await expect(service.getByPath({ docsUrl, path: "/baseline-class-stat" }))
      .rejects.toMatchObject({ code: ErrorCode.PATH_NOT_FOUND });
  });
});
