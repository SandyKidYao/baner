// CodeMirror 6 扩展:把一个文档显示成多个块。
import { defaultKeymap, history, historyKeymap, simplifySelection } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  type Extension,
  Facet,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { DRAW_LINE, header, isControlLine, isValidDoc, MARK, newBlock, parseHeader } from "./model";

/** 一个块在文档中的位置。headerFrom..headerTo 是分隔行;contentFrom..contentTo 是正文。 */
export interface BlockRange {
  id: string;
  key: string;
  headerFrom: number;
  headerTo: number;
  contentFrom: number;
  contentTo: number;
  /** 图块:正文是一行占位,整块显示成预览图或 Excalidraw */
  draw: boolean;
}

/** 图块的界面由外部提供(src/draw),这里只负责在文档里占位和插入。 */
export interface DrawHooks {
  /** no:块序号(从 1 开始,与文本块一起编号) */
  widget: (b: Pick<BlockRange, "id" | "key">, first: boolean, no: number) => WidgetType;
  /** 新插入的图块:直接打开编辑 */
  inserted: (id: string) => void;
  /** 能否插入图块(手机布局下图块只读) */
  canInsert: () => boolean;
}
export const drawHooks = Facet.define<DrawHooks, DrawHooks | null>({ combine: (v) => v[0] ?? null });

/** 正在编辑的图块(只能有一个);这时它就是「当前块」,文本块不再高亮 */
export const setDrawEditing = StateEffect.define<string | null>();
export const drawEditingField = StateField.define<string | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setDrawEditing)) v = e.value;
    return v;
  },
});

export function scanBlocks(state: EditorState): BlockRange[] {
  const out: BlockRange[] = [];
  const doc = state.doc;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (!line.text.startsWith(MARK)) continue;
    const h = parseHeader(line.text);
    if (!h) continue;
    const prev = out[out.length - 1];
    if (prev) prev.contentTo = Math.max(prev.contentFrom, line.from - 1);
    const contentFrom = Math.min(line.to + 1, doc.length);
    out.push({
      ...h,
      headerFrom: line.from,
      headerTo: line.to,
      contentFrom,
      contentTo: doc.length,
      draw: false,
    });
  }
  for (const b of out) b.draw = doc.sliceString(b.contentFrom, b.contentTo) === DRAW_LINE;
  return out;
}

export const blocksField = StateField.define<BlockRange[]>({
  create: scanBlocks,
  update: (v, tr) => (tr.docChanged ? scanBlocks(tr.state) : v),
});

export function currentBlock(state: EditorState): BlockRange | undefined {
  const pos = state.selection.main.head;
  const blocks = state.field(blocksField);
  let found = blocks[0];
  for (const b of blocks) if (b.headerFrom <= pos) found = b;
  return found;
}

class Separator extends WidgetType {
  constructor(readonly first: boolean) {
    super();
  }
  eq(o: Separator) {
    return o.first === this.first;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = this.first ? "blk-sep blk-sep-first" : "blk-sep";
    el.setAttribute("aria-hidden", "true");
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

// 分隔行替换为分隔线(块级装饰必须由 StateField 提供)
const separators = StateField.define<DecorationSet>({
  create: (s) => buildSeparators(s),
  update: (v, tr) => (tr.docChanged ? buildSeparators(tr.state) : v),
  provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
});

function buildSeparators(state: EditorState): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const hooks = state.facet(drawHooks);
  state.field(blocksField).forEach((blk, i) => {
    if (blk.draw && hooks) {
      // 分隔行和占位行一起换成图块(图块自己画分隔线)
      b.add(
        blk.headerFrom,
        blk.contentTo,
        Decoration.replace({ widget: hooks.widget(blk, i === 0, i + 1), block: true }),
      );
    } else {
      b.add(
        blk.headerFrom,
        blk.headerTo,
        Decoration.replace({ widget: new Separator(i === 0), block: true }),
      );
    }
  });
  return b.finish();
}

// 当前块的底色和竖条、每块首行的序号
const blockLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.selectionSet ||
        u.viewportChanged ||
        u.startState.field(drawEditingField) !== u.state.field(drawEditingField)
      )
        this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const { state } = view;
      const cur = state.field(drawEditingField) ? undefined : currentBlock(state);
      const b = new RangeSetBuilder<Decoration>();
      state.field(blocksField).forEach((blk, i) => {
        if (blk.draw) return;
        const conflict = /^<<<<<<< /m.test(state.doc.sliceString(blk.contentFrom, blk.contentTo));
        const first = state.doc.lineAt(blk.contentFrom);
        const last = state.doc.lineAt(blk.contentTo);
        for (let n = first.number; n <= last.number; n++) {
          const line = state.doc.line(n);
          if (line.from === blk.headerFrom) continue;
          const isCur = blk.id === cur?.id;
          const attrs: Record<string, string> = {};
          let cls = isCur ? "blk-line blk-cur" : "blk-line";
          if (conflict) cls += " blk-conflict";
          if (n === first.number) {
            cls += " blk-first";
            attrs["data-no"] = String(i + 1).padStart(2, "0");
          }
          if (n === last.number) cls += " blk-last";
          b.add(line.from, line.from, Decoration.line({ class: cls, attributes: attrs }));
        }
      });
      return b.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

