import { describe, expect, it } from "vitest";
import { Completeness } from "../src/domain/types.js";
import { Swagger2Parser } from "../src/swagger2/parser.js";
import { swagger2Fixture } from "./fixtures/swagger2.js";

describe("Swagger2Parser", () => {
  const document = new Swagger2Parser().parse(swagger2Fixture);

  it("递归展开数组和多层本地引用", () => {
    const operation = document.getOperation("/api/v1/study-exam-stat/baseline-class-stat", "POST");
    const response = operation.responses.find((item) => item.statusCode === "200");

    expect(response?.flatFields.map((field) => field.path)).toContain(
      "data[].baselineDetailList[].students[].studentId"
    );
    expect(response?.schemaReferences).toEqual(expect.arrayContaining([
      "BaselineResponse", "ClassStat", "BaselineDetail", "Student"
    ]));
    expect(response?.flatFields.find((field) => field.path.endsWith(".name"))?.description)
      .toBe("未提供说明");
  });

  it("如实标记动态 Map", () => {
    const operation = document.getOperation("/api/v1/maps", "GET");
    const response = operation.responses[0];
    expect(response?.unresolvedDynamicFields[0]?.path).toBe("data{*}");
    expect(response?.flatFields.find((field) => field.path === "data{*}")?.dynamicKey).toBe(true);
    expect(response?.completeness).toBe(Completeness.PARTIAL);
    expect(operation.completeness).toBe(Completeness.PARTIAL);
    expect(operation.warnings.join(" ")).toContain("响应 Schema 存在解析边界，见子字段标记");
  });

  it("请求体 Schema 为动态 Map 时同步标记接口为部分完整", () => {
    const parsed = new Swagger2Parser().parse({
      swagger: "2.0",
      info: { title: "动态请求体", version: "1" },
      paths: {
        "/dynamic-body": {
          post: {
            parameters: [{
              name: "body",
              in: "body",
              schema: { type: "object", additionalProperties: { type: "string" } }
            }],
            responses: { 200: { description: "成功" } }
          }
        }
      }
    });

    const operation = parsed.getOperation("/dynamic-body", "POST");
    expect(operation.parameters[0]?.schema?.completeness).toBe(Completeness.PARTIAL);
    expect(operation.completeness).toBe(Completeness.PARTIAL);
    expect(operation.warnings.join(" ")).toContain("请求参数 Schema 存在解析边界，见子字段标记");
  });

  it("存在但不是对象的请求和响应 Schema 会标记为部分完整", () => {
    const parsed = new Swagger2Parser().parse({
      swagger: "2.0",
      info: { title: "非法 Schema", version: "1" },
      paths: {
        "/invalid-schema": {
          post: {
            parameters: [{ name: "body", in: "body", schema: "not-an-object" }],
            responses: { 200: { description: "成功", schema: "not-an-object" } }
          }
        }
      }
    });

    const operation = parsed.getOperation("/invalid-schema", "POST");
    expect(operation.parameters[0]?.schema).toBeUndefined();
    expect(operation.responses[0]?.completeness).toBe(Completeness.PARTIAL);
    expect(operation.responses[0]?.warnings).toContain("响应 Schema 不是有效对象");
    expect(operation.completeness).toBe(Completeness.PARTIAL);
    expect(operation.warnings).toContain("请求体参数 body 的 Schema 不是有效对象");
  });

  it("在循环引用处停止展开", () => {
    const response = document.getOperation("/api/v1/cycles", "GET").responses[0];
    const recursive = response?.flatFields.find((field) => field.path === "children[]");
    expect(recursive?.recursionBoundary).toBe(true);
    expect(response?.warnings.join(" ")).toContain("循环引用");
  });

  it("合并 allOf 的继承属性", () => {
    const response = document.getOperation("/api/v1/inherited", "GET").responses[0];
    expect(response?.flatFields.map((field) => field.path)).toEqual(expect.arrayContaining(["id", "label"]));
  });

  it("拒绝展开外部引用", () => {
    const response = document.getOperation("/api/v1/external", "GET").responses[0];
    expect(response?.schemaTree?.boundaryReason).toBe("external_ref");
    expect(response?.warnings.join(" ")).toContain("外部引用");
  });

  it("达到最大深度时保留明确边界", () => {
    const definitions: Record<string, unknown> = {};
    for (let index = 0; index < 36; index += 1) {
      definitions[`Level${index}`] = {
        type: "object",
        properties: index === 35
          ? { value: { type: "string" } }
          : { next: { $ref: `#/definitions/Level${index + 1}` } }
      };
    }
    const deepDocument = new Swagger2Parser().parse({
      swagger: "2.0",
      info: { title: "深层模型", version: "1" },
      paths: {
        "/deep": {
          get: { responses: { 200: { description: "成功", schema: { $ref: "#/definitions/Level0" } } } }
        }
      },
      definitions
    });
    const response = deepDocument.getOperation("/deep", "GET").responses[0];
    expect(response?.warnings.join(" ")).toContain("最大递归深度");
    expect(response?.flatFields.some((field) => field.recursionBoundary)).toBe(true);
  });

  it("顶层参数引用无法解析时不伪造参数，并标记操作为部分完整", () => {
    const parsed = new Swagger2Parser().parse({
      swagger: "2.0",
      info: { title: "引用边界", version: "1" },
      paths: {
        "/refs": {
          get: {
            parameters: [
              { $ref: "#/parameters/Missing" },
              { $ref: "https://example.com/parameters.json#/TraceId" }
            ],
            responses: { 200: { description: "成功" } }
          }
        }
      }
    });

    const operation = parsed.getOperation("/refs", "GET");
    expect(operation.parameters).toEqual([]);
    expect(operation.warnings.join(" ")).toContain("参数引用不存在：Missing");
    expect(operation.warnings.join(" ")).toContain("不支持的外部引用");
    expect(operation.completeness).toBe(Completeness.PARTIAL);
  });

  it("顶层响应引用缺失或指向外部文档时保留明确边界", () => {
    const parsed = new Swagger2Parser().parse({
      swagger: "2.0",
      info: { title: "响应引用边界", version: "1" },
      paths: {
        "/refs": {
          get: {
            responses: {
              200: { $ref: "#/responses/Missing" },
              400: { $ref: "https://example.com/responses.json#/BadRequest" }
            }
          }
        }
      }
    });

    const operation = parsed.getOperation("/refs", "GET");
    expect(operation.responses).toEqual(expect.arrayContaining([
      expect.objectContaining({ statusCode: "200", completeness: Completeness.PARTIAL }),
      expect.objectContaining({ statusCode: "400", completeness: Completeness.PARTIAL })
    ]));
    expect(operation.warnings.join(" ")).toContain("响应引用不存在：Missing");
    expect(operation.warnings.join(" ")).toContain("不支持的外部引用");
  });

  it("接口未声明响应时不标记为完整", () => {
    const parsed = new Swagger2Parser().parse({
      swagger: "2.0",
      info: { title: "缺失响应", version: "1" },
      paths: { "/missing": { get: {} } }
    });

    const operation = parsed.getOperation("/missing", "GET");
    expect(operation.responses).toEqual([]);
    expect(operation.warnings).toContain("接口未声明任何响应");
    expect(operation.completeness).toBe(Completeness.PARTIAL);
  });
});
