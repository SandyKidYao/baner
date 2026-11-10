import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { type Block, deleteBlock, loadBlocks, saveBlock } from "../ipc";
import { debounce } from "./debounce";
import { blockExtensions } from "./editor";
import { diff, newBlock, parse, serialize } from "./model";

interface Props {
  tab: string;
  onReady?: () => void;
}

/** 一个 tab 的分块编辑器:载入块文件 → 编辑 → 停止输入 300ms 后只保存有变化的块。 */
export function TabEditor({ tab, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    let view: EditorView | undefined;
    let cancelled = false;
    const saved = new Map<string, Block>();
    let chain = Promise.resolve();

    const persist = (doc: string) => {
      chain = chain.then(async () => {
        const { upserts, deletes } = diff(saved, parse(doc));
        for (const b of deletes) {
          await deleteBlock(tab, b);
          saved.delete(b.id);
        }
        for (const b of upserts) {
          await saveBlock(tab, b);
          saved.set(b.id, b);
        }
      });
      chain = chain.catch((e) => console.error("保存失败", e));
    };
    const save = debounce(persist, 300);
    const flush = () => view && save.flush(view.state.doc.toString());

    loadBlocks(tab)
      .then((blocks) => {
        if (cancelled || !host.current) return;
        for (const b of blocks) saved.set(b.id, b);
        const initial = blocks.length > 0 ? blocks : [newBlock(null, null)];
        const doc = serialize(initial);
        view = new EditorView({
          parent: host.current,
          state: EditorState.create({
            doc,
            selection: { anchor: doc.length },
            extensions: [
              blockExtensions(),
              EditorView.contentAttributes.of({ "aria-label": "块编辑区", "data-testid": "editor" }),
              EditorView.updateListener.of((u) => {
                if (u.docChanged) save(u.state.doc.toString());
              }),
            ],
          }),
        });
        view.focus();
      })
      .catch((e) => console.error("载入失败", e))
      .finally(() => ready.current?.());

    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      cancelled = true;
      flush();
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", flush);
      view?.destroy();
    };
  }, [tab]);

  return <div ref={host} className="tab-editor" />;
}