// 任何会破坏块结构的改动都拒绝(例如在块首按退格,把分隔行并进正文)
const protectStructure = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  return isValidDoc(tr.newDoc.toString()) ? tr : [];
});

/** ⌘↵:在当前块后面新建一个块,光标移进去。 */
export function insertBlockAfter(view: EditorView): boolean {
  const { state } = view;
  const cur = currentBlock(state);
  if (!cur) return false;
  const blocks = state.field(blocksField);
  const next = blocks[blocks.indexOf(cur) + 1];
  const nb = newBlock(cur.key, next?.key ?? null);
  const insert = `\n${header(nb)}\n`;
  const at = cur.contentTo;
  view.dispatch({
    changes: { from: at, insert },
    selection: EditorSelection.cursor(at + insert.length),
    scrollIntoView: true,
    userEvent: "input.block",
  });
  return true;
}

/**
 * ⌘D:插入图块并打开编辑。当前块是空文本块时直接换成图块,否则插在当前块后面;
 * 图块后面没有文本块时,再补一个空文本块,好让光标有地方继续书写。
 */
export function insertDrawing(view: EditorView): boolean {
  const { state } = view;
  const hooks = state.facet(drawHooks);
  const cur = currentBlock(state);
  if (!cur || !hooks) return false;
  if (!hooks.canInsert()) return true;
  const blocks = state.field(blocksField);
  const next = blocks[blocks.indexOf(cur) + 1];
  const replace = !cur.draw && cur.contentFrom === cur.contentTo;
  const nb = replace ? { ...newBlock(null, null), key: cur.key } : newBlock(cur.key, next?.key ?? null);
  let insert = `${replace ? "" : "\n"}${header(nb)}\n${DRAW_LINE}`;
  if (!next || next.draw) insert += `\n${header(newBlock(nb.key, next?.key ?? null))}\n`;
  // 替换时连同空块的分隔行一起换掉;插入时接在当前块末尾
  const from = replace ? cur.headerFrom : cur.contentTo;
  view.dispatch({
    changes: { from, to: cur.contentTo, insert },
    selection: EditorSelection.cursor(from + insert.length),
    scrollIntoView: true,
    userEvent: "input.draw",
  });
  hooks.inserted(nb.id);
  return true;
}

/** ⌘A:第一次选中当前块正文,再按一次选中整页。 */
export function selectBlockOrAll(view: EditorView): boolean {
  const { state } = view;
  const cur = currentBlock(state);
  if (!cur) return false;
  const sel = state.selection.main;
  const blockSelected = sel.from === cur.contentFrom && sel.to === cur.contentTo;
  if (blockSelected || cur.contentFrom === cur.contentTo) {
    const blocks = state.field(blocksField);
    view.dispatch({ selection: EditorSelection.range(blocks[0].contentFrom, state.doc.length) });
  } else {
    view.dispatch({ selection: EditorSelection.range(cur.contentFrom, cur.contentTo) });
  }
  return true;
}

const INDENT = "  "; // Markdown 嵌套列表用两个空格

/** 选区覆盖到的正文行(跳过分隔行和图块占位行) */
function selectedTextLines(state: EditorState) {
  const lines = new Map<number, { from: number; text: string }>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      const l = state.doc.line(n);
      if (!isControlLine(l.text)) lines.set(n, { from: l.from, text: l.text });
    }
  }
  return [...lines.values()];
}

/**
 * Tab:与常见编辑器一致。没有选中文字时,在列表项里把整项往里缩一级,否则在光标处插入两个空格;
 * 选中了文字时,把选中的各行往里缩一级。
 */
export function indent(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.head);
  if (isControlLine(line.text)) return true;
  if (state.selection.ranges.every((r) => r.empty) && !/^\s*([-*+]|\d+[.)]) /.test(line.text)) {
    view.dispatch(state.replaceSelection(INDENT), { scrollIntoView: true, userEvent: "input.indent" });
    return true;
  }
  const changes = selectedTextLines(state).map((l) => ({ from: l.from, insert: INDENT }));
  view.dispatch({ changes, userEvent: "input.indent" });
  return true;
}

