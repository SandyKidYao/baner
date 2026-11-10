// 块模型:一个 tab 在编辑器里是一个文档,块之间用隐藏的分隔行隔开(HeyNote 的做法)。
// 分隔行 = MARK + "<排序键>~<块id>",对应磁盘上的文件名 <排序键>~<块id>.md(ADR-0005)。
import { generateKeyBetween } from "fractional-indexing";
import type { Block } from "../ipc/types";

export const MARK = "\u001f∞∞∞"; // 以控制字符开头,用户无法直接输入
// biome-ignore lint/suspicious/noControlCharactersInRegex: 分隔行刻意以控制字符开头
const HEADER_RE = /^\u001f∞∞∞([0-9A-Za-z]+)~([0-9a-z]+)$/;

export function header(b: Pick<Block, "key" | "id">) {
  return `${MARK}${b.key}~${b.id}`;
}

export function parseHeader(line: string): Pick<Block, "key" | "id"> | null {
  const m = HEADER_RE.exec(line);
  return m ? { key: m[1], id: m[2] } : null;
}

export function serialize(blocks: Block[]): string {
  return blocks.map((b) => `${header(b)}\n${b.text}`).join("\n");
}

export function parse(doc: string): Block[] {
  const lines = doc.split("\n");
  const out: Block[] = [];
  let cur: { key: string; id: string; lines: string[] } | null = null;
  for (const line of lines) {
    const h = parseHeader(line);
    if (h) {
      if (cur) out.push({ key: cur.key, id: cur.id, text: cur.lines.join("\n") });
      cur = { ...h, lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) out.push({ key: cur.key, id: cur.id, text: cur.lines.join("\n") });
  return out;
}

/** 文档是否结构完好:以分隔行开头、不以分隔行结尾;所有 MARK 都位于行首且整行合法;块 id 不重复。 */
export function isValidDoc(doc: string): boolean {
  if (!doc.startsWith(MARK)) return false;
  const lines = doc.split("\n");
  if (parseHeader(lines[lines.length - 1])) return false;
  const ids = new Set<string>();
  for (const line of lines) {
    if (!line.includes(MARK)) continue;
    const h = parseHeader(line);
    if (!h || ids.has(h.id)) return false;
    ids.add(h.id);
  }
  return true;
}

export function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-3);
}

export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

export function newBlock(prevKey: string | null, nextKey: string | null, text = ""): Block {
  return { id: newId(), key: keyBetween(prevKey, nextKey), text };
}

export interface Diff {
  upserts: Block[];
  deletes: Block[];
}

/** 对比上次保存的状态,得出需要写入和删除的块。 */
export function diff(saved: Map<string, Block>, next: Block[]): Diff {
  const upserts: Block[] = [];
  const deletes: Block[] = [];
  const seen = new Set<string>();
  for (const b of next) {
    seen.add(b.id);
    const old = saved.get(b.id);
    if (!old) {
      if (b.text !== "") upserts.push(b); // 空的新块等有内容再落盘
    } else if (old.key !== b.key) {
      deletes.push(old);
      upserts.push(b);
    } else if (old.text !== b.text) {
      upserts.push(b);
    }
  }
  for (const old of saved.values()) if (!seen.has(old.id)) deletes.push(old);
  return { upserts, deletes };
}
