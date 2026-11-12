/** 把 git 错误翻译成一行可行动的说明。原始信息不含 token。 */
export function describeSyncError(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  if (/401|403|auth|credential|permission|unauthorized/i.test(raw)) return "GitHub 授权失效,请重新登录";
  if (/404|not found|does not appear to be a git repository/i.test(raw))
    return "找不到这个仓库,或它没有授权给 Baner";
  if (/resolve|connect|network|timed? ?out|unreachable|ssl|tls/i.test(raw)) return "网络不通";
  if (/no remote configured/i.test(raw)) return "还没有选择仓库";
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
}

/** GitHub 登录、列仓库时的错误。 */
export function describeGithubError(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  if (/device_flow_disabled/.test(raw)) return "Baner 的 GitHub App 没有开启 Device Flow";
  if (/unauthorized/.test(raw)) return "GitHub 授权失效,请重新登录";
  if (/network|resolve|connect|timed? ?out|tls/i.test(raw)) return "连不上 GitHub,检查一下网络";
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
}