/** Shift+Tab:把光标所在或选中的各行往外缩一级(去掉最多两个空格或一个制表符)。 */
export function outdent(view: EditorView): boolean {
  const changes = selectedTextLines(view.state).flatMap((l) => {
    const m = /^( {1,2}|\t)/.exec(l.text);
    return m ? [{ from: l.from, to: l.from + m[0].length }] : [];
  });
  if (changes.length) view.dispatch({ changes, userEvent: "delete.dedent" });
  return true;
}

/** 退格:当前块为空且不是第一块时,删掉这个空块,光标回到上一块末尾。 */
function deleteEmptyBlock(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const cur = currentBlock(state);
  if (!sel.empty || !cur || cur.contentFrom !== cur.contentTo) return false;
  const blocks = state.field(blocksField);
  const i = blocks.indexOf(cur);
  if (i <= 0) return false;
  const prev = blocks[i - 1];
  if (prev.draw) return false; // 光标不能落进图块,保留这个空块
  view.dispatch({
    changes: { from: cur.headerFrom - 1, to: cur.contentTo },
    selection: EditorSelection.cursor(prev.contentTo),
    userEvent: "delete.block",
  });
  return true;
}

// 复制、剪切时去掉分隔行和图块占位,粘贴出来是纯文本
const plainClipboard = EditorView.clipboardOutputFilter.of((text) =>
  text
    .split("\n")
    .filter((l) => !isControlLine(l))
    .join("\n"),
);

// 编辑器与块的样式。用 EditorView.theme 注入,优先级高于 CodeMirror 的基础主题。
const theme = EditorView.theme({
  "&": {
    height: "100%",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontSize: "var(--text-body)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-body)", lineHeight: "var(--leading-body)" },
  ".cm-content": {
    "--line-pad": "48px", // 左侧留给块序号
    padding: "var(--space-1) 0 var(--space-8)",
    caretColor: "var(--color-primary)",
  },
  ".cm-line": { padding: "0 20px 0 var(--line-pad)" },
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--color-primary)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    background: "color-mix(in srgb, var(--color-primary) 28%, transparent)",
  },
  ".blk-sep": { height: "0", borderTop: "var(--border-width) solid var(--color-divider)" },
  ".blk-sep-first": { borderTop: "0" },
  ".blk-line": { position: "relative" },
  ".blk-first": { paddingTop: "var(--space-3)" },
  ".blk-last": { paddingBottom: "var(--space-3)" },
  ".blk-first::before": {
    content: "attr(data-no)",
    position: "absolute",
    left: "14px",
    top: "var(--space-3)",
    color: "var(--color-muted)",
    fontSize: "var(--text-sm)",
    fontWeight: "var(--weight-normal)",
    fontStyle: "normal",
    lineHeight: "1.9",
    textIndent: "0",
  },
  // 当前块:岛内的圆角高亮,左侧主色竖条(Islands)
  ".blk-cur, .blk-conflict": { margin: "0 var(--island-gap)", "--line-pad": "42px" },
  ".blk-cur": {
    background: "var(--color-current)",
    boxShadow: "inset var(--current-bar) 0 0 var(--color-primary)",
  },
  ".blk-cur.blk-first, .blk-conflict.blk-first": { borderTopLeftRadius: "8px", borderTopRightRadius: "8px" },
  ".blk-cur.blk-last, .blk-conflict.blk-last": {
    borderBottomLeftRadius: "8px",
    borderBottomRightRadius: "8px",
  },
  ".blk-cur.blk-first::before, .blk-conflict.blk-first::before": { left: "8px" },
  ".blk-cur.blk-first::before": { color: "var(--color-text)", fontWeight: "var(--weight-strong)" },
  // 冲突块:更宽的警告色竖条(形状上也与当前块不同)
  ".blk-conflict": { boxShadow: "inset 8px 0 0 var(--color-warning)" },
});

export function blockExtensions(): Extension[] {
  return [
    theme,
    blocksField,
    drawEditingField,
    separators,
    blockLines,
    protectStructure,
    plainClipboard,
    history(),
    keymap.of([
      { key: "Mod-Enter", run: insertBlockAfter },
      { key: "Mod-a", run: selectBlockOrAll },
      { key: "Mod-d", run: insertDrawing },
      // Tab 留在编辑器里缩进;要用键盘离开编辑器,先按 Esc 再按 Tab(CodeMirror 的约定)
      { key: "Tab", run: indent, shift: outdent },
      // Esc:收起选区,并让接下来 2 秒内的 Tab 把焦点移出编辑器(有没有选区都一样)
      {
        key: "Escape",
        run: (view) => {
          simplifySelection(view);
          view.setTabFocusMode(2000);
          return true;
        },
      },
      { key: "Backspace", run: deleteEmptyBlock },
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.lineWrapping,
  ];
}
