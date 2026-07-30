import { describe, expect, it } from "vitest";
import { formatCliError, parseCliArguments } from "../src/cli/main.js";
import { AppError, ErrorCode, ErrorStage } from "../src/errors.js";

describe("CLI 参数契约", () => {
  it("解析 doctor、setup、upgrade 和 remove", () => {
    expect(parseCliArguments(["doctor", "https://api.example.com/doc.html", "--group", "user", "--json"]))
      .toEqual({
        command: "doctor",
        docsUrl: "https://api.example.com/doc.html",
        group: "user",
        json: true
      });
    expect(parseCliArguments(["doctor"]))
      .toEqual({ command: "doctor", json: false });
    expect(parseCliArguments(["setup", "claude", "--local"]))
      .toEqual({ command: "setup", client: "claude", local: true });
    expect(parseCliArguments(["upgrade", "codex"]))
      .toEqual({ command: "upgrade", client: "codex", local: false });
    expect(parseCliArguments(["remove", "gemini", "--local"]))
      .toEqual({ command: "remove", client: "gemini", local: true });
  });

  it.each([
    ["doctor", "https://api.example.com", "--unknown"],
    ["doctor", "--group"],
    ["doctor", "--group", "user"],
    ["doctor", "https://a.example.com", "https://b.example.com"],
    ["doctor", "-x"],
    ["doctor", "--json", "--json"],
    ["setup", "claude", "--replace"],
    ["setup", "-x"],
    ["setup", "list", "--local"],
    ["upgrade", "claude", "--replace"],
    ["remove", "claude", "extra"]
  ])("拒绝未知、重复、缺值或多余参数：%s", (...args) => {
    expect(() => parseCliArguments(args)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_CLI_ARGUMENT })
    );
  });

  it("将 doctor 失败格式化为稳定 JSON", () => {
    const output = formatCliError(new AppError(
      ErrorCode.GROUP_NOT_FOUND,
      ErrorStage.DISCOVER_SPEC,
      "未找到文档分组：stale",
      {
        requestedUrl: "https://api.example.com/doc.html",
        details: { groups: ["default"] }
      }
    ), true);

    expect(JSON.parse(output)).toEqual({
      status: "error",
      error: {
        code: ErrorCode.GROUP_NOT_FOUND,
        stage: ErrorStage.DISCOVER_SPEC,
        message: "未找到文档分组：stale",
        requestedUrl: "https://api.example.com/doc.html",
        details: { groups: ["default"] }
      }
    });
  });
});
