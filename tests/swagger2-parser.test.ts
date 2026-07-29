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
    const response = document.getOperation("/api/v1/maps", "GET").responses[0];
    expect(response?.unresolvedDynamicFields[0]?.path).toBe("data{*}");
    expect(response?.flatFields.find((field) => field.path === "data{*}")?.dynamicKey).toBe(true);
    expect(response?.completeness).toBe(Completeness.PARTIAL);
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
    expect(response?.warnings.join(" ")).toContain("最大展开深度");
    expect(response?.flatFields.some((field) => field.recursionBoundary)).toBe(true);
  });
});
