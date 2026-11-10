// CodeMirror 6 扩展:把一个文档显示成多个块。
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorSelection, EditorState, type Extension, RangeSetBuilder, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { header, isValidDoc, MARK, newBlock, parseHeader } from "./model";

/** 一个块在文档中的位置。headerFrom..headerTo 是分隔行;contentFrom..contentTo 是正文。 */
export interface BlockRange {
  id: string;
  key: string;
  headerFrom: number;
  headerTo: number;
  contentFrom: number;
  contentTo: number;
}

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
    out.push({ ...h, headerFrom: line.from, headerTo: line.to, contentFrom, contentTo: doc.length });
  }
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
  state.field(blocksField).forEach((blk, i) => {
    b.add(blk.headerFrom, blk.headerTo, Decoration.replace({ widget: new Separator(i === 0), block: true }));
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
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const { state } = view;
      const cur = currentBlock(state);
      const b = new RangeSetBuilder<Decoration>();
      state.field(blocksField).forEach((blk, i) => {
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
  view.dispatch({
    changes: { from: cur.headerFrom - 1, to: cur.contentTo },
    selection: EditorSelection.cursor(prev.contentTo),
    userEvent: "delete.block",
  });
  return true;
}

// 复制、剪切时去掉分隔行,粘贴出来是纯文本
const plainClipboard = EditorView.clipboardOutputFilter.of((text) =>
  text
    .split("\n")
    .filter((l) => !l.startsWith(MARK))
    .join("\n"),
);

// 编辑器与块的样式。用 EditorView.theme 注入,优先级高于 CodeMirror 的基础主题。
const theme = EditorView.theme({
  "&": {
    height: "100%",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontSize: "var(--text-md)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-body)", lineHeight: "var(--leading-body)" },
  ".cm-content": { padding: "0 0 var(--space-8)", caretColor: "var(--color-primary)" },
  ".cm-line": { padding: "0 20px 0 48px" },
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
    color: "var(--color-muted)",
    fontSize: "var(--text-sm)",
  },
  ".blk-cur": {
    background: "var(--color-current)",
    boxShadow: "inset var(--current-bar) 0 0 var(--color-primary)",
  },
  ".blk-cur.blk-first::before": { color: "var(--color-text)", fontWeight: "var(--weight-strong)" },
  // 冲突块:左侧加粗的警告色竖条(形状上也与普通当前块不同:更宽)
  ".blk-conflict": { boxShadow: "inset 8px 0 0 var(--color-warning)" },
});

export function blockExtensions(): Extension[] {
  return [
    theme,
    blocksField,
    separators,
    blockLines,
    protectStructure,
    plainClipboard,
    history(),
    keymap.of([
      { key: "Mod-Enter", run: insertBlockAfter },
      { key: "Mod-a", run: selectBlockOrAll },
      { key: "Backspace", run: deleteEmptyBlock },
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.lineWrapping,
  ];
}
