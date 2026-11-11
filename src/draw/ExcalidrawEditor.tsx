// 按需加载的图块编辑器:只有在打开图块编辑时才会下载和执行 Excalidraw(ADR-0002)。
// 融入页面(design.md v3):画布透明;打开时图停在预览的位置(同样的原点、100% 缩放);
// Excalidraw 自带的工具条和菜单由 CSS 隐藏,工具由 DrawBlock 的块工具条通过 setTool 切换。
import "@excalidraw/excalidraw/index.css";
import {
  Excalidraw,
  exportToSvg,
  getCommonBounds,
  hashElementsVersion,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ToolType,
} from "@excalidraw/excalidraw/types";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Drawing } from "../ipc";
import { DrawProps, type PropsState } from "./DrawProps";

/** 选了这些工具时,属性面板设定接下来画的图形 */
const SHAPE_TOOLS = new Set(["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text"]);

export type DrawTool = Extract<
  ToolType,
  "selection" | "rectangle" | "diamond" | "ellipse" | "arrow" | "line" | "freedraw" | "text" | "eraser"
>;

export interface EditorHandle {
  /** 有未保存的改动就立即保存;返回画布是否为空 */
  flush: () => Promise<{ empty: boolean }>;
  setTool: (t: DrawTool) => void;
}

interface Props {
  initial: Drawing | null;
  dark: boolean;
  onSave: (d: Drawing) => void;
  /** 当前工具变了(包括在画布上按快捷键切换的) */
  onTool: (t: string) => void;
  handle: MutableRefObject<EditorHandle | null>;
}

interface Scene {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}

const AUTOSAVE_MS = 800;
/** 预览 SVG 的四周留白;编辑器据此对齐原点 */
export const EXPORT_PADDING = 16;

function parseScene(d: Drawing | null): ExcalidrawInitialDataState {
  // 透明画布:透出当前块的底色
  const base = { viewBackgroundColor: "transparent", zoom: { value: 1 as never } };
  if (!d?.scene) return { appState: { ...base, scrollX: 0, scrollY: 0 } };
  try {
    const s = JSON.parse(d.scene) as ExcalidrawInitialDataState;
    const live = (s.elements ?? []).filter((e) => !e.isDeleted);
    // 与预览 SVG 的原点一致:导出时以内容左上角减去留白为原点
    const [minX, minY] = live.length ? getCommonBounds(live) : [0, 0];
    return {
      elements: s.elements,
      files: s.files,
      appState: {
        ...s.appState,
        ...base,
        scrollX: -(minX - EXPORT_PADDING),
        scrollY: -(minY - EXPORT_PADDING),
      },
    };
  } catch (e) {
    console.error("图块场景无法解析", e);
    return { appState: base };
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
    exportPadding: EXPORT_PADDING,
  });
  return { scene, svg: svg.outerHTML };
}

export default function ExcalidrawEditor({ initial, dark, onSave, onTool, handle }: Props) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const tool$ = useRef(onTool);
  tool$.current = onTool;
  const lastTool = useRef<string | null>(null);
  const [props, setProps] = useState<PropsState | null>(null);
  const propsSig = useRef("");
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
    handle.current = {
      flush,
      setTool: (type) => api.current?.setActiveTool({ type }),
    };
    return () => {
      handle.current = null;
      void flush(); // 卸载前把最后的改动存下来(场景已在 latest 里,不依赖 Excalidraw 实例)
    };
  }, [flush, handle]);

  return (
    <>
      <Excalidraw
        initialData={initialData}
        theme={dark ? "dark" : "light"}
        langCode="zh-CN"
        autoFocus
        excalidrawAPI={(a) => {
          api.current = a;
        }}
        UIOptions={{
          tools: { image: false },
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
          if (appState.activeTool.type !== lastTool.current) {
            lastTool.current = appState.activeTool.type;
            tool$.current(appState.activeTool.type);
          }
          // 属性面板:有选中的图形,或选了绘图工具时显示;内容没变就不重绘
          const selected = elements.filter((e) => !e.isDeleted && appState.selectedElementIds[e.id]);
          const show = selected.length > 0 || SHAPE_TOOLS.has(appState.activeTool.type);
          const pick = (e: {
            strokeColor: string;
            backgroundColor: string;
            strokeWidth: number;
            strokeStyle: string;
            roughness: number;
          }) => [e.strokeColor, e.backgroundColor, e.strokeWidth, e.strokeStyle, e.roughness].join(",");
          const sig = show
            ? `${selected.map((e) => `${e.id}:${pick(e)}`).join(";")}|${appState.currentItemStrokeColor},${appState.currentItemBackgroundColor},${appState.currentItemStrokeWidth},${appState.currentItemStrokeStyle},${appState.currentItemRoughness}`
            : "";
          if (sig !== propsSig.current) {
            propsSig.current = sig;
            setProps(show ? { selected, appState } : null);
          }
          const h = hashElementsVersion(elements);
          if (savedHash.current === null) savedHash.current = h; // 首次回调是载入的内容
          if (h === savedHash.current) return;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
        }}
      />
      {props && api.current && <DrawProps api={api.current} {...props} />}
    </>
  );
}
