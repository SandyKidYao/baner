// 块工具条的绘图工具图标:线宽 2、直角线头,与 rail/icons.tsx 同一套风格。
import type { DrawTool } from "./ExcalidrawEditor";

const paths: Record<DrawTool, string> = {
  selection: "M5 3l10 6.5-4.5 1.2L8.5 15z",
  rectangle: "M3.5 5h13v10h-13z",
  diamond: "M10 3l7 7-7 7-7-7z",
  ellipse: "M3 10a7 5.5 0 1 0 14 0a7 5.5 0 1 0-14 0",
  arrow: "M3 15L16 4M10 4h6v6",
  line: "M3 15L17 5",
  freedraw: "M4 16c3-1 4-4 6-6s5-4 6-6M13 3l3 3",
  text: "M5 5h10M10 5v11M7.5 16h5",
  eraser: "M8 16h9M4.5 12.5l6-6 4 4-6 6H7z",
};

export function ToolIcon({ tool }: { tool: DrawTool }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d={paths[tool]} />
    </svg>
  );
}
