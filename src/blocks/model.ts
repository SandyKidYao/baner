// 块模型:一个 tab 在编辑器里是一个文档,块之间用隐藏的分隔行隔开(HeyNote 的做法)。
// 分隔行 = MARK + "<排序键>~<块id>",对应磁盘上的文件名 <排序键>~<块id>.md(ADR-0005)。
// 图块在文档里只占一行占位 DRAW_LINE,由编辑器替换成预览图或 Excalidraw;内容存在 .excalidraw/.svg 里。
import { generateKeyBetween } from "fractional-indexing";
import type { Block } from "../ipc/types";

const CTRL = "\u001f";
export const MARK = `${CTRL}∞∞∞`; // 以控制字符开头,用户无法直接输入
export const DRAW_LINE = `${CTRL}◇`;
// biome-ignore lint/suspicious/noControlCharactersInRegex: 分隔行刻意以控制字符开头
const HEADER_RE = /^\u001f∞∞∞([0-9A-Za-z]+)~([0-9a-z]+)$/;

export function header(b: Pick<Block, "key" | "id">) {
  return `${MARK}${b.key}~${b.id}`;
}

export function parseHeader(line: string): Pick<Block, "key" | "id"> | null {
  const m = HEADER_RE.exec(line);
  return m ? { key: m[1], id: m[2] } : null;
}

export const isDraw = (b: Pick<Block, "kind">) => b.kind === "draw";

export function serialize(blocks: Block[]): string {
  return blocks.map((b) => `${header(b)}\n${isDraw(b) ? DRAW_LINE : b.text}`).join("\n");
}

function toBlock(key: string, id: string, lines: string[]): Block {
  const text = lines.join("\n");
  return text === DRAW_LINE ? { key, id, text: "", kind: "draw" } : { key, id, text };
}

export function parse(doc: string): Block[] {
  const lines = doc.split("\n");
  const out: Block[] = [];
  let cur: { key: string; id: string; lines: string[] } | null = null;
  for (const line of lines) {
    const h = parseHeader(line);
    if (h) {
      if (cur) out.push(toBlock(cur.key, cur.id, cur.lines));
      cur = { ...h, lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) out.push(toBlock(cur.key, cur.id, cur.lines));
  return out;
}

/**
 * 文档是否结构完好:以分隔行开头、不以分隔行结尾;含控制字符的行只能是合法的分隔行,
 * 或紧跟在分隔行后、独占整个块的图块占位行;块 id 不重复。
 */
export function isValidDoc(doc: string): boolean {
  if (!doc.startsWith(MARK)) return false;
  const lines = doc.split("\n");
  if (parseHeader(lines[lines.length - 1])) return false;
  const ids = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(CTRL)) continue;
    if (line === DRAW_LINE) {
      const next = lines[i + 1];
      if (!parseHeader(lines[i - 1] ?? "") || (next !== undefined && !parseHeader(next))) return false;
      continue;
    }
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

/** 文档里图块占位之外的控制字符行(分隔行、占位行)都不应出现在复制出去的文本里 */
export const isControlLine = (line: string) => line.startsWith(CTRL);

export interface Diff {
  upserts: Block[];
  deletes: Block[];
}

/**
 * 对比上次保存的状态,得出需要写入和删除的块。
 * 图块的内容由图块编辑器自己保存;这里只在它「新出现」时列为写入(例如撤销删除),由调用方决定能否写。
 */
export function diff(saved: Map<string, Block>, next: Block[]): Diff {
  const upserts: Block[] = [];
  const deletes: Block[] = [];
  const seen = new Set<string>();
  for (const b of next) {
    seen.add(b.id);
    const old = saved.get(b.id);
    if (!old) {
      if (b.text !== "" || isDraw(b)) upserts.push(b); // 空的新文本块等有内容再落盘
    } else if (old.key !== b.key || isDraw(old) !== isDraw(b)) {
      deletes.push(old);
      upserts.push(b);
    } else if (!isDraw(b) && old.text !== b.text) {
      upserts.push(b);
    }
  }
  for (const old of saved.values()) if (!seen.has(old.id)) deletes.push(old);
  return { upserts, deletes };
}
