import { EditorView } from "@codemirror/view";
import { IS_MOBILE_OS } from "./platform";

/**
 * 手机上让应用跟着软键盘缩放:iOS 弹出键盘时不缩小页面,而是把整页往上推,顶栏会被推出屏幕。
 * 这里把可见区域的高度写进 --app-height(.app 用它做高度),并把页面滚回顶部;
 * 键盘弹出时给根元素加 kb-open,底部不再为横条留白。
 */
export function followVisualViewport() {
  const vv = window.visualViewport;
  if (!IS_MOBILE_OS || !vv) return;
  const root = document.documentElement;
  let lastHeight = 0;
  const update = () => {
    const h = Math.round(vv.height);
    root.style.setProperty("--app-height", `${h}px`);
    root.classList.toggle("kb-open", window.innerHeight - h > 120);
    if (window.scrollY !== 0) window.scrollTo(0, 0);
    if (h < lastHeight) keepCursorVisible();
    lastHeight = h;
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}

/** 可见区域变矮(键盘弹出)后,把正在编辑的光标滚回视野 */
function keepCursorVisible() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !el.closest(".cm-content")) return;
  const view = EditorView.findFromDOM(el);
  if (view)
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest" }) });
}
