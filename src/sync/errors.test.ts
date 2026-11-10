import { describe, expect, it } from "vitest";
import { describeSyncError } from "./errors";

describe("describeSyncError", () => {
  it("识别常见错误", () => {
    expect(describeSyncError("git: remote authentication required but no callback set")).toBe(
      "token 无效或没有权限",
    );
    expect(describeSyncError("git: unexpected http status code: 401")).toBe("token 无效或没有权限");
    expect(describeSyncError("git: failed to resolve address for github.com")).toBe("网络不通");
    expect(describeSyncError("git: unexpected http status code: 404")).toBe("找不到这个仓库");
    expect(describeSyncError("git: no remote configured")).toBe("还没有配置仓库");
  });
  it("未知错误原样截断显示", () => {
    expect(describeSyncError("x".repeat(100))).toHaveLength(81);
  });
});
