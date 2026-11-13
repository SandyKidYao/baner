import { useState } from "react";
import { describeCryptoError } from "../crypto/errors";
import { MasterKey } from "../crypto/MasterKey";
import { type CryptoStatus, type SyncStatus, setTabEncrypted, setTabSynced, type TabMeta } from "../ipc";
import { CrossIcon, LockIcon, SyncIcon } from "../rail/icons";
import { SyncHistory } from "../sync/SyncHistory";
import type { SyncPhase } from "../sync/useSync";
import { UpdateSection } from "../update/UpdateSection";
import type { UpdateApi } from "../update/useUpdate";
import { GithubSync } from "./GithubSync";

interface Props {
  tabs: TabMeta[];
  status: SyncStatus | null;
  /** 同步状态:每次同步结束后刷新同步记录 */
  syncPhase: SyncPhase;
  /** 登录、选仓库、退出登录之后调用,由调用方立即同步 */
  onSaved: (s: SyncStatus) => void;
  crypto: CryptoStatus | null;
  onCryptoChanged: (s: CryptoStatus) => void;
  /** 只更新加密状态(例如输错主密钥后,仓库里的钥匙已取到本机) */
  onCryptoStatus: (s: CryptoStatus) => void;
  /** tab 的加密状态变了:刷新 tab 列表、重新载入编辑器、安排同步 */
  onTabsChanged: () => void;
  /** 某个 tab 的同步开关变了:重新读取同步状态 */
  onSyncChanged: () => Promise<unknown>;
  update: UpdateApi;
  onClose: () => void;
}

/** 同步与加密配置:GitHub 登录与仓库 → 同步记录 → 本机主密钥 → 每个 tab 的开关;底部是版本与更新。 */
export function SettingsPanel({
  tabs,
  status,
  syncPhase,
  onSaved,
  crypto,
  onCryptoChanged,
  onCryptoStatus,
  onTabsChanged,
  onSyncChanged,
  update,
  onClose,
}: Props) {
  const unsynced = status?.config.unsyncedTabs ?? [];

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
    await setTabSynced(id, synced);
    await onSyncChanged();
  };

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

      <GithubSync status={status} onChanged={onSaved} />
      <SyncHistory tabs={tabs} phase={syncPhase} configured={!!status?.config.remoteUrl && status.hasToken} />

      <h3 className="sub">
        <LockIcon /> 主密钥
      </h3>
      <MasterKey status={crypto} onChanged={onCryptoChanged} onStatus={onCryptoStatus} />

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

      <UpdateSection update={update} />
    </section>
  );
}
