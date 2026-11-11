// CodeMirror 块级 widget:把图块的分隔行和占位行整体换成「序号 + React 挂载点」。
// 序号由这里直接画(块增删时原地更新),图块内容交给 React(DrawBlock)。
import { type EditorView, WidgetType } from "@codemirror/view";

export interface DrawMount {
  mount: (el: HTMLElement, id: string, key: string) => void;
  unmount: (el: HTMLElement) => void;
}

const cls = (first: boolean) => (first ? "blk-draw blk-draw-first" : "blk-draw");
const label = (no: number) => String(no).padStart(2, "0");

export class DrawWidget extends WidgetType {
  constructor(
    readonly host: DrawMount,
    readonly id: string,
    readonly key: string,
    readonly first: boolean,
    readonly no: number,
  ) {
    super();
  }
  eq(o: DrawWidget) {
    return (
      o.host === this.host &&
      o.id === this.id &&
      o.key === this.key &&
      o.first === this.first &&
      o.no === this.no
    );
  }
  // 只是位置变了(是否第一块、序号):沿用原来的 DOM,不重新挂载 Excalidraw
  updateDOM(dom: HTMLElement, _view: EditorView, from: DrawWidget) {
    if (from.host !== this.host || from.id !== this.id || from.key !== this.key) return false;
    dom.className = cls(this.first);
    const no = dom.querySelector(".draw-no-n");
    if (no) no.textContent = label(this.no);
    return true;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = cls(this.first);
    const no = document.createElement("span");
    no.className = "draw-no";
    no.setAttribute("aria-hidden", "true");
    no.innerHTML = `<span class="draw-no-n">${label(this.no)}</span><i>◇</i>`;
    const mount = document.createElement("div");
    el.append(no, mount);
    this.host.mount(mount, this.id, this.key);
    return el;
  }
  destroy(el: HTMLElement) {
    const mount = el.lastElementChild;
    if (mount instanceof HTMLElement) this.host.unmount(mount);
  }
  // 图块里的鼠标、键盘事件都交给图块自己(Excalidraw)处理
  ignoreEvent() {
    return true;
  }
  get estimatedHeight() {
    return 160;
  }
}
