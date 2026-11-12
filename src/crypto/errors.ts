export function describeCryptoError(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  if (/wrong master key/i.test(raw)) return "主密钥不正确";
  if (/too short/i.test(raw)) return "主密钥至少 8 位";
  if (/^locked/i.test(raw)) return "本机还没有配置主密钥";
  if (/^(git|github):/.test(raw)) return "连不上仓库,无法确认仓库里是否已有主密钥";
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
}
