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

export const TrashIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M3 5.5h14M8 5.5V3h4v2.5M5 5.5 6 17h8l1-11.5M8.5 9v5M11.5 9v5" />
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
    <path d="M16.02 8.51 L18.09 8.65 L18.09 11.35 L16.02 11.49 L15.31 13.20 L16.67 14.77 L14.77 16.67 L13.20 15.31 L11.49 16.02 L11.35 18.09 L8.65 18.09 L8.51 16.02 L6.80 15.31 L5.23 16.67 L3.33 14.77 L4.69 13.20 L3.98 11.49 L1.91 11.35 L1.91 8.65 L3.98 8.51 L4.69 6.80 L3.33 5.23 L5.23 3.33 L6.80 4.69 L8.51 3.98 L8.65 1.91 L11.35 1.91 L11.49 3.98 L13.20 4.69 L14.77 3.33 L16.67 5.23 L15.31 6.80Z" />
    <circle cx="10" cy="10" r="2.6" />
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

export const MenuIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M3 5h14M3 10h14M3 15h14" />
  </svg>
);
