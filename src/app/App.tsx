import { useCallback, useEffect, useRef, useState } from "react";
import { ModeToggle } from "../blocks/ModeToggle";
import type { MdMode } from "../blocks/markdown";
import { type EditorApi, TabEditor } from "../blocks/TabEditor";
import { describeCryptoError } from "../crypto/errors";
import { appReady, type CryptoStatus, cryptoStatus, setTabEncrypted, setTabSynced } from "../ipc";
import { Drawer } from "../rail/Drawer";
import { GearIcon, MenuIcon, PlusIcon } from "../rail/icons";
import { isMod, MOD, SHIFT_ALT } from "../rail/keys";
import { PageHeader } from "../rail/PageHeader";
import { TabMenu, type TabMenuTarget } from "../rail/TabMenu";
import { TabStrip } from "../rail/TabStrip";
import { clearPlaceholder, placeholderTab, useTabs } from "../rail/useTabs";
import { SettingsPanel } from "../settings/SettingsPanel";
import { SyncButton } from "../sync/SyncButton";
import { useSync } from "../sync/useSync";
import { useNarrow } from "./useMedia";

const MD_MODE = "baner.mdMode"; // 本机偏好:所见 / 源码

function readMdMode(): MdMode {
  try {
    return localStorage.getItem(MD_MODE) === "source" ? "source" : "wysiwyg";
  } catch {
    return "wysiwyg";
  }
}
function writeMdMode(m: MdMode) {
  try {
    localStorage.setItem(MD_MODE, m);
  } catch {
    /* 无存储时只在本次运行中生效 */
  }
}

