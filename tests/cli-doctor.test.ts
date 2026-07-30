import { afterEach, describe, expect, it } from "vitest";
import { createDoctorReport, formatDoctorReport } from "../src/cli/doctor.js";
import { NavigationNextAction } from "../src/domain/types.js";
import { ErrorCode, ErrorStage } from "../src/errors.js";
import { swagger2Fixture } from "./fixtures/swagger2.js";
import { sendJson, startHttpServer, type TestHttpServer } from "./helpers/http-server.js";

describe("CLI doctor 诊断", () => {
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

  it("深链接报告验证分组、分类和真实接口", async () => {
    const server = await startKnife4jServer();
    const docsUrl = `${server.origin}/doc.html#/default/uniform-study-exam-stat-controller/getBaselineClassStat`;

    const report = await createDoctorReport(docsUrl);

    expect(report.document).toMatchObject({
      mode: "inspection",
      data: {
        selection: {
          group: { value: { name: "default" }, verified: true },
          category: {
            value: { name: "uniform-study-exam-stat-controller" },
            verified: true
          },
          api: {
            value: {
              operationId: "getBaselineClassStat",
              path: "/api/v1/study-exam-stat/baseline-class-stat",
              method: "POST"
            },
            verified: true
          }
        },
        nextAction: NavigationNextAction.GET_API_DETAIL
      },
      warnings: [],
      completeness: "complete"
    });
    expect(formatDoctorReport(report, false)).toContain(
      "接口：POST /api/v1/study-exam-stat/baseline-class-stat（已验证）"
    );
    expect(JSON.parse(formatDoctorReport(report, true))).toMatchObject({
      status: "ok",
      document: { mode: "inspection" }
    });
  });

  it("普通文档报告保留接口数量和文档指纹", async () => {
    const server = await startKnife4jServer();

    const report = await createDoctorReport(`${server.origin}/doc.html`, "default");

    expect(report.document).toMatchObject({
      mode: "document",
      operationCount: 6,
      source: {
        group: "default",
        documentFingerprint: expect.any(String)
      }
    });
    expect(formatDoctorReport(report, false)).toContain("接口数量：6");
  });

  it("拒绝显式分组与深链接分组冲突", async () => {
    await expect(createDoctorReport(
      "https://api.example.com/doc.html#/default/controller/getDetail",
      "stale"
    )).rejects.toMatchObject({
      code: ErrorCode.INVALID_CLI_ARGUMENT,
      stage: ErrorStage.CLI_ARGUMENT
    });
  });
});
