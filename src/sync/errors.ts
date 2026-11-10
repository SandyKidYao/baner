/** 把 git 错误翻译成一行可行动的说明。原始信息不含 token。 */
export function describeSyncError(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  if (/401|403|auth|credential|permission/i.test(raw)) return "token 无效或没有权限";
  if (/404|not found|does not appear to be a git repository/i.test(raw)) return "找不到这个仓库";
  if (/resolve|connect|network|timed? ?out|unreachable|ssl|tls/i.test(raw)) return "网络不通";
  if (/no remote configured|empty remote url/i.test(raw)) return "还没有配置仓库";
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
}
