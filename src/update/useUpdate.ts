import { useCallback, useEffect, useRef, useState } from "react";
import { appVersion, type UpdateInfo, updateCheck, updateInstall } from "../ipc";
import { describeUpdateError } from "./errors";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "installing"
  | "restarting"
  | "error";

export interface UpdateState {
  /** 本机版本号 */
  version: string | null;
  phase: UpdatePhase;
  info: UpdateInfo | null;
  error: string | null;
}

export interface UpdateApi {
  state: UpdateState;
  /** 用户点「检查更新」 */
  check: () => void;
  install: () => void;
}

const FIRST_CHECK_MS = 5_000; // 启动后多久检查,不和启动、首次同步抢资源
const CHECK_EVERY_MS = 6 * 60 * 60_000; // 应用常驻 Dock,定时再查

/** 自动更新(ADR-0010):启动后和每隔几小时检查 GitHub Release;安装前先保存正在编辑的内容。 */
export function useUpdate(beforeInstall: () => Promise<unknown>): UpdateApi {
  const [state, setState] = useState<UpdateState>({ version: null, phase: "idle", info: null, error: null });
  const busy = useRef(false);
  const before = useRef(beforeInstall);
  before.current = beforeInstall;

  useEffect(() => {
    appVersion()
      .then((version) => setState((s) => ({ ...s, version })))
      .catch(() => {});
  }, []);

  /** manual:用户手动检查才显示「已是最新」和错误;后台检查失败时不打扰 */
  const run = useCallback(async (manual: boolean) => {
    if (busy.current) return;
    busy.current = true;
    if (manual) setState((s) => ({ ...s, phase: "checking", error: null }));
    try {
      const info = await updateCheck();
      setState((s) =>
        info
          ? { ...s, phase: "available", info, error: null }
          : { ...s, phase: manual ? "latest" : s.phase === "available" ? "idle" : s.phase, info: null },
      );
    } catch (e) {
      if (manual) setState((s) => ({ ...s, phase: "error", error: describeUpdateError(e) }));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => run(false), FIRST_CHECK_MS);
    const every = setInterval(() => run(false), CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [run]);

  const install = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState((s) => ({ ...s, phase: "installing", error: null }));
    try {
      await before.current();
      await updateInstall(); // 成功时应用直接重启,一般不会返回
      setState((s) => ({ ...s, phase: "restarting" }));
    } catch (e) {
      setState((s) => ({ ...s, phase: "error", error: describeUpdateError(e) }));
    } finally {
      busy.current = false;
    }
  }, []);

  const check = useCallback(() => {
    run(true);
  }, [run]);
  return { state, check, install: useCallback(() => void install(), [install]) };
}
