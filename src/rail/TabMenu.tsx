import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TabMeta } from "../ipc";
import { CheckIcon } from "./icons";

export interface TabMenuTarget {
  tab: TabMeta;
  x: number;
  y: number;
  /** 关闭后焦点回到这里(打开菜单的 tab) */
  opener: HTMLElement | null;
}

interface Props extends TabMenuTarget {
  synced: boolean;
  /** 本机已配置主密钥 */
  cryptoReady: boolean;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onToggleSync: () => Promise<void>;
  onToggleEncrypt: () => Promise<void>;
  onOpenSettings: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * tab 的右键菜单:上移、下移(拖动排序的键盘替代)、同步、加密、删除。
 * 删除与其他不可逆操作一样,在原位置变成「再按一次确认」(design.md UX 原则 4)。
 */
export function TabMenu(p: Props) {
  const { tab, onClose } = p;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: p.x, top: p.y });
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = tab.locked ? "加密 tab" : tab.name;

  // 贴着视口边缘时往回收
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(p.x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(p.y, window.innerHeight - r.height - 4)),
    });
  }, [p.x, p.y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role^=menuitem]:not([disabled])")?.focus();
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  const closeAndReturn = () => {
    onClose();
    p.opener?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not([disabled])") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (j: number) => items[(j + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") closeAndReturn();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      closeAndReturn();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={ref}
      className="ctx"
      role="menu"
      aria-label={`tab「${name}」`}
      style={pos}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={!p.canMoveUp}
        onClick={() => {
          p.onMove(-1);
          closeAndReturn();
        }}
      >
        <span className="ctx-check" />
        上移
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!p.canMoveDown}
        onClick={() => {
          p.onMove(1);
          closeAndReturn();
        }}
      >
        <span className="ctx-check" />
        下移
      </button>
      <hr />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={p.synced}
        disabled={busy}
        onClick={run(p.onToggleSync)}
      >
        <span className="ctx-check">{p.synced && <CheckIcon />}</span>
        同步
      </button>
      {p.cryptoReady ? (
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={!!tab.encrypted}
          disabled={busy || tab.locked}
          onClick={run(p.onToggleEncrypt)}
        >
          <span className="ctx-check">{tab.encrypted && <CheckIcon />}</span>
          加密
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          title="本机还没有设置主密钥"
          onClick={() => {
            onClose();
            p.onOpenSettings();
          }}
        >
          <span className="ctx-check">{tab.encrypted && <CheckIcon />}</span>
          加密 <span className="muted">先设置主密钥 →</span>
        </button>
      )}
      <hr />
      <button
        type="button"
        role="menuitem"
        className={armed ? "danger armed" : "danger"}
        disabled={!p.canDelete}
        title={p.canDelete ? undefined : "至少保留一个 tab"}
        onClick={() => {
          if (!armed) return setArmed(true);
          onClose();
          p.onDelete();
        }}
      >
        <span className="ctx-check" />
        {armed ? "再按一次确认删除" : "删除"}
      </button>
      {err && (
        <p className="ctx-err" role="alert">
          ✕ {err}
        </p>
      )}
    </div>
  );
}
