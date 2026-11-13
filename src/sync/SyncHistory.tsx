import { useEffect, useState } from "react";
import { type SyncEntry, syncHistory, type TabMeta } from "../ipc";
import { describeSyncError } from "./errors";
import { formatTime } from "./time";
import type { SyncPhase } from "./useSync";

const FOLDED = 5; // 默认显示的条数

/** 一条记录的说明:✓ ↑ 推送 · ↓ 工作、需求池 / ✓ 无变化 ×12 / ⚠ 1 处冲突 / ✕ 网络不通 */
export function describeEntry(e: SyncEntry, tabs: TabMeta[]): string {
  const times = e.count > 1 ? ` ×${e.count}` : "";
  if (e.error) return `✕ ${describeSyncError(e.error)}${times}`;
  const parts: string[] = [];
  if (e.conflicts > 0) parts.push(`⚠ ${e.conflicts} 处冲突`);
  if (e.changedTabs.length > 0) {
    const names = e.changedTabs
      .map((id) => tabs.find((t) => t.id === id))
      .filter((t) => !!t)
      .map((t) => (t.locked ? "加密 tab" : t.name));
    parts.push(`↓ ${names.length > 0 ? names.join("、") : `${e.changedTabs.length} 个 tab`}`);
  }
  if (e.pushed) parts.push("↑ 推送");
  if (parts.length === 0) return `✓ 无变化${times}`;
  return `${e.conflicts > 0 ? "" : "✓ "}${parts.join(" · ")}${times}`;
}

interface Props {
  tabs: TabMeta[];
  /** 每次同步结束(离开 syncing)时重新读取 */
  phase: SyncPhase;
  /** 已配置同步;没配置且没有记录时整节不显示 */
  configured: boolean;
}

/** 设置面板里的同步记录:上次同步的时间,和最近几次同步的结果。 */
export function SyncHistory({ tabs, phase, configured }: Props) {
  const [list, setList] = useState<SyncEntry[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (phase === "syncing") return;
    syncHistory()
      .then(setList)
      .catch((e) => console.error("读取同步记录失败", e));
  }, [phase]);

  if (!list || (!configured && list.length === 0)) return null;
  const last = list.find((e) => !e.error);
  const shown = all ? list : list.slice(0, FOLDED);
  return (
    <>
      <h3 className="sub">同步记录</h3>
      <p className="sync-last">
        {last ? (
          <>
            上次同步 <time dateTime={new Date(last.at).toISOString()}>{formatTime(last.at)}</time>
          </>
        ) : (
          "还没有成功同步过"
        )}
      </p>
      {list.length > 0 && (
        <ol className="sync-log" aria-label="同步记录">
          {shown.map((e) => (
            <li key={e.at} className={e.error ? "bad" : undefined}>
              <time dateTime={new Date(e.at).toISOString()}>{formatTime(e.at)}</time>
              <span>{describeEntry(e, tabs)}</span>
            </li>
          ))}
        </ol>
      )}
      {list.length > FOLDED && (
        <button type="button" className="sym sync-more" onClick={() => setAll(!all)}>
          {all ? "收起" : `全部 ${list.length} 条`}
        </button>
      )}
    </>
  );
}
