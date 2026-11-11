import { useEffect, useRef } from "react";
import type { TabMeta } from "../ipc";
import { GearIcon, LockIcon, PlusIcon } from "./icons";

interface Props {
  tabs: TabMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onSettings: () => void;
  onClose: () => void;
}

/** 手机布局:轨道收进左侧抽屉。点遮罩或按 Esc 关闭,关闭后焦点回到 ≡。 */
export function Drawer({ tabs, activeId, onSelect, onCreate, onSettings, onClose }: Props) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    nav.current?.querySelector<HTMLElement>("[aria-current=page], button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <div className="drawer-wrap">
      <button type="button" className="scrim" aria-label="关闭 tab 列表" tabIndex={-1} onClick={onClose} />
      <nav ref={nav} className="drawer" aria-label="tab">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === activeId ? "row act" : "row"}
            aria-current={t.id === activeId ? "page" : undefined}
            onClick={pick(() => onSelect(t.id))}
          >
            <span className="row-glyph" aria-hidden="true">
              {t.glyph}
            </span>
            <span className="row-name">{t.locked ? "加密 tab" : t.name}</span>
            {t.encrypted && (
              <span className="row-sym" title="加密">
                <LockIcon />
              </span>
            )}
          </button>
        ))}
        <button type="button" className="row muted" onClick={pick(onCreate)}>
          <span className="row-glyph" aria-hidden="true">
            <PlusIcon />
          </span>
          <span className="row-name">新 tab</span>
        </button>
        <button type="button" className="row muted" onClick={pick(onSettings)}>
          <span className="row-glyph" aria-hidden="true">
            <GearIcon />
          </span>
          <span className="row-name">同步与加密</span>
        </button>
      </nav>
    </div>
  );
}
