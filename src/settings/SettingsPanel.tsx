import { useState } from "react";
import { describeCryptoError } from "../crypto/errors";
import { MasterKey } from "../crypto/MasterKey";
import {
  type CryptoStatus,
  type SyncStatus,
  setTabEncrypted,
  setTabSynced,
  syncConfigure,
  type TabMeta,
} from "../ipc";
import { CheckIcon, CrossIcon, EyeIcon, LockIcon, SyncIcon } from "../rail/icons";
import { describeSyncError } from "../sync/errors";

interface Props {
  tabs: TabMeta[];
  status: SyncStatus | null;
  /** 保存成功后调用,由调用方立即同步 */
  onSaved: (s: SyncStatus) => void;
  crypto: CryptoStatus | null;
  onCryptoChanged: (s: CryptoStatus) => void;
  /** tab 的加密状态变了:刷新 tab 列表、重新载入编辑器、安排同步 */
  onTabsChanged: () => void;
  onClose: () => void;
}

const Mark = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={ok ? "mark ok" : "mark no"}>
    {ok ? <CheckIcon /> : <CrossIcon />}
    {label}
  </span>
);

/** 同步与加密配置:检测结果 → 仓库与 token → 每个 tab 的开关。加密在 backlog 第 4 项加入。 */
export function SettingsPanel({
  tabs,
  status,
  onSaved,
  crypto,
  onCryptoChanged,
  onTabsChanged,
  onClose,
}: Props) {
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

  const [lockErr, setLockErr] = useState<string | null>(null);
  const toggleLock = async (t: TabMeta) => {
    setLockErr(null);
    try {
      await setTabEncrypted(t.id, !t.encrypted);
      onTabsChanged();
    } catch (e) {
      setLockErr(describeCryptoError(e));
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
          <SyncIcon /> 同步与加密
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
        <LockIcon /> 主密钥
      </h3>
      <MasterKey status={crypto} onChanged={onCryptoChanged} />

      <h3 className="sub">
        按 tab <span className="muted">· 同步 · 加密</span>
      </h3>
      <ul className="tab-toggles">
        {tabs.map((t) => {
          const on = !unsynced.includes(t.id);
          return (
            <li key={t.id}>
              <span>
                <b className="glyph">{t.glyph}</b> {t.locked ? "加密 tab" : t.name}
              </span>
              <span className="togs">
                <button
                  type="button"
                  className={on ? "tog on" : "tog"}
                  aria-pressed={on}
                  aria-label={`同步「${t.name || "加密 tab"}」`}
                  onClick={() => toggle(t.id)}
                >
                  <SyncIcon />
                </button>
                <button
                  type="button"
                  className={t.encrypted ? "tog on" : "tog"}
                  aria-pressed={!!t.encrypted}
                  aria-label={`加密「${t.name || "加密 tab"}」`}
                  disabled={!crypto?.configured}
                  title={crypto?.configured ? undefined : "先设置主密钥"}
                  onClick={() => toggleLock(t)}
                >
                  <LockIcon />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {lockErr && (
        <p className="err" role="alert">
          ✕ {lockErr}
        </p>
      )}
      <p className="hint muted">
        不同步的 tab 只留在本机;已经同步过的 tab 关闭同步后,会从仓库里移除。加密 tab
        的内容和名称在仓库里都是密文。
      </p>
    </section>
  );
}
