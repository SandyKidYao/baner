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

export const SyncIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 10a6 6 0 0 1 10.5-4M16 10a6 6 0 0 1-10.5 4" />
    <path d="M14.5 2.5V6H11M5.5 17.5V14H9" />
  </svg>
);

export const GearIcon = () => (
  <svg {...base} aria-hidden="true">
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" />
  </svg>
);

export const AlertIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M10 3l8 14H2z" />
    <path d="M10 8v4M10 14.5v.5" />
  </svg>
);

export const CrossIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);

export const CheckIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 10.5l4 4 8-9" />
  </svg>
);

export const EyeIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
    <circle cx="10" cy="10" r="2.2" />
  </svg>
);

export const LockIcon = () => (
  <svg {...base} aria-hidden="true">
    <rect x="4.5" y="9" width="11" height="8" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </svg>
);
