// Markdown 代码块(design.md v3.1):
// - 解析:顶层的 ``` / ~~~ 代码块遇到块分隔行就结束,没闭合的代码块不会吞掉后面的块。
// - 高亮:按 ``` 后面的语言名按需加载解析器(@codemirror/language-data,各语言单独成包,用到才加载)。
// - 所见模式、光标不在代码块里:整块换成圆角盒子(语言标签、复制按钮、高亮后的代码);点哪一行,光标就到哪一行。
// - 光标在代码块里或源码模式:原样显示,带底色与高亮,开头一行末尾有复制按钮。
import {
  HighlightStyle,
  LanguageDescription,
  ParseContext,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  type EditorState,
  type Extension,
  Prec,
  type Range,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { highlightTree, tags as t } from "@lezer/highlight";
import type { BlockParser, Element, MarkdownConfig } from "@lezer/markdown";
import { blocksField, currentBlock, drawEditingField } from "./editor";

const CTRL = 31; // 分隔行与图块占位行以 \u001f 开头

/**
 * 顶层代码块。节点名与 @lezer/markdown 内置的一致(FencedCode / CodeMark / CodeInfo / CodeText),
 * 语言的嵌套解析(parseCode)照常工作;不同的只是遇到分隔行就结束。列表、引用里的代码块仍交给内置解析器。
 */
const TopFence: BlockParser = {
  name: "TopFencedCode",
  before: "FencedCode",
  parse(cx, line) {
    if (cx.parentType().name !== "Document" || line.indent >= 4) return false;
    const m = /^(`{3,}|~{3,})(.*)$/.exec(line.text.slice(line.pos));
    if (!m || (m[1][0] === "`" && m[2].includes("`"))) return false;
    const fence = m[1];
    const from = cx.lineStart + line.pos;
    const kids: Element[] = [cx.elt("CodeMark", from, from + fence.length)];
    const info = m[2].trim();
    if (info) {
      const at = from + fence.length + m[2].indexOf(info);
      kids.push(cx.elt("CodeInfo", at, at + info.length));
    }
    const close = new RegExp(`^ {0,3}\\${fence[0]}{${fence.length},}\\s*$`);
    let end = cx.lineStart + line.text.length;
    let textFrom = -1;
    let textTo = -1;
    let closed: Element | null = null;
    while (cx.nextLine()) {
      if (line.text.charCodeAt(0) === CTRL) break; // 块分隔行:代码块到此为止,分隔行留给后面
      if (close.test(line.text)) {
        const s = cx.lineStart + line.text.indexOf(fence[0]);
        closed = cx.elt("CodeMark", s, cx.lineStart + line.text.trimEnd().length);
        end = cx.lineStart + line.text.length;
        cx.nextLine();
        break;
      }
      if (textFrom < 0) textFrom = cx.lineStart;
      textTo = cx.lineStart + line.text.length;
      end = textTo;
    }
    if (textFrom >= 0 && textTo > textFrom) kids.push(cx.elt("CodeText", textFrom, textTo));
    if (closed) kids.push(closed);
    cx.addElement(cx.elt("FencedCode", from, end, kids));
    return true;
  },
};
export const fenceAtBlockBoundary: MarkdownConfig = { parseBlock: [TopFence] };

/** ``` 后面的语言名 → 解析器;还没加载的语言先跳过,加载完重新解析 */
export function codeParser(info: string) {
  const desc = LanguageDescription.matchLanguageName(languages, info, true);
  if (!desc) return null;
  if (desc.support) return desc.support.language.parser;
  return ParseContext.getSkippingParser(desc.load());
}

/** 代码高亮(只定义代码里的记号,不碰 Markdown 自己的标题、强调等) */
const codeStyle = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier],
    color: "var(--color-code-keyword)",
  },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: "var(--color-code-string)" },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: "var(--color-code-number)" },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: "var(--color-code-type)" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: "var(--color-code-fn)",
  },
  { tag: [t.attributeName, t.propertyName], color: "var(--color-code-fn)" },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: "var(--color-code-comment)",
    fontStyle: "italic",
  },
  { tag: t.invalid, color: "var(--color-danger)" },
]);

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 退路:某些 WebView 不允许 clipboard API
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

// 图标与 rail/icons.tsx 同一风格:线宽 2、直角线头
const svg = (d: string) =>
  `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="${d}"/></svg>`;
