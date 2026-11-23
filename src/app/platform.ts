// 运行在哪类设备上。界面按窗口宽度切换布局(useNarrow),这里只回答宽度回答不了的问题。

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const touchMac = typeof navigator !== "undefined" && /Mac/.test(ua) && navigator.maxTouchPoints > 1;

/** 手机:横屏时宽度也可能超过 600,仍按手机布局 */
export const IS_PHONE = /iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua));

/** iOS / iPadOS / Android:没有应用内更新(ADR-0010 只覆盖桌面),切到后台后 JS 会被冻结 */
export const IS_MOBILE_OS = /iPhone|iPad|iPod|Android/.test(ua) || touchMac;
