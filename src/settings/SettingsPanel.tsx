import { useState } from "react";
import { type SyncStatus, setTabSynced, syncConfigure, type TabMeta } from "../ipc";
import { CheckIcon, CrossIcon, EyeIcon, SyncIcon } from "../rail/icons";
import { describeSyncError } from "../sync/errors";

interface Props {
  tabs: TabMeta[];
  status: SyncStatus | null;
  /** 保存成功后调用,由调用方立即同步 */
  onSaved: (s: SyncStatus) => void;
  onClose: () => void;
}

const Mark = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={ok ? "mark ok" : "mark no"}>
    {ok ? <CheckIcon /> : <CrossIcon />}
    {label}
  </span>
);

/** 同步与加密配置:检测结果 → 仓库与 token → 每个 tab 的开关。加密在 backlog 第 4 项加入。 */
export function SettingsPanel({ tabs, status, onSaved, onClose }: Props) {
  const [url, setUrl] = useState(status?.config.remoteUrl ?? "");
  const [user, setUser] = useState(status?.config.username ?? "");
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unsynced, setUnsynced] = useState<string[]>(status?.config.unsyncedTabs ?? []);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const s = await syncConfigure(url, user.trim() || null, token === "" ? undefined : token);
      setToken("");
      onSaved(s);
    } catch (e) {
      setErr(describeSyncError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string) => {
    const synced = unsynced.includes(id);
    const c = await setTabSynced(id, synced);
    setUnsynced(c.unsyncedTabs);
  };

  const d = status?.detect;
  return (
    <section className="panel" aria-label="同步与加密">
      <header className="panel-head">
        <h2>
          <SyncIcon /> 同步
        </h2>
        <button type="button" className="sym" aria-label="关闭" onClick={onClose}>
          <CrossIcon />
        </button>
      </header>

      <div className="detect">
        <Mark ok={!!d?.isRepo} label="git 仓库" />
        <Mark ok={!!d?.remoteUrl} label="远端" />
        <Mark ok={!!status?.hasToken} label="token" />
      </div>

      <form
        className="fields"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>仓库</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/me/notes.git"
            spellCheck={false}
            autoCapitalize="off"
            required
          />
        </label>
        <label className="field">
          <span>用户名(可选)</span>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
          />
        </label>
        <label className="field">
          <span>token{status?.hasToken ? "(已保存,留空不修改)" : ""}</span>
          <span className="with-btn">
            <input
              type={show ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              className="sym"
              aria-label={show ? "隐藏 token" : "显示 token"}
              onClick={() => setShow(!show)}
            >
              <EyeIcon />
            </button>
          </span>
        </label>
        {err && (
          <p className="err" role="alert">
            ✕ {err}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy || !url.trim()}>
          <SyncIcon /> 保存并同步
        </button>
      </form>

      <h3 className="sub">
        按 tab <span className="muted">· 同步</span>
      </h3>
      <ul className="tab-toggles">
        {tabs.map((t) => {
          const on = !unsynced.includes(t.id);
          return (
            <li key={t.id}>
              <span>
                <b className="glyph">{t.glyph}</b> {t.name}
              </span>
              <button
                type="button"
                className={on ? "tog on" : "tog"}
                aria-pressed={on}
                aria-label={`同步「${t.name}」`}
                onClick={() => toggle(t.id)}
              >
                <SyncIcon />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="hint muted">不同步的 tab 只留在本机。已经同步过的 tab 关闭同步后,会从仓库里移除。</p>
    </section>
  );
}
