import { describe, expect, it } from "vitest";
import { describeGithubError, describeSyncError, syncErrorKind } from "./errors";

describe("syncErrorKind", () => {
  it("按核心层的错误前缀分类", () => {
    expect(syncErrorKind("auth: remote rejected the credentials")).toBe("auth");
    expect(syncErrorKind("network: failed to connect to github.com: Operation timed out")).toBe("network");
    expect(syncErrorKind("repo: unexpected http status code: 404")).toBe("repo");
    expect(syncErrorKind("identity conflict: this device's master key differs from the repository's")).toBe(
      "identity",
    );
    expect(syncErrorKind(new Error("network: error receiving data from socket: Broken pipe"))).toBe(
      "network",
    );
  });
  it("其他错误不按字面猜:含 auth、permission 的本地错误不算授权失效", () => {
    expect(syncErrorKind("io: Permission denied (os error 13)")).toBe("other");
    expect(syncErrorKind("git: authentication required")).toBe("other");
  });
});

describe("describeSyncError", () => {
  it("给出可行动的说明", () => {
    expect(describeSyncError("auth: remote rejected the credentials")).toBe("GitHub 授权失效,请重新登录");
    expect(describeSyncError("network: failed to resolve address for github.com")).toBe("网络不通");
    expect(describeSyncError("repo: unexpected http status code: 404")).toBe(
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
