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
import { type EditorState, type Extension, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
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

function copyButton(getText: () => string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cb-copy";
  btn.textContent = "复制";
  btn.title = "复制代码";
  btn.setAttribute("aria-label", "复制代码");
  btn.addEventListener("mousedown", (e) => e.preventDefault()); // 不让编辑器失焦或移动光标
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copy(getText());
    btn.textContent = ok ? "已复制" : "复制失败";
    btn.classList.toggle("done", ok);
    setTimeout(() => {
      btn.textContent = "复制";
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
  ".cb-copy-inline": { float: "right", marginRight: "4px" },
  ".cb-copy": {
    height: "20px",
    padding: "0 8px",
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

export const codeBlocks = {
  /** 两种模式都要:高亮与样式 */
  base: [syntaxHighlighting(codeStyle), theme] as Extension,
  /** 只在所见模式 */
  rendered: codeWidgets as Extension,
};
