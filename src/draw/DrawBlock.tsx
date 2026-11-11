// 一个图块:平时只显示 SVG 预览(不加载 Excalidraw);点击后在块内原地打开 Excalidraw。
import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Drawing } from "../ipc";
import { CheckIcon, EraseIcon } from "../rail/icons";
import type { DrawHost } from "./draw-host";
import type { EditorHandle } from "./ExcalidrawEditor";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

const ExcalidrawEditor = lazy(() => {
  // 字体随应用本地提供(vite.config.ts),不从 CDN 下载
  window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
  return import("./ExcalidrawEditor");
});

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");
function useDark() {
  return useSyncExternalStore(
    (fn) => {
      const q = darkQuery();
      q.addEventListener("change", fn);
      return () => q.removeEventListener("change", fn);
    },
    () => darkQuery().matches,
  );
}

interface Props {
  host: DrawHost;
  id: string;
  blockKey: string;
}

export function DrawBlock({ host, id, blockKey }: Props) {
  const editing = useSyncExternalStore(host.subscribe, () => host.editing === id);
  const epoch = useSyncExternalStore(host.subscribe, () => host.epoch);
  const dark = useDark();
  /** undefined:读取中;null:还没有内容(新图块) */
  const [drawing, setDrawing] = useState<Drawing | null | undefined>(undefined);
  const handle = useRef<EditorHandle | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: epoch 与 editing 变化时都要从宿主重新读取
  useEffect(() => {
    let off = false;
    host
      .load(id, blockKey)
      .then((d) => !off && setDrawing(d))
      .catch((e) => console.error("图块载入失败", e));
    return () => {
      off = true;
    };
  }, [host, id, blockKey, epoch, editing]);

  // 高度变化时让 CodeMirror 重新测量,否则点击位置会错
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => host.view?.requestMeasure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [host]);

  useEffect(() => {
    if (!editing) return;
    return host.registerFlush(id, () => handle.current?.flush() ?? Promise.resolve());
  }, [host, id, editing]);

  const done = async () => {
    const r = await handle.current?.flush();
    host.close(id);
    if (r?.empty) host.remove(id);
    else host.focusAfter(id);
  };
  const remove = async () => {
    await handle.current?.flush(); // 留在缓存里,⌘Z 撤销时能写回
    host.close(id);
    host.remove(id);
  };

  const src = useMemo(
    () => (drawing?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.svg)}` : null),
    [drawing],
  );

  return (
    <div ref={root} className={editing ? "draw editing" : "draw"} data-testid="draw-block">
      <span className="draw-gutter" aria-hidden="true">
        ◇
      </span>
      {editing ? (
        <>
          <div className="draw-bar">
            <button
              type="button"
              className="sym"
              aria-label="删除图块"
              title="删除图块(⌘Z 可撤销)"
              onClick={remove}
            >
              <EraseIcon />
            </button>
            <button type="button" className="sym on" aria-label="完成" title="完成" onClick={done}>
              <CheckIcon />
            </button>
          </div>
          <div className="draw-canvas">
            {drawing !== undefined && (
              <Suspense fallback={<div className="draw-loading">◇ …</div>}>
                <ExcalidrawEditor
                  initial={drawing}
                  dark={dark}
                  handle={handle}
                  onSave={(d) => host.save(id, blockKey, d)}
                />
              </Suspense>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          className="draw-preview"
          aria-label="编辑图块"
          title="编辑图块"
          onClick={() => host.open(id)}
        >
          {src ? (
            <img src={src} alt="图块" draggable={false} />
          ) : (
            <span className="muted">{drawing === undefined ? "◇ …" : "◇ 空图块"}</span>
          )}
        </button>
      )}
    </div>
  );
}
