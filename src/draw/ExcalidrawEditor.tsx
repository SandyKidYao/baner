// 按需加载的图块编辑器:只有在打开图块编辑时才会下载和执行 Excalidraw(ADR-0002)。
import "@excalidraw/excalidraw/index.css";
import { Excalidraw, exportToSvg, hashElementsVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import type { Drawing } from "../ipc";

export interface EditorHandle {
  /** 有未保存的改动就立即保存;返回画布是否为空 */
  flush: () => Promise<{ empty: boolean }>;
}

interface Props {
  initial: Drawing | null;
  dark: boolean;
  onSave: (d: Drawing) => void;
  handle: MutableRefObject<EditorHandle | null>;
}

interface Scene {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}

const AUTOSAVE_MS = 800;

function parseScene(d: Drawing | null): ExcalidrawInitialDataState | null {
  if (!d?.scene) return null;
  try {
    const s = JSON.parse(d.scene) as ExcalidrawInitialDataState;
    return { elements: s.elements, appState: s.appState, files: s.files, scrollToContent: true };
  } catch (e) {
    console.error("图块场景无法解析", e);
    return null;
  }
}

/** 场景 JSON 与 SVG 预览。SVG 不带背景,并内嵌用到的字形,离开应用也能显示。 */
export async function toDrawing({ elements, appState, files }: Scene): Promise<Drawing> {
  const live = elements.filter((e) => !e.isDeleted);
  const scene = serializeAsJSON(live, appState, files, "local");
  const svg = await exportToSvg({
    elements: live,
    appState: { ...appState, exportBackground: false, exportWithDarkMode: false, exportEmbedScene: false },
    files,
    exportPadding: 16,
  });
  return { scene, svg: svg.outerHTML };
}

export default function ExcalidrawEditor({ initial, dark, onSave, handle }: Props) {
  const initialData = useMemo(() => parseScene(initial), [initial]);
  const latest = useRef<Scene | null>(null);
  const savedHash = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save$ = useRef(onSave);
  save$.current = onSave;

  const inflight = useRef<Promise<void>>(Promise.resolve());

  const flush = useMemo(
    () => async () => {
      clearTimeout(timer.current);
      const s = latest.current;
      if (!s) return { empty: !initialData?.elements?.length };
      const empty = !s.elements.some((e) => !e.isDeleted);
      const h = hashElementsVersion(s.elements);
      if (h !== savedHash.current) {
        savedHash.current = h;
        // 排在上一次保存之后,保证调用方 await 返回时内容已交给宿主
        inflight.current = inflight.current
          .then(async () => save$.current(await toDrawing(s)))
          .catch((e) => console.error("图块保存失败", e));
      }
      await inflight.current;
      return { empty };
    },
    [initialData],
  );

  useEffect(() => {
    handle.current = { flush };
    return () => {
      handle.current = null;
      void flush(); // 卸载前把最后的改动存下来(场景已在 latest 里,不依赖 Excalidraw 实例)
    };
  }, [flush, handle]);

  return (
    <Excalidraw
      initialData={initialData}
      theme={dark ? "dark" : "light"}
      langCode="zh-CN"
      autoFocus
      UIOptions={{
        canvasActions: {
          loadScene: false,
          saveToActiveFile: false,
          saveAsImage: false,
          export: false,
          toggleTheme: false,
          changeViewBackgroundColor: false,
        },
      }}
      onChange={(elements, appState, files) => {
        latest.current = { elements, appState, files };
        const h = hashElementsVersion(elements);
        if (savedHash.current === null) savedHash.current = h; // 首次回调是载入的内容
        if (h === savedHash.current) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
      }}
    />
  );
}
