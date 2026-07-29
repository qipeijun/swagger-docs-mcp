import { afterEach, describe, expect, it } from "vitest";
import { ErrorCode, ErrorStage } from "../src/errors.js";
import { ApiDocsService } from "../src/service/api-docs-service.js";
import { DocumentDiscoveryService } from "../src/source/discovery.js";
import { SafeHttpClient } from "../src/source/http-client.js";
import { openApi3Fixture, swagger2Fixture } from "./fixtures/swagger2.js";
import { sendJson, startHttpServer, type TestHttpServer } from "./helpers/http-server.js";

describe("文档发现与网络边界", () => {
  const servers: TestHttpServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("直接读取 Swagger JSON", async () => {
    const server = await startHttpServer((_request, response) => sendJson(response, swagger2Fixture));
    servers.push(server);
    const result = await new DocumentDiscoveryService().resolve(`${server.origin}/v2/api-docs`);
    expect(result.document?.resolvedSpecUrl).toBe(`${server.origin}/v2/api-docs`);
    expect(result.document?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("从 doc.html 发现单个 Springfox 分组", async () => {
    const server = await startHttpServer((request, response) => {
      if (request.url === "/swagger-resources") return sendJson(response, [
        { name: "default", location: "/v2/api-docs", swaggerVersion: "2.0" }
      ]);
      if (request.url === "/v2/api-docs") return sendJson(response, swagger2Fixture);
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><html></html>");
    });
    servers.push(server);
    const result = await new DocumentDiscoveryService().resolve(`${server.origin}/doc.html`);
    expect(result.selectedGroup).toBe("default");
    expect(result.document?.resolvedSpecUrl).toBe(`${server.origin}/v2/api-docs`);
  });

  it("多分组必须精确选择", async () => {
    const server = await startHttpServer((request, response) => {
      if (request.url === "/swagger-resources") return sendJson(response, [
        { name: "a", location: "/a" },
        { name: "b", location: "/b" }
      ]);
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html></html>");
    });
    servers.push(server);
    const service = new DocumentDiscoveryService();
    const unresolved = await service.resolve(`${server.origin}/doc.html`);
    expect(unresolved).toMatchObject({
      groups: [{ name: "a" }, { name: "b" }]
    });
    expect(unresolved.selectedGroup).toBeUndefined();
    const invalid = await service.resolve(`${server.origin}/doc.html`, "missing");
    expect(invalid.document).toBeUndefined();
  });

  it("展示页发现失败时给出直接 JSON 的下一步", async () => {
    const server = await startHttpServer((request, response) => {
      if (request.url === "/swagger-resources") {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html></html>");
    });
    servers.push(server);
    await expect(new DocumentDiscoveryService().resolve(`${server.origin}/doc.html`)).rejects.toMatchObject({
      code: ErrorCode.DISCOVERY_FAILED,
      details: { nextAction: "provide_swagger_json_url", status: 404 }
    });
  });

  it("重复分组名不自动选择", async () => {
    const server = await startHttpServer((request, response) => {
      if (request.url === "/swagger-resources") return sendJson(response, [
        { name: "default", location: "/a" },
        { name: "default", location: "/b" }
      ]);
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html></html>");
    });
    servers.push(server);
    await expect(new DocumentDiscoveryService().resolve(`${server.origin}/doc.html`, "default"))
      .rejects.toMatchObject({ code: ErrorCode.GROUP_AMBIGUOUS });
  });

  it("拒绝跨主机发现地址和跨主机重定向", async () => {
    const target = await startHttpServer((_request, response) => sendJson(response, swagger2Fixture));
    servers.push(target);
    const discover = await startHttpServer((request, response) => {
      if (request.url === "/swagger-resources") {
        return sendJson(response, [{ name: "default", location: `${target.origin}/v2/api-docs` }]);
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html></html>");
    });
    servers.push(discover);
    await expect(new DocumentDiscoveryService().resolve(`${discover.origin}/doc.html`)).rejects.toMatchObject({
      code: ErrorCode.CROSS_ORIGIN_REDIRECT
    });

    const redirect = await startHttpServer((_request, response) => {
      response.writeHead(302, { location: `${target.origin}/v2/api-docs` });
      response.end();
    });
    servers.push(redirect);
    await expect(new SafeHttpClient().get(`${redirect.origin}/start`, ErrorStage.FETCH_ENTRY)).rejects.toMatchObject({
      code: ErrorCode.CROSS_ORIGIN_REDIRECT
    });
  });

  it("拒绝认证地址和重定向中的认证信息", async () => {
    const server = await startHttpServer((_request, response) => {
      response.writeHead(302, { location: "http://user:secret@127.0.0.1/private" });
      response.end();
    });
    servers.push(server);
    const client = new SafeHttpClient();
    await expect(client.get(`http://user:secret@127.0.0.1:${new URL(server.origin).port}/start`, ErrorStage.FETCH_ENTRY))
      .rejects.toMatchObject({ code: ErrorCode.AUTHENTICATED_URL_UNSUPPORTED });
    await expect(client.get(`${server.origin}/start`, ErrorStage.FETCH_ENTRY))
      .rejects.toMatchObject({ code: ErrorCode.AUTHENTICATED_URL_UNSUPPORTED });
  });

  it("区分超时、超大响应和无效 JSON", async () => {
    const server = await startHttpServer((request, response) => {
      if (request.url === "/slow") {
        setTimeout(() => sendJson(response, swagger2Fixture), 80);
        return;
      }
      if (request.url === "/large") {
        response.writeHead(200, { "content-type": "application/json", "content-length": "200" });
        response.end("{}".padEnd(200, " "));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{invalid");
    });
    servers.push(server);
    await expect(new SafeHttpClient({ timeoutMs: 20 }).get(`${server.origin}/slow`, ErrorStage.FETCH_ENTRY))
      .rejects.toMatchObject({ code: ErrorCode.REQUEST_TIMEOUT });
    await expect(new SafeHttpClient({ maxResponseBytes: 100 }).get(`${server.origin}/large`, ErrorStage.FETCH_ENTRY))
      .rejects.toMatchObject({ code: ErrorCode.RESPONSE_TOO_LARGE });
    await expect(new DocumentDiscoveryService().resolve(`${server.origin}/invalid`))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_DOCUMENT });
  });

  it("OpenAPI 3 返回明确的不支持错误", async () => {
    const server = await startHttpServer((_request, response) => sendJson(response, openApi3Fixture));
    servers.push(server);
    await expect(new ApiDocsService().load(`${server.origin}/openapi.json`)).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_SPEC_VERSION,
      details: { version: "3.0.3" }
    });
  });
});
