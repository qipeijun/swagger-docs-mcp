import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/errors.js";
import { parseUrlHashHints } from "../src/navigation/url-navigation.js";

describe("Knife4j URL 导航解析", () => {
  it("解析完整深链接", () => {
    expect(parseUrlHashHints(
      "http://127.0.0.1/doc.html#/default/uniform-study-exam-stat-controller/getDetailUsingGET"
    )).toEqual({
      recognized: true,
      group: "default",
      category: "uniform-study-exam-stat-controller",
      operationId: "getDetailUsingGET"
    });
  });

  it("根地址和编码片段保持明确语义", () => {
    expect(parseUrlHashHints("http://127.0.0.1/doc.html#")).toEqual({ recognized: true });
    expect(parseUrlHashHints("http://127.0.0.1/doc.html#/default/%E6%88%90%E7%BB%A9"))
      .toMatchObject({ recognized: true, group: "default", category: "成绩" });
  });

  it("不支持的 hash 格式只标记为未识别", () => {
    expect(parseUrlHashHints("http://127.0.0.1/doc.html#section"))
      .toEqual({ recognized: false });
    expect(parseUrlHashHints("http://127.0.0.1/doc.html#/a/b/c/d"))
      .toEqual({ recognized: false });
  });

  it("无效 URL 编码返回稳定错误", () => {
    expect(() => parseUrlHashHints("http://127.0.0.1/doc.html#/default/%E0%A4%A"))
      .toThrow(expect.objectContaining({ code: ErrorCode.INVALID_URL }));
  });
});
