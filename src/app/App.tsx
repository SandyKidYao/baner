import { useCallback, useEffect, useRef, useState } from "react";
import { type EditorApi, TabEditor } from "../blocks/TabEditor";
import { appReady, type CryptoStatus, cryptoStatus } from "../ipc";
import { Drawer } from "../rail/Drawer";
import { GearIcon, MenuIcon, PlusIcon } from "../rail/icons";
import { isMod, MOD } from "../rail/keys";
import { PageHeader } from "../rail/PageHeader";
import { Rail } from "../rail/Rail";
import { clearPlaceholder, useTabs } from "../rail/useTabs";
import { SettingsPanel } from "../settings/SettingsPanel";
import { SyncButton } from "../sync/SyncButton";
import { useSync } from "../sync/useSync";
import { useNarrow } from "./useMedia";

export default function App() {
  const { tabs, active, select, create, update, remove, refresh } = useTabs();
  const editorApi = useRef<EditorApi | null>(null);
  const sync = useSync({ editor: editorApi, activeTab: active?.id ?? null, onTabsChanged: refresh });
  const [settings, setSettings] = useState(false);
  const [crypto, setCrypto] = useState<CryptoStatus | null>(null);
  const [epoch, setEpoch] = useState(0); // 加密状态变化后重建编辑器
  useEffect(() => {
    cryptoStatus()
      .then(setCrypto)
      .catch((e) => console.error("读取加密状态失败", e));
  }, []);
  const contentChanged = useCallback(async () => {
    await refresh();
    setEpoch((n) => n + 1);
    sync.onSaved();
  }, [refresh, sync.onSaved]);
  const [fresh, setFresh] = useState<string | null>(null); // 刚新建、需要立刻改名的 tab
  const narrow = useNarrow();
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  useEffect(() => {
    if (!narrow) setDrawer(false);
  }, [narrow]);
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
      } else if (e.key === ",") {
        e.preventDefault();
        setSettings((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tabs, select, newTab]);

  if (!tabs || !active) return null;

  const selectTab = (id: string) => {
    setSettings(false);
    select(id);
  };
  const syncButton = <SyncButton state={sync.state} onSync={sync.run} />;

  return (
    <div className={narrow ? "app narrow" : "app"}>
      {narrow ? (
        drawer && (
          <Drawer
            tabs={tabs}
            activeId={active.id}
            onSelect={selectTab}
            onCreate={newTab}
            onSettings={() => setSettings(true)}
            onClose={closeDrawer}
          />
        )
      ) : (
        <Rail
          tabs={tabs}
          activeId={active.id}
          onSelect={selectTab}
          onCreate={newTab}
          footer={
            <>
              {syncButton}
              <button
                type="button"
                className={settings ? "ib on" : "ib"}
                aria-label="同步与加密"
                aria-pressed={settings}
                title={`同步与加密 ${MOD},`}
                onClick={() => setSettings(!settings)}
              >
                <GearIcon />
              </button>
            </>
          }
        />
      )}
      <div className="main">
        <PageHeader
          lead={
            narrow && (
              <button
                type="button"
                className="sym"
                aria-label="打开 tab 列表"
                aria-expanded={drawer}
                title="tab 列表"
                onClick={() => setDrawer(true)}
              >
                <MenuIcon />
              </button>
            )
          }
          tools={narrow && syncButton}
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
          <TabEditor
            key={`${active.id}:${epoch}`}
            tab={active.id}
            onReady={onReady}
            autoFocus={fresh !== active.id}
            onSaved={() => {
              clearPlaceholder(active.id);
              sync.onSaved();
            }}
            api={editorApi}
            onOpenSettings={() => setSettings(true)}
          />
          {settings && (
            <SettingsPanel
              tabs={tabs}
              status={sync.state.status}
              onSaved={sync.onConfigured}
              crypto={crypto}
              onCryptoChanged={(c) => {
                setCrypto(c);
                contentChanged();
              }}
              onTabsChanged={contentChanged}
              onClose={() => setSettings(false)}
            />
          )}
          {narrow && !settings && !active.locked && (
            <button
              type="button"
              className="fab"
              aria-label="新块"
              title="新块"
              onClick={() => editorApi.current?.insertBlock()}
            >
              <PlusIcon />
            </button>
          )}
        </main>
        <footer className="keys" hidden={narrow}>
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
          <button
            type="button"
            className="keys-btn"
            title={`插入图块 ${MOD}D`}
            onClick={() => editorApi.current?.insertDrawing()}
          >
            <kbd>{MOD}D</kbd>◇ 图块
          </button>
        </footer>
      </div>
    </div>
  );
}
