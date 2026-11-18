import { describe, expect, it } from "vitest";
import { retryDelay } from "./retry";

describe("retryDelay", () => {
  it("网络不通:30 秒起逐次加倍,5 分钟封顶", () => {
    expect([1, 2, 3, 4, 5, 20].map((n) => retryDelay("network", n))).toEqual([
      30_000, 60_000, 120_000, 300_000, 300_000, 300_000,
    ]);
  });
  it("需要用户处理的错误不自动重试", () => {
    for (const kind of ["auth", "repo", "identity", "other"] as const) {
      expect(retryDelay(kind, 1)).toBeNull();
    }
  });
});
