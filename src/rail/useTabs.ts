import { useCallback, useEffect, useState } from "react";
import { keyBetween, newId } from "../blocks/model";
import { deleteTab, listTabs, saveTab, type TabMeta } from "../ipc";

const LAST = "baner.lastTab"; // 本机便利:记住上次打开的 tab

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}
function writeLast(id: string) {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    /* 无存储时忽略 */
  }
}

export function useTabs() {
  const [tabs, setTabs] = useState<TabMeta[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let list = await listTabs();
      if (list.length === 0) {
        const first: TabMeta = { id: newId(), name: "工作", glyph: "工", key: keyBetween(null, null) };
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
    return t; // 由调用方选中,以便先标记「刚新建」
  }, [tabs]);

  const update = useCallback(
    async (t: TabMeta) => {
      if (!tabs) return;
      const name = t.name.trim();
      if (!name) return;
      const next = { ...t, name, glyph: [...(t.glyph.trim() || name)][0] };
      await saveTab(next);
      setTabs(tabs.map((x) => (x.id === t.id ? next : x)));
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
    },
    [tabs, activeId, select],
  );

  const active = tabs?.find((t) => t.id === activeId) ?? null;
  return { tabs, active, select, create, update, remove };
}
