import type { SyncErrorKind } from "./errors";

/** 连不上 GitHub 时,第 n 次连续失败后等多久再自动重试(毫秒);超出部分按最后一项 */
const NETWORK_BACKOFF = [30_000, 60_000, 120_000, 300_000];

/**
 * 同步失败后多久自动重试;null 表示不自动重试,等用户手动重试或改配置。
 * 只有网络问题值得自动重试:授权、仓库、主密钥的问题必须用户动手,白试只会反复打扰 GitHub。
 * @param failures 连续失败的次数(含这一次),从 1 开始
 */
export function retryDelay(kind: SyncErrorKind, failures: number): number | null {
  if (kind !== "network") return null;
  return NETWORK_BACKOFF[Math.min(Math.max(failures, 1), NETWORK_BACKOFF.length) - 1];
}
