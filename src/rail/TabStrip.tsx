import { useEffect, useRef, useState } from "react";
import type { TabMeta } from "../ipc";
import { LockIcon, PlusIcon } from "./icons";
import { MOD } from "./keys";
import { TabNameEdit } from "./TabNameEdit";

interface Props {
  tabs: TabMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  /** 拖动排序:把 id 移到 before 之前(null 为末尾) */
  onMove: (id: string, before: string | null) => void;
  /** 右键(或 Shift+F10)打开 tab 菜单 */
  onMenu: (tab: TabMeta, x: number, y: number, opener: HTMLElement) => void;
  /** 正在改名的 tab */
  renaming: string | null;
  onRename: (id: string) => void;
  onRenamed: (t: TabMeta | null) => void;
}

/** 按住多久才能拖动排序:短按是切换,避免点击时手一抖就把 tab 拖走 */
export const LONG_PRESS_MS = 350;
/** 按住期间指针移动超过这个距离就不算长按(当作普通点击或手滑) */
const PRESS_SLOP_PX = 5;

interface Drag {
  id: string;
  x0: number;
  y0: number;
  dx: number;
  /** 已按够时长,可以拖动 */
  armed: boolean;
  moved: boolean;
  before: string | null;
}

/** 键盘打开菜单:Shift+F10 或菜单键(macOS 不会把它们转成 contextmenu 事件) */
export const isMenuKey = (e: React.KeyboardEvent) =>
  e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");

/** 右键菜单的位置:鼠标触发时跟随指针;键盘触发(坐标为 0)时贴在元素下方 */
export function menuPoint(e: React.MouseEvent<HTMLElement>) {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left, y: r.bottom + 4 };
}

/**
 * 页面岛顶部的 tab 条:单字 + 名称,当前 tab 是浅底加主色下划线。
 * 单击切换;双击(或 F2、菜单里的「改名」)原地改名;长按后左右拖动排序;右键打开菜单。
 */
export function TabStrip(p: Props) {
  const { tabs, activeId, onSelect, onMove, onMenu } = p;
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [dragging, setDragging] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const movable = tabs.filter((t) => !t.locked);

  // 切换后让当前 tab 露出来(tab 多到横向滚动时)
  useEffect(() => {
    if (activeId) refs.current.get(activeId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  /** 指针所在位置对应的插入点:落在哪个 tab 的左半部分就插到它前面 */
  const beforeAt = (x: number, id: string): string | null => {
    for (const t of movable) {
      if (t.id === id) continue;
      const r = refs.current.get(t.id)?.getBoundingClientRect();
      if (r && x < r.left + r.width / 2) return t.id;
    }
    return null;
  };
  // 放回原处时不显示插入线
  const isNoop = (d: Drag) => {
    const i = movable.findIndex((t) => t.id === d.id);
    return d.before === (movable[i + 1]?.id ?? null);
  };
  const end = () => {
    clearTimeout(timer.current);
    drag.current = null;
    setDragging(null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = dragging?.moved && !isNoop(dragging) ? dragging : null;
  const lastMovable = movable[movable.length - 1]?.id;

  return (
    <nav className="strip" aria-label="tab">
      <div className="strip-tabs">
        {tabs.map((t, i) => {
          const hint = i < 9 ? ` ${MOD}${i + 1}` : "";
          const name = t.locked ? "加密 tab" : t.name;
          const act = t.id === activeId;
          let cls = act ? "tab act" : "tab";
          if (dragging?.id === t.id) cls += " dragging";
          if (shown?.before === t.id) cls += " drop-before";
          if (shown && shown.before === null && t.id === lastMovable) cls += " drop-after";

          if (p.renaming === t.id && !t.locked) {
            return (
              <span key={t.id} className={`${cls} renaming`}>
                <TabNameEdit tab={t} onDone={p.onRenamed} />
              </span>
            );
          }
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
                  ? { transform: `translateX(${dragging.dx}px)` }
                  : undefined
              }
              aria-current={act ? "page" : undefined}
              aria-label={name}
              title={t.locked ? `${name}${hint}` : `${name}${hint}(双击改名,长按拖动排序,右键更多)`}
              onPointerDown={(e) => {
                if (e.button !== 0 || t.locked) return;
                const d: Drag = {
                  id: t.id,
                  x0: e.clientX,
                  y0: e.clientY,
                  dx: 0,
                  armed: false,
                  moved: false,
                  before: null,
                };
                drag.current = d;
                e.currentTarget.setPointerCapture(e.pointerId);
                clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                  if (drag.current !== d) return;
                  d.armed = true; // 按够了:tab 浮起,可以拖了
                  setDragging({ ...d });
                }, LONG_PRESS_MS);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const dx = e.clientX - d.x0;
                if (!d.armed) {
                  // 没按够就移动了:不是长按,放弃这次拖动(松开时照常算点击)
                  if (Math.hypot(dx, e.clientY - d.y0) > PRESS_SLOP_PX) end();
                  return;
                }
                if (!d.moved && Math.abs(dx) < PRESS_SLOP_PX) return;
                d.moved = true;
                d.dx = dx;
                d.before = beforeAt(e.clientX, d.id);
                setDragging({ ...d });
              }}
              onPointerUp={() => {
                const d = drag.current;
                end();
                if (!d?.armed) return;
                suppressClick.current = true; // 拖动结束时浏览器还会补发一次 click
                setTimeout(() => {
                  suppressClick.current = false;
                }, 0);
                if (d.moved && !isNoop(d)) onMove(d.id, d.before);
              }}
              onPointerCancel={end}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                if (!act) onSelect(t.id);
              }}
              onDoubleClick={() => {
                if (!t.locked) p.onRename(t.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "F2" && !t.locked) {
                  e.preventDefault();
                  p.onRename(t.id);
                  return;
                }
                if (!isMenuKey(e)) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                onMenu(t, r.left, r.bottom + 4, e.currentTarget);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                end();
                const { x, y } = menuPoint(e);
                onMenu(t, x, y, e.currentTarget);
              }}
            >
              <span className="tab-g" aria-hidden="true">
                {t.glyph}
              </span>
              <span className="tab-n">{name}</span>
              {t.encrypted && !t.locked && (
                <i className="badge" title="加密">
                  <LockIcon />
                </i>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="tab-add"
        aria-label="新 tab"
        title={`新 tab ${MOD}T`}
        onClick={p.onCreate}
      >
        <PlusIcon />
      </button>
    </nav>
  );
}
