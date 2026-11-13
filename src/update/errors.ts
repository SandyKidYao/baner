/** 检查或安装新版本时的错误,翻译成一行说明。 */
export function describeUpdateError(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  if (/not available in dev builds/.test(raw)) return "开发版不能自动更新";
  if (/signature|minisign/i.test(raw)) return "新版本的签名校验失败,没有安装";
  if (/valid release JSON|not found in the response/i.test(raw)) return "没找到可用的新版本信息";
  if (/authentication failed or was cancelled/i.test(raw)) return "没有授权替换应用";
  if (/permission denied|move the new app/i.test(raw))
    return "没有权限替换应用,把 Baner 放进「应用程序」再试";
  if (/network|request|connect|resolve|dns|timed? ?out|tls|unreachable/i.test(raw))
    return "连不上 GitHub,检查一下网络";
  const msg = raw.replace(/^update: /, "");
  return msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
}
