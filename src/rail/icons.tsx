// 符号图标:线宽 2,直角线头(主题 B)。都是装饰,文字说明由按钮的 aria-label 提供。
const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "square" as const,
};

export const PlusIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M10 4v12M4 10h12" />
  </svg>
);

export const EraseIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M7 5h10v10H7l-4-5z" />
    <path d="M10 8l4 4M14 8l-4 4" />
  </svg>
);
