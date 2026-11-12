import { describe, expect, it } from "vitest";
import { describeCryptoError } from "./errors";

describe("describeCryptoError", () => {
  it("识别常见错误", () => {
    expect(describeCryptoError("wrong master key")).toBe("主密钥不正确");
    expect(describeCryptoError("crypto: master key too short")).toBe("主密钥至少 8 位");
    expect(describeCryptoError("git: unexpected http status code: 401")).toBe(
      "连不上仓库,无法确认仓库里是否已有主密钥",
    );
  });
});
