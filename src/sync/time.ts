const pad = (n: number) => String(n).padStart(2, "0");

/** 记录里的时间:今天只显示时分,今年显示月日,更早带上年份。 */
export function formatTime(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const n = new Date(now);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameYear = d.getFullYear() === n.getFullYear();
  if (sameYear && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return hm;
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return sameYear ? `${md} ${hm}` : `${d.getFullYear()}-${md} ${hm}`;
}
