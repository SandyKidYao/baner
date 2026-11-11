export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = IS_MAC ? "⌘" : "Ctrl+";
/** ⇧⌥ 组合(格式化代码块 ⇧⌥F) */
export const SHIFT_ALT = IS_MAC ? "⇧⌥" : "Shift+Alt+";

export function isMod(e: KeyboardEvent) {
  return IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}