const COPY_ICON = svg("M7 7h10v10H7zM13 7V3H3v10h4");
const CHECK_ICON = svg("M4 10.5l4 4 8-9");

function copyButton(getText: () => string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cb-copy";
  btn.innerHTML = COPY_ICON;
  btn.title = "复制代码";
  btn.setAttribute("aria-label", "复制代码");
  btn.addEventListener("mousedown", (e) => e.preventDefault()); // 不让编辑器失焦或移动光标
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copy(getText());
    if (!ok) {
      btn.title = "复制失败";
      return;
    }
    btn.innerHTML = CHECK_ICON;
    btn.title = "已复制";
    btn.classList.add("done");
    setTimeout(() => {
      btn.innerHTML = COPY_ICON;
      btn.title = "复制代码";
      btn.classList.remove("done");
    }, 1200);
  });
  return btn;
}

/** 代码块的各个部分 */
export interface CodeParts {
  /** 开头 ``` 所在行的行首,到结尾 ``` 所在行(或最后一行)的行尾 */
  from: number;
  to: number;
  lang: string;
  textFrom: number;
  textTo: number;
}

export function codeParts(state: EditorState, node: SyntaxNode): CodeParts {
  const doc = state.doc;
  const info = node.getChild("CodeInfo");
  const text = node.getChild("CodeText");
  return {
    from: doc.lineAt(node.from).from,
    to: doc.lineAt(node.to).to,
    lang: info ? doc.sliceString(info.from, info.to) : "",
    textFrom: text?.from ?? doc.lineAt(node.from).to,
    textTo: text?.to ?? doc.lineAt(node.from).to,
  };
}

/** 代码块里有分隔行或图块占位(内置解析器在列表里可能跨块):不渲染成盒子,保持原样 */
export function spansBlocks(state: EditorState, p: CodeParts) {
  const doc = state.doc;
  for (let n = doc.lineAt(p.from).number; n <= doc.lineAt(p.to).number; n++)
    if (doc.line(n).text.charCodeAt(0) === CTRL) return true;
  return false;
}

/** 选区碰到了这个代码块:要原样显示,方便编辑 */
export function touched(state: EditorState, p: CodeParts) {
  return state.selection.ranges.some((r) => r.to >= p.from && r.from <= p.to);
}

