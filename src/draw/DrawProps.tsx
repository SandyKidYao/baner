// 图块的属性面板(岛的样式):选中图形时修改它们;选了绘图工具时设定接下来画的图形。
// 不用 Excalidraw 自带的面板:画布嵌在页面里,尺寸小,Excalidraw 会切到手机布局,把面板收进底部栏。
import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** 与 Excalidraw 默认调色板一致,导出的 SVG 在别处显示时颜色也一致 */
const STROKES = [
  ["#1e1e1e", "黑"],
  ["#e03131", "红"],
  ["#2f9e44", "绿"],
  ["#1971c2", "蓝"],
  ["#f08c00", "橙"],
] as const;
const FILLS = [
  ["transparent", "无"],
  ["#ffc9c9", "浅红"],
  ["#b2f2bb", "浅绿"],
  ["#a5d8ff", "浅蓝"],
  ["#ffec99", "浅黄"],
] as const;
const WIDTHS = [
  [1, "细"],
  [2, "中"],
  [4, "粗"],
] as const;
const STYLES = [
  ["solid", "实线"],
  ["dashed", "虚线"],
] as const;
const ROUGH = [
  [1, "手绘"],
  [0, "规整"],
] as const;

type Prop = "strokeColor" | "backgroundColor" | "strokeWidth" | "strokeStyle" | "roughness";
const CURRENT: Record<Prop, keyof AppState> = {
  strokeColor: "currentItemStrokeColor",
  backgroundColor: "currentItemBackgroundColor",
  strokeWidth: "currentItemStrokeWidth",
  strokeStyle: "currentItemStrokeStyle",
  roughness: "currentItemRoughness",
};

export interface PropsState {
  /** 选中的图形;为空时修改的是接下来画的图形 */
  selected: readonly ExcalidrawElement[];
  appState: AppState;
}

interface Props extends PropsState {
  api: ExcalidrawImperativeAPI;
}

export function DrawProps({ api, selected, appState }: Props) {
  const value = <K extends Prop>(k: K) =>
    (selected[0]?.[k] ?? appState[CURRENT[k]]) as ExcalidrawElement[K] | AppState[keyof AppState];

  const set = (k: Prop, v: string | number) => {
    const ids = new Set(selected.map((e) => e.id));
    api.updateScene({
      elements: ids.size
        ? api
            .getSceneElements()
            // 只改这五个样式字段,其余字段原样保留
            .map((e) =>
              ids.has(e.id) ? newElementWith(e, { [k]: v } as Parameters<typeof newElementWith>[1]) : e,
            )
        : undefined,
      appState: { [CURRENT[k]]: v } as unknown as AppState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY, // 可以 ⌘Z 撤销
    });
  };

  const row = <T extends string | number>(
    label: string,
    k: Prop,
    opts: readonly (readonly [T, string])[],
    swatch: boolean,
  ) => (
    <fieldset className="dp-row">
      <legend>{label}</legend>
      {opts.map(([v, name]) => (
        <button
          key={String(v)}
          type="button"
          className={swatch ? "dp-sw" : "dp-op"}
          aria-pressed={value(k) === v}
          aria-label={`${label}:${name}`}
          title={name}
          style={swatch ? { background: v === "transparent" ? undefined : String(v) } : undefined}
          onClick={() => set(k, v)}
        >
          {swatch ? null : name}
        </button>
      ))}
    </fieldset>
  );

  return (
    <section
      className="dp"
      aria-label={selected.length ? `图形属性(选中 ${selected.length} 个)` : "接下来画的图形"}
    >
      {row("描边", "strokeColor", STROKES, true)}
      {row("背景", "backgroundColor", FILLS, true)}
      {row("线宽", "strokeWidth", WIDTHS, false)}
      {row("线型", "strokeStyle", STYLES, false)}
      {row("风格", "roughness", ROUGH, false)}
    </section>
  );
}
