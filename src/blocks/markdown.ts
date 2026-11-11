// 文本块的 Markdown 显示(design.md v3)。文件仍是纯 .md,这里只决定怎么显示:
// - 所见(wysiwyg):除光标所在行外,隐藏标记并渲染样式(标题、粗体、斜体、删除线、代码、链接、
//   列表、待办、引用);光标所在行显示淡色标记,方便直接改。Obsidian 的「实时预览」做法。
// - 源码(source):原样显示 Markdown,只给标记上色。
import { defineLanguageFacet, Language, syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, Prec } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { parser as baseParser, GFM, type MarkdownConfig } from "@lezer/markdown";

export type MdMode = "wysiwyg" | "source";

const CTRL = 31; // 分隔行与图块占位行都以 \u001f 开头(model.ts)

// 分隔行单独成为一个节点,并且打断段落、列表、引用,块与块之间的 Markdown 结构不会串起来
const BlockSep: MarkdownConfig = {
  defineNodes: [{ name: "BlockSep", block: true }],
  parseBlock: [
    {
      name: "BlockSep",
      before: "LinkReference",
      parse(cx, line) {
        if (line.text.charCodeAt(0) !== CTRL) return false;
        cx.addElement(cx.elt("BlockSep", cx.lineStart, cx.lineStart + line.text.length));
        cx.nextLine();
        return true;
      },
      endLeaf: (_cx, line) => line.text.charCodeAt(0) === CTRL,
    },
  ],
};

export const mdLanguage = new Language(
  defineLanguageFacet({ commentTokens: { block: { open: "<!--", close: "-->" } } }),
  baseParser.configure([GFM, BlockSep]),
  [],
  "markdown",
);

class Bullet extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "md-bullet";
    el.textContent = "•";
    return el;
  }
}

class Checkbox extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(o: Checkbox) {
    return o.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "md-task";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.setAttribute("aria-label", this.checked ? "已完成" : "未完成");
    // 直接改源文本里的 [ ] / [x];不移动光标
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(wrap);
      const line = view.state.doc.lineAt(pos);
      const m = /\[( |x|X)\]/.exec(line.text.slice(pos - line.from));
      if (!m) return;
      const at = pos + m.index + 1;
      view.dispatch({
        changes: { from: at, to: at + 1, insert: this.checked ? " " : "x" },
        userEvent: "input.task",
      });
    });
    wrap.appendChild(box);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

const hide = Decoration.replace({});
const mark = (cls: string) => Decoration.mark({ class: cls });
const lineCls = (cls: string) => Decoration.line({ class: cls });

/** 选区覆盖到的行号:这些行显示原始标记 */
function activeLines(state: EditorState): Set<number> {
  const out = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out;
}

interface Item {
  from: number;
  to: number;
  deco: Decoration;
}

function build(view: EditorView, mode: MdMode): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const active = mode === "wysiwyg" ? activeLines(state) : new Set<number>();
  const live = (pos: number) => mode === "wysiwyg" && !active.has(doc.lineAt(pos).number);
  const items: Item[] = [];
  const add = (from: number, to: number, deco: Decoration) => {
    if (to > from) items.push({ from, to, deco });
  };
  const lines = (from: number, to: number, cls: string) => {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      const l = doc.line(n);
      items.push({ from: l.from, to: l.from, deco: lineCls(cls) });
    }
  };
  /** 标记:所见模式下不在光标行就隐藏(连同紧跟的一个空格),否则上色 */
  const marker = (from: number, to: number, withSpace = false) => {
    const end = withSpace && doc.sliceString(to, to + 1) === " " ? to + 1 : to;
    if (live(from)) add(from, end, hide);
    else add(from, to, mark("md-mk"));
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (n) => {
        const name = n.name;
        if (name === "BlockSep") return false;
        const h = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
        if (h) {
          const level = Math.min(3, Number(h[1]));
          lines(n.from, n.to, `md-h md-h${level}`);
          return;
        }
        switch (name) {
          case "HeaderMark":
            if (n.node.parent?.name.startsWith("Setext")) marker(n.from, n.to);
            else marker(n.from, n.to, true);
            return;
          case "StrongEmphasis":
            add(n.from, n.to, mark("md-strong"));
            return;
          case "Emphasis":
            add(n.from, n.to, mark("md-em"));
            return;
          case "Strikethrough":
            add(n.from, n.to, mark("md-strike"));
            return;
          case "EmphasisMark":
          case "StrikethroughMark":
            marker(n.from, n.to);
            return;
          case "InlineCode":
            add(n.from, n.to, mark("md-code"));
            return;
          case "CodeMark":
            if (n.node.parent?.name === "InlineCode") marker(n.from, n.to);
            else add(n.from, n.to, mark("md-mk")); // 代码块的 ``` 始终可见
            return;
          case "FencedCode":
          case "CodeBlock":
            lines(n.from, n.to, "md-codeblock");
            return;
          case "Link": {
            const marks = n.node.getChildren("LinkMark");
            const url = n.node.getChild("URL");
            if (marks.length >= 2) {
              add(marks[0].to, marks[1].from, mark("md-link"));
              if (live(n.from)) {
                add(marks[0].from, marks[0].to, hide);
                add(marks[1].from, n.to, hide);
              } else {
                add(marks[0].from, marks[0].to, mark("md-mk"));
                add(marks[1].from, n.to, mark("md-mk"));
              }
            } else if (url) add(url.from, url.to, mark("md-link"));
            return false;
          }
          case "Blockquote":
            lines(n.from, n.to, "md-quote");
            return;
          case "QuoteMark":
            marker(n.from, n.to, true);
            return;
          case "ListItem": {
            const ordered = n.node.parent?.name === "OrderedList";
            const task = n.node.getChild("Task");
            const lm = n.node.getChild("ListMark");
            if (!lm) return;
            const l = doc.lineAt(lm.from);
            items.push({ from: l.from, to: l.from, deco: lineCls(task ? "md-li md-li-task" : "md-li") });
            const tm = task?.getChild("TaskMarker");
            if (tm) {
              const checked = /x/i.test(doc.sliceString(tm.from, tm.to));
              if (checked) add(tm.to, task?.to ?? tm.to, mark("md-done"));
              if (live(lm.from)) {
                const end = doc.sliceString(tm.to, tm.to + 1) === " " ? tm.to + 1 : tm.to;
                add(lm.from, end, Decoration.replace({ widget: new Checkbox(checked) }));
              } else {
                add(lm.from, lm.to, mark("md-mk"));
                add(tm.from, tm.to, mark("md-mk"));
              }
            } else if (live(lm.from) && !ordered) {
              add(lm.from, lm.to, Decoration.replace({ widget: new Bullet() }));
            } else {
              add(lm.from, lm.to, mark(ordered ? "md-num" : "md-mk"));
            }
            return;
          }
          case "HorizontalRule":
            add(n.from, n.to, mark("md-mk"));
            return;
        }
      },
    });
  }
  return Decoration.set(
    items.map((it) => it.deco.range(it.from, it.to)),
    true,
  );
}

