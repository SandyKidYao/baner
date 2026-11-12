import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "../blocks/debounce";
import type { EditorApi } from "../blocks/TabEditor";
import { type SyncStatus, syncNow, syncStatus } from "../ipc";
import { describeSyncError } from "./errors";

export type SyncPhase = "off" | "idle" | "syncing" | "error";

export interface SyncState {
  phase: SyncPhase;
  conflict: boolean;
  error: string | null;
  status: SyncStatus | null;
}

const IDLE_MS = 10_000; // 停止编辑后多久同步
const FOCUS_STALE_MS = 60_000; // 窗口重新获得焦点时,距上次同步超过这个时长就再同步
const PULL_MS = 5 * 60_000; // 定时拉取

interface Options {
  editor: MutableRefObject<EditorApi | null>;
  activeTab: string | null;
  onTabsChanged: () => Promise<void>;
  /** 每次同步成功后调用:仓库可能带来了 identity.age,或本机钥匙被仓库里的取代,需要重新读取加密状态 */
  onSynced: () => void;
  /** 这次同步临时跳过的 tab(还没用过的占位 tab) */
  skipTabs: () => string[];
  /** tab 列表载入完成(含首次启动建好占位 tab)之后才开始同步 */
  ready: boolean;
}

/** 选了仓库、也登录了(或有旧版的 token)才同步 */
const isConfigured = (s: SyncStatus) => !!s.config.remoteUrl && s.hasToken;

export function useSync({ editor, activeTab, onTabsChanged, onSynced, skipTabs, ready }: Options) {
  const [state, setState] = useState<SyncState>({ phase: "off", conflict: false, error: null, status: null });
  const running = useRef(false);
  const again = useRef(false);
  const lastAt = useRef(0);
  const active = useRef(activeTab);
  active.current = activeTab;
  const tabsChanged = useRef(onTabsChanged);
  tabsChanged.current = onTabsChanged;
  const synced = useRef(onSynced);
  synced.current = onSynced;
  const skip = useRef(skipTabs);
  skip.current = skipTabs;
  const configured = useRef(false);

  const run = useCallback(async () => {
    if (!configured.current) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setState((s) => ({ ...s, phase: "syncing" }));
    try {
      await editor.current?.flush();
      // flush 之后再取:刚保存的内容会让占位 tab 变成正式 tab
      const r = await syncNow(skip.current());
      lastAt.current = Date.now();
      synced.current();
      if (r.changedTabs.length > 0) {
        await tabsChanged.current();
        if (active.current && r.changedTabs.includes(active.current)) {
          const ok = await editor.current?.reload();
          if (ok === false) again.current = true; // 用户正在输入:稍后再合并一次
        }
      }
      setState((s) => ({ ...s, phase: "idle", error: null, conflict: r.conflicts.length > 0 }));
    } catch (e) {
      setState((s) => ({ ...s, phase: "error", error: describeSyncError(e) }));
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(() => run(), 2000);
      }
    }
  }, [editor]);

  const refreshStatus = useCallback(async () => {
    const status = await syncStatus();
    configured.current = isConfigured(status);
    setState((s) => ({
      ...s,
      status,
      phase: configured.current ? (s.phase === "off" ? "idle" : s.phase) : "off",
    }));
    return status;
  }, []);

  // 启动时:等 tab 列表就绪后读取配置,已配置就同步一次
  useEffect(() => {
    if (!ready) return;
    refreshStatus()
      .then((s) => {
        if (isConfigured(s)) run();
      })
      .catch((e) => console.error("读取同步配置失败", e));
  }, [ready, refreshStatus, run]);

  // 窗口重新获得焦点、定时拉取
  useEffect(() => {
    const onFocus = () => Date.now() - lastAt.current > FOCUS_STALE_MS && run();
    const t = setInterval(() => document.visibilityState === "visible" && run(), PULL_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [run]);

  const afterEdit = useRef(debounce(() => run(), IDLE_MS));
  useEffect(() => {
    afterEdit.current = debounce(() => run(), IDLE_MS);
  }, [run]);
  const onSaved = useCallback(() => afterEdit.current(), []);

  /** 登录、换仓库、退出登录后调用:立即采用新状态,已配置就同步一次 */
  const onConfigured = useCallback(
    (status: SyncStatus) => {
      configured.current = isConfigured(status);
      setState((s) => ({ ...s, status, phase: configured.current ? "idle" : "off", error: null }));
      run();
    },
    [run],
  );

  return { state, run, onSaved, refreshStatus, onConfigured };
}
