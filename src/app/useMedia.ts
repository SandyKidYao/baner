import { useSyncExternalStore } from "react";

/** 跟随一条媒体查询(窗口宽度、亮暗模式)。 */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const q = window.matchMedia(query);
      q.addEventListener("change", fn);
      return () => q.removeEventListener("change", fn);
    },
    () => window.matchMedia(query).matches,
  );
}

/** 宽度不到 600 时按手机布局(design.md「间距与布局」) */
export const NARROW = "(max-width: 599px)";
export const useNarrow = () => useMedia(NARROW);