function livePlugin(mode: MdMode) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, mode);
      }
      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          syntaxTree(u.startState) !== syntaxTree(u.state)
        )
          this.decorations = build(u.view, mode);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

/** 列表里回车:续上同样的前缀(有序列表加一、待办变成未完成);空的列表项回车则结束列表 */
function continueList(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const m = /^(\s*)(?:([-*+])|(\d+)([.)]))( \[[ xX]\])? /.exec(line.text);
  if (!m || sel.head < line.from + m[0].length) return false;
  if (line.text.length === m[0].length) {
    view.dispatch({ changes: { from: line.from, to: line.to }, userEvent: "delete.list" });
    return true;
  }
  const next = `${m[1]}${m[2] ?? `${Number(m[3]) + 1}${m[4]}`}${m[5] ? " [ ]" : ""} `;
  const insert = `\n${next}`;
  view.dispatch({
    changes: { from: sel.head, insert },
    selection: { anchor: sel.head + insert.length },
    scrollIntoView: true,
    userEvent: "input.list",
  });
  return true;
}

const theme = EditorView.theme({
  ".md-mk": { color: "var(--color-faint)" },
  ".md-h": { fontWeight: "var(--weight-strong)" },
  ".md-h1": { fontSize: "1.55em", lineHeight: "1.4" },
  ".md-h2": { fontSize: "1.25em", lineHeight: "1.45" },
  ".md-h3": { fontSize: "1.05em" },
  ".md-strong": { fontWeight: "var(--weight-strong)" },
  ".md-em": { fontStyle: "italic" },
  ".md-strike": { textDecoration: "line-through", textDecorationColor: "var(--color-faint)" },
  ".md-code": { background: "var(--color-code-bg)", borderRadius: "4px", padding: "0 2px" },
  ".md-codeblock": { background: "var(--color-code-bg)" },
  ".md-link": { color: "var(--color-link)", textDecoration: "underline", textUnderlineOffset: "2px" },
  // 引用:竖线画在正文左边(行的左内边距里),不贴着岛的边缘
  ".cm-line.md-quote": {
    color: "var(--color-muted)",
    backgroundImage: "linear-gradient(var(--color-divider), var(--color-divider))",
    backgroundSize: "3px 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "calc(var(--line-pad) - 10px) 0",
  },
  ".md-done": {
    color: "var(--color-muted)",
    textDecoration: "line-through",
    textDecorationColor: "var(--color-faint)",
  },
  ".md-num": { color: "var(--color-muted)" },
  // 列表悬挂缩进:标记挂在左边,正文和换行后的文字对齐
  ".cm-line.md-li": { paddingLeft: "calc(var(--line-pad) + 2ch)", textIndent: "-2ch" },
  ".cm-line.md-li-task": { paddingLeft: "calc(var(--line-pad) + 3ch)", textIndent: "-3ch" },
  // 挂在悬挂缩进里的符号:text-indent 会继承进 inline-block,这里归零
  ".md-bullet": { color: "var(--color-primary)", display: "inline-block", width: "2ch", textIndent: "0" },
  ".md-task": { display: "inline-block", width: "3ch", textIndent: "0" },
  ".md-task input": {
    width: "13px",
    height: "13px",
    margin: "0",
    verticalAlign: "-2px",
    accentColor: "var(--color-primary)",
    cursor: "pointer",
  },
});

// 源码模式:字号统一,只给标记上色
const sourceTheme = EditorView.theme({
  ".md-mk, .md-num": { color: "var(--color-primary)", opacity: "0.8" },
  ".md-h1, .md-h2, .md-h3": { fontSize: "inherit", lineHeight: "inherit" },
  ".md-link": { color: "inherit" },
  ".md-code, .md-codeblock": { background: "none" },
  ".cm-line.md-quote": { backgroundImage: "none", color: "inherit" },
  ".cm-line.md-li, .cm-line.md-li-task": { paddingLeft: "var(--line-pad)", textIndent: "0" },
});

/** Markdown 显示扩展。切换模式时整体替换(TabEditor 用 Compartment)。 */
export function markdown(mode: MdMode): Extension {
  return [
    mdLanguage,
    theme,
    mode === "source" ? sourceTheme : [],
    livePlugin(mode),
    Prec.high(keymap.of([{ key: "Enter", run: continueList }])),
    EditorView.editorAttributes.of({ class: `md-${mode}` }),
  ];
}
