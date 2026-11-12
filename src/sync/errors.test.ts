import { describe, expect, it } from "vitest";
import { describeGithubError, describeSyncError } from "./errors";

describe("describeSyncError", () => {
  it("识别常见错误", () => {
    expect(describeSyncError("git: remote authentication required but no callback set")).toBe(
      "GitHub 授权失效,请重新登录",
    );
    expect(describeSyncError("git: unexpected http status code: 401")).toBe("GitHub 授权失效,请重新登录");
    expect(describeSyncError("git: failed to resolve address for github.com")).toBe("网络不通");
    expect(describeSyncError("git: unexpected http status code: 404")).toBe(
      "找不到这个仓库,或它没有授权给 Baner",
    );
    expect(describeSyncError("git: no remote configured")).toBe("还没有选择仓库");
    expect(
      describeSyncError("identity conflict: this device's master key differs from the repository's"),
    ).toBe("这台设备的主密钥和仓库里的不一致");
  });
  it("未知错误原样截断显示", () => {
    expect(describeSyncError("x".repeat(100))).toHaveLength(81);
  });
});

describe("describeGithubError", () => {
  it("识别常见错误", () => {
    expect(describeGithubError("github: device_flow_disabled")).toBe(
      "Baner 的 GitHub App 没有开启 Device Flow",
    );
    expect(describeGithubError("github: unauthorized")).toBe("GitHub 授权失效,请重新登录");
    expect(describeGithubError("github: network: io: timed out")).toBe("连不上 GitHub,检查一下网络");
  });
});
