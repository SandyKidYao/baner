// CodeMirror 块级 widget:把图块的分隔行和占位行整体换成一个 React 挂载点。
import { type EditorView, WidgetType } from "@codemirror/view";

export interface DrawMount {
  mount: (el: HTMLElement, id: string, key: string) => void;
  unmount: (el: HTMLElement) => void;
}

const cls = (first: boolean) => (first ? "blk-draw blk-draw-first" : "blk-draw");

export class DrawWidget extends WidgetType {
  constructor(
    readonly host: DrawMount,
    readonly id: string,
    readonly key: string,
    readonly first: boolean,
  ) {
    super();
  }
  eq(o: DrawWidget) {
    return o.host === this.host && o.id === this.id && o.key === this.key && o.first === this.first;
  }
  // 只是位置变了(是否第一块):沿用原来的 DOM,不重新挂载 Excalidraw
  updateDOM(dom: HTMLElement, _view: EditorView, from: DrawWidget) {
    if (from.host !== this.host || from.id !== this.id || from.key !== this.key) return false;
    dom.className = cls(this.first);
    return true;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = cls(this.first);
    this.host.mount(el, this.id, this.key);
    return el;
  }
  destroy(el: HTMLElement) {
    this.host.unmount(el);
  }
  // 图块里的鼠标、键盘事件都交给图块自己(Excalidraw)处理
  ignoreEvent() {
    return true;
  }
  get estimatedHeight() {
    return 160;
  }
}