export default function App() {
  const tabsEdited = useRef(() => {});
  const { tabs, active, select, create, update, remove, move, refresh } = useTabs(() => tabsEdited.current());
  const editorApi = useRef<EditorApi | null>(null);
  const [crypto, setCrypto] = useState<CryptoStatus | null>(null);
  const reloadCrypto = useCallback(() => {
    cryptoStatus()
      .then(setCrypto)
      .catch((e) => console.error("读取加密状态失败", e));
  }, []);
  const sync = useSync({
    editor: editorApi,
    activeTab: active?.id ?? null,
    onTabsChanged: refresh,
    onSynced: reloadCrypto,
    ready: tabs !== null,
    skipTabs: () => {
      const p = placeholderTab();
      return p ? [p] : [];
    },
  });
  tabsEdited.current = sync.onSaved; // 新建、改名、删除、排序后也安排一次同步
  const [settings, setSettings] = useState(false);
  const [epoch, setEpoch] = useState(0); // 加密状态变化后重建编辑器
  useEffect(reloadCrypto, [reloadCrypto]);
  const contentChanged = useCallback(async () => {
    await refresh();
    setEpoch((n) => n + 1);
    sync.onSaved();
  }, [refresh, sync.onSaved]);
  // 正在改名的 tab(刚新建的 tab 直接进入改名)
  const [renaming, setRenaming] = useState<string | null>(null);
  const narrow = useNarrow();
  const [mdMode, setMdMode] = useState<MdMode>(readMdMode);
  const changeMdMode = useCallback((m: MdMode) => {
    setMdMode(m);
    writeMdMode(m);
  }, []);
  const [menu, setMenu] = useState<TabMenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu = useCallback(
    (tab: TabMenuTarget["tab"], x: number, y: number, opener: HTMLElement) => setMenu({ tab, x, y, opener }),
    [],
  );
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
    setRenaming(t.id);
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
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        setMdMode((m) => {
          const next = m === "wysiwyg" ? "source" : "wysiwyg";
          writeMdMode(next);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tabs, select, newTab]);

  const renamed = useCallback(
    (t: Parameters<typeof update>[0] | null) => {
      setRenaming(null);
      if (t) update(t);
    },
    [update],
  );

  if (!tabs || !active) return null;

  const selectTab = (id: string) => {
    setSettings(false);
    select(id);
  };
  const syncButton = <SyncButton state={sync.state} onSync={sync.run} />;
  const unsynced = sync.state.status?.config.unsyncedTabs ?? [];
  const movable = tabs.filter((t) => !t.locked);
  const menuTab = menu && tabs.find((t) => t.id === menu.tab.id);
  const menuIndex = menuTab ? movable.findIndex((t) => t.id === menuTab.id) : -1;
  const modeToggle = <ModeToggle mode={mdMode} onChange={changeMdMode} />;

  const header = (
    <PageHeader
      tab={active}
      synced={sync.state.phase === "off" ? null : !unsynced.includes(active.id)}
      narrow={narrow}
      renaming={renaming === active.id}
      onRename={() => setRenaming(active.id)}
      onRenamed={renamed}
      strip={
        narrow ? undefined : (
          <TabStrip
            tabs={tabs}
            activeId={active.id}
            onSelect={selectTab}
            onCreate={newTab}
            onMove={move}
            onMenu={openMenu}
            renaming={renaming}
            onRename={setRenaming}
            onRenamed={renamed}
          />
        )
      }
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
      tools={
        <>
          {narrow && syncButton}
          {modeToggle}
        </>
      }
    />
  );

  const settingsPanel = settings && (
    <SettingsPanel
      tabs={tabs}
      status={sync.state.status}
      onSaved={sync.onConfigured}
      crypto={crypto}
      onCryptoStatus={setCrypto}
      onCryptoChanged={(c) => {
        setCrypto(c);
        contentChanged();
      }}
      onTabsChanged={contentChanged}
      onSyncChanged={async () => {
        await sync.refreshStatus();
        sync.onSaved();
      }}
      onClose={() => setSettings(false)}
    />
  );

  return (
    <div className={narrow ? "app narrow" : "app"}>
      {narrow && drawer && (
        <Drawer
          tabs={tabs}
          activeId={active.id}
          onSelect={selectTab}
          onCreate={newTab}
          onSettings={() => setSettings(true)}
          onClose={closeDrawer}
          onMenu={openMenu}
        />
      )}
      {narrow && header}
      <div className="work">
        <div className="island page-island">
          {!narrow && header}
          <main className="page">
            <TabEditor
              key={`${active.id}:${epoch}`}
              tab={active.id}
              mdMode={mdMode}
              onReady={onReady}
              autoFocus={renaming !== active.id}
              onSaved={() => {
                clearPlaceholder(active.id);
                sync.onSaved();
              }}
              api={editorApi}
              onOpenSettings={() => setSettings(true)}
            />
            {narrow && settingsPanel}
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
        </div>
        {!narrow && settingsPanel}
      </div>
      {!narrow && (
        <footer className="keys">
          {/* 按常用程度排列;窗口窄时放不下的整项隐藏(见 base.css .keys-hints) */}
          <div className="keys-hints">
            <span>
              <kbd>{MOD}↵</kbd>新块
            </span>
            <button
              type="button"
              className="keys-btn"
              title={`插入图块 ${MOD}D`}
              onClick={() => editorApi.current?.insertDrawing()}
            >
              <kbd>{MOD}D</kbd>◇ 图块
            </button>
            <span>
              <kbd>{MOD}A</kbd>选块
            </span>
            <span>
              <kbd>{MOD}E</kbd>所见 / 源码
            </span>
            <span>
              <kbd>{MOD}T</kbd>新 tab
            </span>
            <span>
              <kbd>{MOD}1–9</kbd>切换 tab
            </span>
            <span>
              <kbd>{SHIFT_ALT}F</kbd>格式化代码
            </span>
            <span>
              <kbd>{MOD},</kbd>同步与加密
            </span>
          </div>
          <div className="keys-end">
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
          </div>
        </footer>
      )}
      {menu && menuTab && (
        <TabMenu
          {...menu}
          tab={menuTab}
          synced={!unsynced.includes(menuTab.id)}
          cryptoReady={!!crypto?.configured}
          canDelete={tabs.length > 1}
          canMoveUp={menuIndex > 0}
          canMoveDown={menuIndex >= 0 && menuIndex < movable.length - 1}
          horizontal={!narrow}
          onRename={() => {
            select(menuTab.id);
            setRenaming(menuTab.id);
          }}
          onMove={(dir) =>
            move(menuTab.id, dir < 0 ? movable[menuIndex - 1].id : (movable[menuIndex + 2]?.id ?? null))
          }
          onToggleSync={async () => {
            await setTabSynced(menuTab.id, unsynced.includes(menuTab.id));
            await sync.refreshStatus();
            sync.onSaved();
          }}
          onToggleEncrypt={async () => {
            try {
              await editorApi.current?.flush();
              await setTabEncrypted(menuTab.id, !menuTab.encrypted);
            } catch (e) {
              throw describeCryptoError(e);
            }
            await contentChanged();
          }}
          onOpenSettings={() => setSettings(true)}
          onDelete={() => remove(menuTab.id)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
