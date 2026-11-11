import { type ReactNode, useRef, useState } from "react";
import type { TabMeta } from "../ipc";
import { LockIcon, PlusIcon } from "./icons";
import { MOD } from "./keys";

interface Props {
  tabs: TabMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  /** 拖动排序:把 id 移到 before 之前(null 为末尾) */
  onMove: (id: string, before: string | null) => void;
  /** 右键(或 Shift+F10)打开 tab 菜单 */
  onMenu: (tab: TabMeta, x: number, y: number, opener: HTMLElement) => void;
  /** 轨道底部:同步符号、⚙ */
  footer?: ReactNode;
}

const DRAG_START_PX = 5;

interface Drag {
  id: string;
  y0: number;
  dy: number;
  moved: boolean;
  before: string | null;
}

/** 键盘打开菜单:Shift+F10 或菜单键(macOS 不会把它们转成 contextmenu 事件) */
export const isMenuKey = (e: React.KeyboardEvent) =>
  e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");

/** 右键菜单的位置:鼠标触发时跟随指针;键盘触发(坐标为 0)时贴在元素右侧 */
export function menuPoint(e: React.MouseEvent<HTMLElement>) {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.right + 4, y: r.top };
}

/** 左侧轨道:单字 tab,悬停显示全名与快捷键;上下拖动排序,右键打开菜单。 */
export function Rail({ tabs, activeId, onSelect, onCreate, onMove, onMenu, footer }: Props) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const movable = tabs.filter((t) => !t.locked);

  /** 指针所在位置对应的插入点:落在哪个 tab 的上半部分就插到它前面 */
  const beforeAt = (y: number, id: string): string | null => {
    for (const t of movable) {
      if (t.id === id) continue;
      const r = refs.current.get(t.id)?.getBoundingClientRect();
      if (r && y < r.top + r.height / 2) return t.id;
    }
    return null;
  };
  // 放回原处时不显示插入线
  const isNoop = (d: Drag) => {
    const i = movable.findIndex((t) => t.id === d.id);
    return d.before === (movable[i + 1]?.id ?? null);
  };
  const end = () => {
    drag.current = null;
    setDragging(null);
  };

  const shown = dragging?.moved && !isNoop(dragging) ? dragging : null;
  const lastMovable = movable[movable.length - 1]?.id;

  return (
    <nav className="rail" aria-label="tab">
      {tabs.map((t, i) => {
        const hint = i < 9 ? ` ${MOD}${i + 1}` : "";
        const name = t.locked ? "加密 tab" : t.name;
        let cls = t.id === activeId ? "tab act" : "tab";
        if (dragging?.moved && dragging.id === t.id) cls += " dragging";
        if (shown?.before === t.id) cls += " drop-above";
        if (shown && shown.before === null && t.id === lastMovable) cls += " drop-below";
        return (
          <button
            key={t.id}
            ref={(el) => {
              if (el) refs.current.set(t.id, el);
              else refs.current.delete(t.id);
            }}
            type="button"
            className={cls}
            style={
              dragging?.moved && dragging.id === t.id
                ? { transform: `translateY(${dragging.dy}px)` }
                : undefined
            }
            aria-current={t.id === activeId ? "page" : undefined}
            aria-label={name}
            title={`${name}${hint}${t.locked ? "" : "(拖动排序,右键更多)"}`}
            onPointerDown={(e) => {
              if (e.button !== 0 || t.locked) return;
              drag.current = { id: t.id, y0: e.clientY, dy: 0, moved: false, before: null };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const dy = e.clientY - d.y0;
              if (!d.moved && Math.abs(dy) < DRAG_START_PX) return;
              d.moved = true;
              d.dy = dy;
              d.before = beforeAt(e.clientY, d.id);
              setDragging({ ...d });
            }}
            onPointerUp={() => {
              const d = drag.current;
              end();
              if (!d?.moved) return;
              suppressClick.current = true; // 拖动结束时浏览器还会补发一次 click
              setTimeout(() => {
                suppressClick.current = false;
              }, 0);
              if (!isNoop(d)) onMove(d.id, d.before);
            }}
            onPointerCancel={end}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              onSelect(t.id);
            }}
            onKeyDown={(e) => {
              if (!isMenuKey(e)) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              onMenu(t, r.right + 4, r.top, e.currentTarget);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              end();
              const { x, y } = menuPoint(e);
              onMenu(t, x, y, e.currentTarget);
            }}
          >
            {t.glyph}
            {t.encrypted && !t.locked && (
              <i className="badge">
                <LockIcon />
              </i>
            )}
          </button>
        );
      })}
      <button
        type="button"
        className="tab add"
        aria-label="新 tab"
        title={`新 tab ${MOD}T`}
        onClick={onCreate}
      >
        <PlusIcon />
      </button>
      <span className="rail-spacer" />
      {footer}
    </nav>
  );
}
