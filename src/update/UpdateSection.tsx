import type { UpdateApi } from "./useUpdate";

/** 设置面板底部:版本号、检查更新、更新并重启。 */
export function UpdateSection({ update }: { update: UpdateApi }) {
  const { version, phase, info, error } = update.state;
  const busy = phase === "installing" || phase === "restarting";
  return (
    <>
      <h3 className="sub">版本</h3>
      <div className="fields">
        <div className="gh-row">
          <span>
            Baner <b className="app-version">{version ?? "…"}</b>
          </span>
          {!info && !busy && (
            <button type="button" className="sym" disabled={phase === "checking"} onClick={update.check}>
              {phase === "checking" ? "检查中…" : "检查更新"}
            </button>
          )}
        </div>
        {phase === "latest" && <p className="hint muted">✓ 已是最新版本</p>}
        {info && (
          <>
            <p className="update-new">新版本 {info.version}</p>
            <button type="button" className="primary" disabled={busy} onClick={update.install}>
              {phase === "installing" ? "正在下载…" : phase === "restarting" ? "正在重启…" : "更新并重启"}
            </button>
            {!busy && <p className="hint muted">先保存笔记,下载后替换应用并重启。</p>}
          </>
        )}
        {error && (
          <p className="err" role="alert">
            ✕ {error}
          </p>
        )}
      </div>
    </>
  );
}
