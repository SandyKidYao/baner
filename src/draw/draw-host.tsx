// 一个 tab 编辑器里所有图块的宿主:挂载 React、缓存内容、记录哪个图块正在编辑、把保存排进编辑器的保存队列。
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import { blocksField, type DrawHooks } from "../blocks/editor";
import { newBlock, serialize } from "../blocks/model";
import { type Block, type Drawing, loadDrawing, saveDrawing } from "../ipc";
import { DrawBlock } from "./DrawBlock";
import { DrawWidget } from "./widget";

interface Options {
  tab: string;
  /** 排进编辑器的保存队列,与文本块的写入、删除保持先后顺序 */
  enqueue: (op: () => Promise<unknown>) => void;
  /** 图块落盘后调用 */
  onSaved: (b: Block) => void;
}

export class DrawHost {
  view: EditorView | null = null;
  /** 最近一次读到或保存的内容;块被删掉后仍保留,撤销删除时据此写回 */
  readonly cache = new Map<string, Drawing>();
  editing: string | null = null;
  /** 从磁盘重新载入后递增,图块据此重新读取 */
  epoch = 0;
  readonly hooks: DrawHooks;
  private roots = new Map<HTMLElement, Root>();
  private flushers = new Map<string, () => Promise<unknown>>();
  private listeners = new Set<() => void>();

  constructor(private opts: Options) {
    this.hooks = {
      widget: (b, first) => new DrawWidget(this, b.id, b.key, first),
      inserted: (id) => this.open(id),
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private emit() {
    for (const fn of this.listeners) fn();
  }

  mount(el: HTMLElement, id: string, key: string) {
    const root = createRoot(el);
    root.render(<DrawBlock host={this} id={id} blockKey={key} />);
    this.roots.set(el, root);
  }
  unmount(el: HTMLElement) {
    const root = this.roots.get(el);
    this.roots.delete(el);
    // CodeMirror 可能在 React 提交过程中销毁 widget,推迟卸载以免 React 报错
    if (root) setTimeout(() => root.unmount(), 0);
  }

  async load(id: string, key: string): Promise<Drawing | null> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const d = await loadDrawing(this.opts.tab, { id, key });
    if (d) this.cache.set(id, d);
    return d;
  }

  save(id: string, key: string, d: Drawing) {
    this.cache.set(id, d);
    this.opts.enqueue(async () => {
      await saveDrawing(this.opts.tab, { id, key }, d);
      this.opts.onSaved({ id, key, text: "", kind: "draw" });
    });
  }

  open(id: string) {
    this.editing = id;
    this.emit();
  }
  close(id: string) {
    if (this.editing !== id) return;
    this.editing = null;
    this.emit();
  }

  /** 正在编辑的图块登记「立即保存」,供同步前落盘 */
  registerFlush(id: string, fn: () => Promise<unknown>) {
    this.flushers.set(id, fn);
    return () => {
      if (this.flushers.get(id) === fn) this.flushers.delete(id);
    };
  }
  async flush() {
    await Promise.all([...this.flushers.values()].map((f) => f()));
  }

  /** 磁盘内容可能变了(同步之后):丢掉缓存,让预览重新读取 */
  reload() {
    this.cache.clear();
    this.epoch++;
    this.emit();
  }

  /** 从文档里删掉一个图块(可以 ⌘Z 撤销),光标移到相邻的块 */
  remove(id: string) {
    const view = this.view;
    if (!view) return;
    const blocks = view.state.field(blocksField);
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const b = blocks[i];
    const next = blocks[i + 1];
    const changes =
      i > 0
        ? { from: b.headerFrom - 1, to: b.contentTo }
        : next
          ? { from: b.headerFrom, to: next.headerFrom }
          : { from: 0, to: view.state.doc.length, insert: serialize([newBlock(null, null)]) };
    const anchor = i > 0 ? blocks[i - 1].contentTo : next ? next.contentFrom - next.headerFrom : 0;
    view.dispatch({ changes, selection: EditorSelection.cursor(anchor), userEvent: "delete.draw" });
    view.focus();
  }

  /** 结束编辑后,光标回到图块后面的文本块 */
  focusAfter(id: string) {
    const view = this.view;
    if (!view) return;
    const blocks = view.state.field(blocksField);
    const next = blocks[blocks.findIndex((b) => b.id === id) + 1];
    if (next && !next.draw)
      view.dispatch({ selection: EditorSelection.cursor(next.contentTo), scrollIntoView: true });
    view.focus();
  }

  destroy() {
    for (const el of [...this.roots.keys()]) this.unmount(el);
    this.listeners.clear();
  }
}
