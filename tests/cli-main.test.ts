import { describe, expect, it } from "vitest";
import { parseCliArguments } from "../src/cli/main.js";
import { ErrorCode } from "../src/errors.js";

describe("CLI 参数契约", () => {
  it("解析 doctor、setup、upgrade 和 remove", () => {
    expect(parseCliArguments(["doctor", "https://api.example.com/doc.html", "--group", "user"]))
      .toEqual({
        command: "doctor",
        docsUrl: "https://api.example.com/doc.html",
        group: "user"
      });
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
});
