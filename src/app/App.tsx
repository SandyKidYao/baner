import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { debounce } from "../blocks/debounce";
import { appReady, loadBlocks, saveBlock } from "../ipc";

// 行走骨架:一个 tab、一个块,证明 界面 → IPC → 核心层 → 文件 → 重启读回 这条路径。
const TAB = "default";
const BLOCK = { id: "b0", key: "a0" };

export default function App() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let view: EditorView | undefined;
    let cancelled = false;
    const save = debounce((text: string) => {
      saveBlock(TAB, { ...BLOCK, text }).catch((e) => console.error("save_block", e));
    }, 300);

    loadBlocks(TAB)
      .then((blocks) => {
        if (cancelled || !host.current) return;
        const text = blocks.find((b) => b.id === BLOCK.id)?.text ?? "";
        view = new EditorView({
          parent: host.current,
          state: EditorState.create({
            doc: text,
            extensions: [
              EditorView.lineWrapping,
              EditorView.theme({
                "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
                  background: "var(--color-current)",
                },
              }),
              EditorView.contentAttributes.of({ "aria-label": "块编辑区", "data-testid": "editor" }),
              EditorView.updateListener.of((u) => {
                if (u.docChanged) save(u.state.doc.toString());
              }),
            ],
          }),
        });
        view.focus();
      })
      .catch((e) => console.error("load_blocks", e))
      // 隐藏窗口里不执行 requestAnimationFrame,所以用 setTimeout 触发显示(见 Spike perf-baseline)
      .finally(() => setTimeout(() => appReady().catch(() => {}), 0));

    return () => {
      cancelled = true;
      view?.destroy();
    };
  }, []);

  return <main ref={host} style={{ height: "100%" }} />;
}