/** 原样显示时,开头一行末尾的复制按钮 */
export class CopyWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(o: CopyWidget) {
    return o.text === this.text;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cb-copy-inline";
    wrap.appendChild(copyButton(() => this.text));
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

/** 所见模式下渲染好的代码块 */
class CodeBlockWidget extends WidgetType {
  constructor(
    readonly p: CodeParts,
    readonly code: string,
    readonly html: string,
    /** 所在的块是当前块:沿用当前块的底色与竖条 */
    readonly inCur: boolean,
    /** 代码块从块的第一行开始:由这里画块序号 */
    readonly no: string | null,
    readonly blockTop: boolean,
    readonly blockBottom: boolean,
  ) {
    super();
  }
  eq(o: CodeBlockWidget) {
    return (
      o.html === this.html &&
      o.p.from === this.p.from &&
      o.p.textFrom === this.p.textFrom &&
      o.p.lang === this.p.lang &&
      o.inCur === this.inCur &&
      o.no === this.no &&
      o.blockTop === this.blockTop &&
      o.blockBottom === this.blockBottom
    );
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = [
      "cb-wrap",
      this.inCur && "cb-cur",
      this.blockTop && "cb-top",
      this.blockBottom && "cb-bottom",
    ]
      .filter(Boolean)
      .join(" ");
    if (this.no) {
      const no = document.createElement("span");
      no.className = "cb-no";
      no.textContent = this.no;
      wrap.appendChild(no);
    }
    const box = document.createElement("div");
    box.className = "cb";
    const head = document.createElement("div");
    head.className = "cb-head";
    const lang = document.createElement("span");
    lang.className = "cb-lang";
    lang.textContent = this.p.lang || "代码";
    head.append(
      lang,
      copyButton(() => this.code),
    );
    const pre = document.createElement("pre");
    pre.className = "cb-code";
    pre.innerHTML = this.html;
    box.append(head, pre);
    wrap.appendChild(box);
    // 点代码:光标放到对应的行和列,代码块切回原样以便编辑
    wrap.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest(".cb-copy")) return;
      e.preventDefault();
      let pos = this.p.from;
      const ln = (e.target as HTMLElement).closest<HTMLElement>(".cb-line");
      if (ln) {
        pos = Number(ln.dataset.pos);
        const hit = document.caretRangeFromPoint?.(e.clientX, e.clientY);
        if (hit && ln.contains(hit.startContainer)) {
          const r = document.createRange();
          r.selectNodeContents(ln);
          r.setEnd(hit.startContainer, hit.startOffset);
          pos += r.toString().length;
        }
      }
      view.dispatch({ selection: { anchor: Math.min(pos, this.p.to) } });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
  get estimatedHeight() {
    return (this.code.split("\n").length + 1) * 21 + 24;
  }
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

/** 代码的 HTML:每行一个 .cb-line(带文档位置,点击时定位),记号用高亮样式的 class */
function highlighted(state: EditorState, p: CodeParts): string {
  const doc = state.doc;
  const tree = syntaxTree(state);
  const spans: { from: number; to: number; cls: string }[] = [];
  if (p.textTo > p.textFrom)
    highlightTree(tree, codeStyle, (from, to, cls) => spans.push({ from, to, cls }), p.textFrom, p.textTo);
  const out: string[] = [];
  let si = 0;
  for (
    let n = doc.lineAt(p.textFrom).number;
    p.textTo > p.textFrom && n <= doc.lineAt(p.textTo).number;
    n++
  ) {
    const l = doc.line(n);
    let html = "";
    let pos = l.from;
    while (si < spans.length && spans[si].to <= l.from) si++;
    for (let i = si; i < spans.length && spans[i].from < l.to; i++) {
      const s = spans[i];
      const a = Math.max(s.from, l.from);
      const b = Math.min(s.to, l.to);
      if (a > pos) html += esc(doc.sliceString(pos, a));
      if (b > a) html += `<span class="${s.cls}">${esc(doc.sliceString(a, b))}</span>`;
      pos = Math.max(pos, b);
    }
    if (l.to > pos) html += esc(doc.sliceString(pos, l.to));
    out.push(`<div class="cb-line" data-pos="${l.from}">${html || "<br>"}</div>`);
  }
  return out.join("");
}

function buildWidgets(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = [];
  const blocks = state.field(blocksField);
  const cur = state.field(drawEditingField) ? undefined : currentBlock(state);
  syntaxTree(state).iterate({
    enter: (n) => {
      if (n.name !== "FencedCode") return;
      const p = codeParts(state, n.node);
      if (touched(state, p) || spansBlocks(state, p)) return false;
      const i = blocks.findIndex((b) => b.contentFrom <= p.from && p.to <= b.contentTo);
      const blk = blocks[i];
      if (!blk) return false;
      const code = state.doc.sliceString(p.textFrom, p.textTo);
      const blockTop = state.doc.lineAt(blk.contentFrom).from === p.from;
      const blockBottom = state.doc.lineAt(blk.contentTo).to === p.to;
      out.push(
        Decoration.replace({
          widget: new CodeBlockWidget(
            p,
            code,
            highlighted(state, p),
            cur?.id === blk.id,
            blockTop ? String(i + 1).padStart(2, "0") : null,
            blockTop,
            blockBottom,
          ),
          block: true,
        }).range(p.from, p.to),
      );
      return false;
    },
  });
  return Decoration.set(out, true);
}

/** 所见模式:渲染好的代码块(跨行的替换装饰必须来自 StateField) */
export const codeWidgets = StateField.define<DecorationSet>({
  create: buildWidgets,
  update(v, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      syntaxTree(tr.startState) !== syntaxTree(tr.state) ||
      tr.startState.field(drawEditingField) !== tr.state.field(drawEditingField)
    )
      return buildWidgets(tr.state);
    return v;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme({
  // 原样显示的代码块:每行带底色
  ".cm-line.md-codeblock": {
    backgroundImage: "linear-gradient(var(--color-code-bg), var(--color-code-bg))",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "calc(var(--line-pad) - 10px) 0",
    backgroundSize: "calc(100% - var(--line-pad) - 4px) 100%",
  },
  // 原样显示时 ``` 行末的按钮:比一行矮,并且浮在下一行之上,底边不会被下一行的代码底色盖住
  ".cb-copy-inline": { float: "right", marginRight: "4px", position: "relative", zIndex: "1" },
  ".cb-copy-inline .cb-copy": { width: "22px", height: "18px", marginTop: "1px" },
  ".cb-copy": {
    width: "24px",
    height: "22px",
    display: "inline-grid",
    placeItems: "center",
    padding: "0",
    border: "var(--border-width) solid var(--color-divider)",
    borderRadius: "var(--radius)",
    background: "var(--color-surface)",
    color: "var(--color-muted)",
    font: "var(--text-xs) var(--font-ui)",
    lineHeight: "18px",
    cursor: "pointer",
  },
  ".cb-copy:hover": { color: "var(--color-text)", borderColor: "var(--color-border)" },
  ".cb-copy.done": { color: "var(--color-success)", borderColor: "var(--color-success)" },
  ".cb-copy svg": { display: "block" },
  ".cb-note": { marginLeft: "12px", fontSize: "var(--text-xs)", whiteSpace: "nowrap" },
  ".cb-note.ok": { color: "var(--color-success)" },
  ".cb-note.err": { color: "var(--color-danger)" },
  // 渲染好的代码块:块内的一个圆角盒子
  ".cb-wrap": { position: "relative", padding: "2px 20px 2px calc(var(--line-pad) - 10px)" },
  ".cb-wrap.cb-top": { paddingTop: "var(--space-3)" },
  ".cb-wrap.cb-bottom": { paddingBottom: "var(--space-3)" },
  ".cb-wrap.cb-cur": {
    margin: "0 var(--island-gap)",
    "--line-pad": "42px",
    background: "var(--color-current)",
    boxShadow: "inset var(--current-bar) 0 0 var(--color-primary)",
  },
  ".cb-wrap.cb-cur.cb-top": { borderTopLeftRadius: "8px", borderTopRightRadius: "8px" },
  ".cb-wrap.cb-cur.cb-bottom": { borderBottomLeftRadius: "8px", borderBottomRightRadius: "8px" },
  ".cb-no": {
    position: "absolute",
    left: "14px",
    top: "var(--space-3)",
    color: "var(--color-muted)",
    fontSize: "var(--text-sm)",
    lineHeight: "1.9",
  },
  ".cb-cur .cb-no": { left: "8px", color: "var(--color-text)", fontWeight: "var(--weight-strong)" },
  ".cb": { borderRadius: "8px", background: "var(--color-code-bg)", overflow: "hidden" },
  ".cb-head": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "26px",
    padding: "0 4px 0 10px",
    color: "var(--color-muted)",
    fontSize: "var(--text-xs)",
  },
  ".cb-code": {
    margin: "0",
    padding: "0 10px 8px",
    font: "inherit",
    lineHeight: "var(--leading-body)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    cursor: "text",
  },
});

// ───────── 格式化(⇧⌥F)─────────

/** 格式化的结果提示:显示在开头 ``` 那一行末尾,几秒后消失(不弹窗,不打断书写) */
const setNote = StateEffect.define<{ at: number; text: string; ok: boolean } | null>();
const noteField = StateField.define<{ at: number; text: string; ok: boolean } | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setNote)) return e.value;
    return v && tr.docChanged ? { ...v, at: tr.changes.mapPos(v.at) } : v;
  },
  provide: (f) =>
    EditorView.decorations.compute([f], (state) => {
      const n = state.field(f);
      if (!n) return Decoration.none;
      const at = state.doc.lineAt(Math.min(n.at, state.doc.length)).to;
      return Decoration.set([Decoration.widget({ widget: new NoteWidget(n.text, n.ok), side: 2 }).range(at)]);
    }),
});

class NoteWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly ok: boolean,
  ) {
    super();
  }
  eq(o: NoteWidget) {
    return o.text === this.text && o.ok === this.ok;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = this.ok ? "cb-note ok" : "cb-note err";
    el.setAttribute("role", "status");
    el.textContent = `${this.ok ? "✓" : "✕"} ${this.text}`;
    return el;
  }
}

/** 光标所在的顶层代码块 */
function fencedAt(state: EditorState, pos: number): SyntaxNode | null {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent)
    if (n.name === "FencedCode") return n;
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent)
    if (n.name === "FencedCode") return n;
  return null;
}

let noteTimer: ReturnType<typeof setTimeout> | undefined;

/** ⇧⌥F:格式化光标所在代码块的内容。光标不在代码块里时不处理。 */
export function formatCodeBlock(view: EditorView): boolean {
  const { state } = view;
  const head = state.selection.main.head;
  const node = fencedAt(state, head);
  if (!node) return false;
  const p = codeParts(state, node);
  if (spansBlocks(state, p) || p.textTo <= p.textFrom) return true;
  const code = state.doc.sliceString(p.textFrom, p.textTo);
  const note = (text: string, ok: boolean) => {
    clearTimeout(noteTimer);
    view.dispatch({ effects: setNote.of({ at: p.from, text, ok }) });
    noteTimer = setTimeout(() => view.dispatch({ effects: setNote.of(null) }), 2500);
  };
  void import("./format-code").then(async ({ formatCode }) => {
    const r = await formatCode(code, p.lang);
    // 格式化期间内容被改过:放弃,以免覆盖新的输入
    if (view.state.doc.sliceString(p.textFrom, p.textTo) !== code) return;
    if (!r.ok) return note(r.message, false);
    if (r.code === code) return note("已经是格式化好的", true);
    // 光标留在原来的行(按行号),列不超过该行长度
    const doc = view.state.doc;
    const curLine = doc.lineAt(view.state.selection.main.head);
    const row = Math.max(0, curLine.number - doc.lineAt(p.textFrom).number);
    const lines = r.code.split("\n");
    const r0 = Math.min(row, lines.length - 1);
    const col = Math.min(view.state.selection.main.head - curLine.from, lines[r0].length);
    const anchor = p.textFrom + lines.slice(0, r0).reduce((n, l) => n + l.length + 1, 0) + col;
    view.dispatch({
      changes: { from: p.textFrom, to: p.textTo, insert: r.code },
      selection: { anchor },
      userEvent: "input.format",
    });
    note("已格式化", true);
  });
  return true;
}

