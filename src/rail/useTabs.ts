import { useCallback, useEffect, useRef, useState } from "react";
import { keyBetween, newId } from "../blocks/model";
import { deleteTab, listTabs, loadBlocks, saveTab, type TabMeta } from "../ipc";

const LAST = "baner.lastTab"; // 本机便利:记住上次打开的 tab
const PLACEHOLDER = "baner.placeholderTab"; // 首次启动自动建的空 tab;同步拉到别的 tab 后,如果仍是空的就删掉

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}
function readKey(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeKey(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* 无存储时忽略 */
  }
}
function writeLast(id: string) {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    /* 无存储时忽略 */
  }
}

/** `onEdited`:新建、改名、删除、排序之后调用(由调用方安排同步) */
export function useTabs(onEdited?: () => void) {
  const edited = useRef(onEdited);
  edited.current = onEdited;
  const [tabs, setTabs] = useState<TabMeta[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let list = await listTabs();
      if (list.length === 0) {
        const first: TabMeta = { id: newId(), name: "工作", glyph: "工", key: keyBetween(null, null) };
        writeKey(PLACEHOLDER, first.id); // 先记下再写盘:同步看到这个 tab 时一定知道它是占位
        await saveTab(first);
        list = [first];
      }
      setTabs(list);
      const last = readLast();
      setActiveId(list.some((t) => t.id === last) ? last : list[0].id);
    })().catch((e) => console.error("载入 tab 失败", e));
  }, []);

  const select = useCallback((id: string) => {
    setActiveId(id);
    writeLast(id);
  }, []);

  const create = useCallback(async () => {
    if (!tabs) return null;
    const t: TabMeta = {
      id: newId(),
      name: "新 tab",
      glyph: "新",
      key: keyBetween(tabs[tabs.length - 1]?.key ?? null, null),
    };
    await saveTab(t);
    setTabs([...tabs, t]);
    edited.current?.();
    return t; // 由调用方选中,以便先标记「刚新建」
  }, [tabs]);

  const update = useCallback(
    async (t: TabMeta) => {
      if (!tabs) return;
      const name = t.name.trim();
      if (!name) return;
      const next = { ...t, name, glyph: [...(t.glyph.trim() || name)][0] };
      await saveTab(next);
      clearPlaceholder(t.id); // 改过名就是用户自己的 tab 了
      setTabs(tabs.map((x) => (x.id === t.id ? next : x)));
      edited.current?.();
    },
    [tabs],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!tabs || tabs.length <= 1) return;
      await deleteTab(id);
      const i = tabs.findIndex((t) => t.id === id);
      const rest = tabs.filter((t) => t.id !== id);
      setTabs(rest);
      if (activeId === id) select(rest[Math.max(0, i - 1)].id);
      edited.current?.();
    },
    [tabs, activeId, select],
  );

  /**
   * 把 tab 移到 `before` 之前(null 表示移到末尾)。只在本机能读的 tab 之间排序:
   * 加密且本机没有主密钥的 tab 改不了 tab.json,排序键固定排在最后。
   */
  const move = useCallback(
    async (id: string, before: string | null) => {
      if (!tabs) return;
      const t = tabs.find((x) => x.id === id);
      if (!t || t.locked || id === before) return;
      const rest = tabs.filter((x) => !x.locked && x.id !== id);
      const i = before ? rest.findIndex((x) => x.id === before) : rest.length;
      if (i < 0) return;
      const lo = rest[i - 1]?.key ?? null;
      const hi = rest[i]?.key ?? null;
      if ((lo === null || lo < t.key) && (hi === null || t.key < hi)) return; // 位置没变
      const key = keyBetween(lo, hi);
      const next = { ...t, key };
      await saveTab(next);
      setTabs(
        tabs
          .map((x) => (x.id === id ? next : x))
          .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.id.localeCompare(b.id))),
      );
      edited.current?.();
    },
    [tabs],
  );

  /** 同步后重新读取 tab 列表(可能有新增、改名、删除) */
  const refresh = useCallback(async () => {
    let list = await listTabs();
    const ph = readKey(PLACEHOLDER);
    if (ph && list.length > 1 && list.some((t) => t.id === ph)) {
      const blocks = await loadBlocks(ph);
      if (blocks.every((b) => b.text.trim() === "")) {
        await deleteTab(ph);
        list = list.filter((t) => t.id !== ph);
      }
      writeKey(PLACEHOLDER, null);
    }
    if (list.length === 0) return;
    setTabs(list);
    setActiveId((cur) => (list.some((t) => t.id === cur) ? cur : list[0].id));
  }, []);

  const active = tabs?.find((t) => t.id === activeId) ?? null;
  return { tabs, active, select, create, update, remove, move, refresh };
}

/** 还没被用户用过的占位 tab:同步时跳过,免得把空的「工作」推进仓库 */
export function placeholderTab(): string | null {
  return readKey(PLACEHOLDER);
}

/** 用户在占位 tab 里写了内容,它就成了正式 tab */
export function clearPlaceholder(tabId: string) {
  if (readKey(PLACEHOLDER) === tabId) writeKey(PLACEHOLDER, null);
}
