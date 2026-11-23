import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { IS_MOBILE_OS } from "../app/platform";
import { debounce } from "../blocks/debounce";
import type { EditorApi } from "../blocks/TabEditor";
import { type SyncStatus, syncNow, syncStatus } from "../ipc";
import { describeSyncError, type SyncErrorKind, syncErrorKind } from "./errors";
import { retryDelay } from "./retry";

/** offline:连不上 GitHub,稍后自动重试;error:需要用户处理(重新登录、换仓库等),暂停自动同步 */
export type SyncPhase = "off" | "idle" | "syncing" | "offline" | "error";

export interface SyncState {
  phase: SyncPhase;
  conflict: boolean;
  error: string | null;
  errorKind: SyncErrorKind | null;
  status: SyncStatus | null;
  /** 本次运行中最近一次同步成功的时间(毫秒) */
  lastSyncedAt: number | null;
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
  const [state, setState] = useState<SyncState>({
    phase: "off",
    conflict: false,
    error: null,
    errorKind: null,
    status: null,
    lastSyncedAt: null,
  });
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
  /** 连续失败的次数 */
  const failures = useRef(0);
  /** 授权、仓库等需要用户动手的错误:暂停自动同步,直到手动重试或重新配置 */
  const paused = useRef(false);
  /** 网络不通时下次自动重试的时间;在此之前编辑、切回窗口、定时拉取都不触发同步 */
  const retryAt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** force:手动同步、网络恢复、到点重试,不受暂停和退避限制 */
  const attempt = useCallback(
    async (force: boolean): Promise<void> => {
      if (!configured.current) return;
      if (!force && (paused.current || Date.now() < retryAt.current)) return;
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      clearTimeout(retryTimer.current);
      setState((s) => ({ ...s, phase: "syncing" }));
      try {
        await editor.current?.flush();
        // flush 之后再取:刚保存的内容会让占位 tab 变成正式 tab
        const r = await syncNow(skip.current());
        lastAt.current = Date.now();
        failures.current = 0;
        paused.current = false;
        retryAt.current = 0;
        synced.current();
        if (r.changedTabs.length > 0) {
          await tabsChanged.current();
          if (active.current && r.changedTabs.includes(active.current)) {
            const ok = await editor.current?.reload();
            if (ok === false) again.current = true; // 用户正在输入:稍后再合并一次
          }
        }
        // 同步途中退出登录:结束后保持「未配置」,不把同步符号重新显示出来
        const done = configured.current ? "idle" : "off";
        setState((s) => ({
          ...s,
          phase: done,
          error: null,
          errorKind: null,
          conflict: r.conflicts.length > 0,
          lastSyncedAt: lastAt.current,
        }));
      } catch (e) {
        if (!configured.current) {
          setState((s) => ({ ...s, phase: "off" }));
          return;
        }
        const kind = syncErrorKind(e);
        failures.current += 1;
        const delay = retryDelay(kind, failures.current);
        paused.current = delay === null;
        retryAt.current = delay === null ? 0 : Date.now() + delay;
        if (delay !== null) retryTimer.current = setTimeout(() => attempt(true), delay);
        setState((s) => ({
          ...s,
          phase: kind === "network" ? "offline" : "error",
          error: describeSyncError(e),
          errorKind: kind,
        }));
      } finally {
        running.current = false;
        if (again.current) {
          again.current = false;
          setTimeout(() => attempt(false), 2000);
        }
      }
    },
    [editor],
  );

  /** 自动同步:出错暂停或退避期间跳过 */
  const auto = useCallback(() => attempt(false), [attempt]);
  /** 手动同步(点同步符号、重试) */
  const run = useCallback(() => attempt(true), [attempt]);

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
        if (isConfigured(s)) auto();
      })
      .catch((e) => console.error("读取同步配置失败", e));
  }, [ready, refreshStatus, auto]);

  /** 编辑后还在等 IDLE_MS 的同步 */
  const pending = useRef(false);
  const afterEdit = useRef(debounce(() => auto(), IDLE_MS));
  useEffect(() => {
    afterEdit.current = debounce(() => {
      pending.current = false;
      auto();
    }, IDLE_MS);
  }, [auto]);
  const onSaved = useCallback(() => {
    pending.current = true;
    afterEdit.current();
  }, []);

  // 窗口重新获得焦点、定时拉取;网络恢复时立即重试(授权等错误仍然暂停)
  useEffect(() => {
    const onFocus = () => Date.now() - lastAt.current > FOCUS_STALE_MS && auto();
    const onOnline = () => failures.current > 0 && !paused.current && run();
    // 手机上切到后台几秒后 JS 就被冻结,等不到 IDLE_MS:有没同步的编辑就立即同步;回到前台按切回窗口处理
    const onVisibility = () => {
      if (!IS_MOBILE_OS) return;
      if (document.visibilityState === "visible") onFocus();
      else if (pending.current) {
        pending.current = false;
        afterEdit.current.flush();
      }
    };
    const t = setInterval(() => document.visibilityState === "visible" && auto(), PULL_MS);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(t);
    };
  }, [auto, run]);
  useEffect(() => () => clearTimeout(retryTimer.current), []);

  /** 登录、换仓库、退出登录后调用:立即采用新状态,已配置就同步一次 */
  const onConfigured = useCallback(
    (status: SyncStatus) => {
      configured.current = isConfigured(status);
      failures.current = 0;
      paused.current = false;
      retryAt.current = 0;
      clearTimeout(retryTimer.current);
      setState((s) => ({
        ...s,
        status,
        phase: configured.current ? "idle" : "off",
        error: null,
        errorKind: null,
      }));
      run();
    },
    [run],
  );

  return { state, run, onSaved, refreshStatus, onConfigured };
}
