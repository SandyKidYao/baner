import { describe, expect, it } from "vitest";
import { describeUpdateError } from "./errors";

describe("describeUpdateError", () => {
  it("识别常见错误", () => {
    expect(describeUpdateError("update: error sending request for url (https://github.com/…)")).toBe(
      "连不上 GitHub,检查一下网络",
    );
    expect(describeUpdateError("update: Could not fetch a valid release JSON from the remote")).toBe(
      "没找到可用的新版本信息",
    );
    expect(describeUpdateError("update: Signature verification failed")).toBe(
      "新版本的签名校验失败,没有安装",
    );
    expect(describeUpdateError("update: Permission denied (os error 13)")).toBe(
      "没有权限替换应用,把 Baner 放进「应用程序」再试",
    );
    expect(describeUpdateError("update: not available in dev builds")).toBe("开发版不能自动更新");
  });
  it("未知错误去掉前缀后截断显示", () => {
    expect(describeUpdateError("update: boom")).toBe("boom");
    expect(describeUpdateError(`update: ${"x".repeat(100)}`)).toHaveLength(81);
  });
});
