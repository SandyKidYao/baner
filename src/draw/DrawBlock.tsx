// 一个图块:平时只显示 SVG 预览(不加载 Excalidraw);点击后在块内原地打开 Excalidraw。
// 编辑中就是一个「当前块」:一行块工具条(绘图工具 | 删除、完成),下面是透明的画布,底边可以拖动调高度。
import {
  type KeyboardEvent,
  lazy,
  type PointerEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useMedia, useNarrow } from "../app/useMedia";
import type { Drawing } from "../ipc";
import { CheckIcon, EraseIcon } from "../rail/icons";
import { isMod, MOD } from "../rail/keys";
import type { DrawHost } from "./draw-host";
import type { DrawTool, EditorHandle } from "./ExcalidrawEditor";
import { ToolIcon } from "./tool-icons";

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

/** 块工具条上的工具;快捷键与 Excalidraw 自己的一致(焦点在画布上时直接按) */
const TOOLS: [DrawTool, string, string][] = [
  ["selection", "选择", "V"],
  ["rectangle", "矩形", "R"],
  ["diamond", "菱形", "D"],
  ["ellipse", "椭圆", "O"],
  ["arrow", "箭头", "A"],
  ["line", "线", "L"],
  ["freedraw", "画笔", "P"],
  ["text", "文字", "T"],
  ["eraser", "橡皮", "E"],
];

const MIN_H = 160;
const MAX_H = 900;
const NEW_H = 320;
/** 打开编辑时,在预览图下面多留的空间 */
const ROOM = 96;

/** 预览 SVG 的高度(导出时写在 height 属性里) */
function svgHeight(svg: string | undefined): number | null {
  const m = svg && /<svg[^>]*\sheight="([\d.]+)"/.exec(svg);
  return m ? Number(m[1]) : null;
}
const clamp = (h: number) => Math.round(Math.min(MAX_H, Math.max(MIN_H, h)));

interface Props {
  host: DrawHost;
  id: string;
  blockKey: string;
}

export function DrawBlock({ host, id, blockKey }: Props) {
  const open = useSyncExternalStore(host.subscribe, () => host.editing === id);
  const epoch = useSyncExternalStore(host.subscribe, () => host.epoch);
  const dark = useMedia("(prefers-color-scheme: dark)");
  const readOnly = useNarrow(); // 手机布局下图块只读(mvp U16)
  const editing = open && !readOnly;
  /** undefined:读取中;null:还没有内容(新图块) */
  const [drawing, setDrawing] = useState<Drawing | null | undefined>(undefined);
  const [tool, setTool] = useState<string>("selection");
  const [height, setHeight] = useState<number | null>(null);
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

  // 打开编辑时的画布高度:预览图的高度再多留一些空间
  useEffect(() => {
    if (!editing) setHeight(null);
    else if (drawing !== undefined)
      setHeight((h) => h ?? clamp((svgHeight(drawing?.svg) ?? NEW_H - ROOM) + ROOM));
  }, [editing, drawing]);

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

  // 拖动底边调整画布高度
  const drag = useRef<{ y0: number; h0: number } | null>(null);
  const onResizeDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { y0: e.clientY, h0: height ?? NEW_H };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setHeight(clamp(d.h0 + e.clientY - d.y0));
  };
  const onResizeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === "ArrowDown") setHeight((h) => clamp((h ?? NEW_H) + step));
    else if (e.key === "ArrowUp") setHeight((h) => clamp((h ?? NEW_H) - step));
    else return;
    e.preventDefault();
  };

  const src = useMemo(
    () => (drawing?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.svg)}` : null),
    [drawing],
  );

  if (!editing) {
    return (
      <div ref={root} className="draw" data-testid="draw-block">
        {readOnly ? (
          <div className="draw-preview" title="图块(手机布局下只读)">
            {src ? <img src={src} alt="图块" draggable={false} /> : <span className="muted">◇</span>}
          </div>
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

  return (
    <div
      ref={root}
      className="draw editing"
      data-testid="draw-block"
      onKeyDownCapture={(e) => {
        if (isMod(e.nativeEvent) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          done();
        }
      }}
    >
      <div className="dtools">
        <div className="xtools" role="toolbar" aria-label="绘图工具">
          {TOOLS.map(([t, name, key], i) => (
            <span key={t} style={{ display: "contents" }}>
              {(i === 7 || i === 8) && <span className="sep" aria-hidden="true" />}
              <button
                type="button"
                aria-pressed={tool === t}
                aria-label={name}
                title={`${name} ${key}`}
                onClick={() => {
                  handle.current?.setTool(t);
                  setTool(t);
                }}
              >
                <ToolIcon tool={t} />
                <span className="kk" aria-hidden="true">
                  {key}
                </span>
              </button>
            </span>
          ))}
        </div>
        <span className="dhint">
          {MOD}Z 撤销 · {MOD}↵ 完成
        </span>
        <span className="dend">
          <button
            type="button"
            className="sym"
            aria-label="删除图块"
            title="删除图块(⌘Z 可撤销)"
            onClick={remove}
          >
            <EraseIcon />
          </button>
          <button type="button" className="sym on" aria-label="完成" title={`完成 ${MOD}↵`} onClick={done}>
            <CheckIcon />
          </button>
        </span>
      </div>
      <div className="draw-canvas" style={{ height: height ?? NEW_H }}>
        {drawing !== undefined && (
          <Suspense fallback={<div className="draw-loading">◇ …</div>}>
            <ExcalidrawEditor
              initial={drawing}
              dark={dark}
              handle={handle}
              onTool={setTool}
              onSave={(d) => host.save(id, blockKey, d)}
            />
          </Suspense>
        )}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: 可拖动的分隔条,hr 不能获得焦点 */}
      <div
        className="resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整图块高度(上下方向键)"
        aria-valuenow={height ?? NEW_H}
        aria-valuemin={MIN_H}
        aria-valuemax={MAX_H}
        tabIndex={0}
        title="拖动调整高度"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={() => {
          drag.current = null;
        }}
        onKeyDown={onResizeKey}
      />
    </div>
  );
}
