import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ApiDocsService,
  DocumentDiscoveryService,
  ErrorCode,
  RawJsonDiscoveryAdapter,
  SafeHttpClient,
  SpringfoxDiscoveryAdapter,
  Swagger2Parser,
  createMcpServer
} from "../src/public.js";

describe("公开包契约", () => {
  it("根入口导出无副作用的服务、解析器和服务器工厂", () => {
    expect(ApiDocsService).toBeTypeOf("function");
    expect(DocumentDiscoveryService).toBeTypeOf("function");
    expect(RawJsonDiscoveryAdapter).toBeTypeOf("function");
    expect(SafeHttpClient).toBeTypeOf("function");
    expect(SpringfoxDiscoveryAdapter).toBeTypeOf("function");
    expect(Swagger2Parser).toBeTypeOf("function");
    expect(createMcpServer).toBeTypeOf("function");
    expect(ErrorCode.ORIGIN_NOT_ALLOWED).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("package.json 声明公开入口和发布门禁", () => {
    const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      exports?: Record<string, unknown>;
      scripts?: Record<string, string>;
    };
    expect(metadata.exports).toHaveProperty(".");
    expect(metadata.scripts?.prepublishOnly).toBe("npm run check");
  });
});
