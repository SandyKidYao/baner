/**
 * 同步错误的类型。核心层用错误前缀区分(crates/baner-core/src/error.rs),这里只认前缀:
 * - auth:远端拒绝了 token,要重新登录
 * - network:连不上 GitHub,稍后会自动重试
 * - repo:仓库不存在或没授权给 Baner
 * - identity:本机主密钥和仓库里的不一致
 */
export type SyncErrorKind = "auth" | "network" | "repo" | "identity" | "other";

const raw = (e: unknown) => String(e instanceof Error ? e.message : e);

export function syncErrorKind(e: unknown): SyncErrorKind {
  const s = raw(e);
  if (s.startsWith("auth:")) return "auth";
  if (s.startsWith("network:")) return "network";
  if (s.startsWith("repo:")) return "repo";
  if (s.startsWith("identity conflict")) return "identity";
  return "other";
}

const TEXT: Record<Exclude<SyncErrorKind, "other">, string> = {
  auth: "GitHub 授权失效,请重新登录",
  network: "网络不通",
  repo: "找不到这个仓库,或它没有授权给 Baner",
  identity: "这台设备的主密钥和仓库里的不一致",
};

/** 把同步错误翻译成一行可行动的说明。原始信息不含 token。 */
export function describeSyncError(e: unknown): string {
  const kind = syncErrorKind(e);
  if (kind !== "other") return TEXT[kind];
  const s = raw(e);
  if (/no remote configured/i.test(s)) return "还没有选择仓库";
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

/** GitHub 登录、列仓库时的错误。 */
export function describeGithubError(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  if (/device_flow_disabled/.test(raw)) return "Baner 的 GitHub App 没有开启 Device Flow";
  if (/unauthorized/.test(raw)) return "GitHub 授权失效,请重新登录";
  if (/network|resolve|connect|timed? ?out|tls/i.test(raw)) return "连不上 GitHub,检查一下网络";
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
}
