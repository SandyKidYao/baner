import { useCallback, useEffect, useRef, useState } from "react";
import { TabEditor } from "../blocks/TabEditor";
import { appReady } from "../ipc";
import { isMod, MOD } from "../rail/keys";
import { PageHeader } from "../rail/PageHeader";
import { Rail } from "../rail/Rail";
import { useTabs } from "../rail/useTabs";

export default function App() {
  const { tabs, active, select, create, update, remove } = useTabs();
  const [fresh, setFresh] = useState<string | null>(null); // 刚新建、需要立刻改名的 tab
  const shown = useRef(false);

  // 隐藏窗口里不执行 requestAnimationFrame,所以用 setTimeout 触发显示(见 Spike perf-baseline)
  const onReady = useCallback(() => {
    if (shown.current) return;
    shown.current = true;
    setTimeout(() => appReady().catch(() => {}), 0);
  }, []);

  const newTab = useCallback(async () => {
    const t = await create();
    if (!t) return;
    setFresh(t.id);
    select(t.id);
  }, [create, select]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isMod(e) || e.altKey || !tabs) return;
      if (/^[1-9]$/.test(e.key)) {
        const t = tabs[Number(e.key) - 1];
        if (t) {
          e.preventDefault();
          select(t.id);
        }
      } else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        newTab();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tabs, select, newTab]);

  if (!tabs || !active) return null;

  return (
    <div className="app">
      <Rail tabs={tabs} activeId={active.id} onSelect={select} onCreate={newTab} />
      <div className="main">
        <PageHeader
          key={active.id}
          tab={active}
          canDelete={tabs.length > 1}
          editOnMount={fresh === active.id}
          onUpdate={(t) => {
            setFresh(null);
            update(t);
          }}
          onDelete={() => remove(active.id)}
        />
        <main className="page">
          <TabEditor key={active.id} tab={active.id} onReady={onReady} autoFocus={fresh !== active.id} />
        </main>
        <footer className="keys">
          <span>
            <kbd>{MOD}↵</kbd> 新块
          </span>
          <span>
            <kbd>{MOD}A</kbd> 选块
          </span>
          <span>
            <kbd>{MOD}1–9</kbd> tab
          </span>
          <span>
            <kbd>{MOD}T</kbd> 新 tab
          </span>
        </footer>
      </div>
    </div>
  );
}