/**
 * 上下方向键:下一行是渲染好的代码块时(中间隔着块分隔也算),光标进到代码的最后一行或第一行,
 * 代码块随之切回原样。否则 CodeMirror 会把整个代码块当成一个不可进入的整体直接跳过。
 */
function enterCode(dir: -1 | 1) {
  return (view: EditorView): boolean => {
    const set = view.state.field(codeWidgets, false);
    const sel = view.state.selection.main;
    if (!set || !sel.empty) return false;
    const doc = view.state.doc;
    const from = doc.lineAt(sel.head);
    let n = from.number + dir;
    while (n >= 1 && n <= doc.lines && doc.line(n).text.charCodeAt(0) === CTRL) n += dir;
    if (n < 1 || n > doc.lines) return false;
    const target = doc.line(n);
    let p: CodeParts | null = null;
    set.between(target.from, target.to, (_a, _b, deco) => {
      p = (deco.spec.widget as CodeBlockWidget).p;
    });
    if (!p) return false;
    const { textFrom, textTo, from: start } = p as CodeParts;
    const line = textTo > textFrom ? doc.lineAt(dir < 0 ? textTo : textFrom) : doc.lineAt(start);
    const col = Math.min(sel.head - from.from, line.length);
    view.dispatch({ selection: { anchor: line.from + col }, scrollIntoView: true, userEvent: "select" });
    return true;
  };
}

export const codeBlocks = {
  /** 两种模式都要:高亮与样式 */
  base: [
    syntaxHighlighting(codeStyle),
    theme,
    noteField,
    // 按物理键位判断:Mac 上 ⇧⌥F 输入的字符是「Ï」,CodeMirror 的 keymap 不会把它映射回 F
    Prec.high(
      EditorView.domEventHandlers({
        keydown: (e, view) => {
          if (e.code !== "KeyF" || !e.altKey || !e.shiftKey || e.metaKey || e.ctrlKey) return false;
          // 不在代码块里时什么也不做,但仍吞掉按键,免得插入「Ï」
          formatCodeBlock(view);
          e.preventDefault();
          return true;
        },
      }),
    ),
  ] as Extension,
  /** 只在所见模式 */
  rendered: [
    codeWidgets,
    Prec.high(
      keymap.of([
        { key: "ArrowUp", run: enterCode(-1) },
        { key: "ArrowDown", run: enterCode(1) },
      ]),
    ),
  ] as Extension,
};
