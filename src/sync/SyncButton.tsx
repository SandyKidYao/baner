import { useState } from "react";
import { AlertIcon, CrossIcon, SyncIcon } from "../rail/icons";
import type { SyncState } from "./useSync";

interface Props {
  state: SyncState;
  onSync: () => void;
}

/** 轨道底部的同步符号:静止 ⟳ / 转动 / ⚠ 角标 / ✕。点击立即同步;出错时先展开原因。 */
export function SyncButton({ state, onSync }: Props) {
  const [open, setOpen] = useState(false);
  if (state.phase === "off") return null;
  const label =
    state.phase === "syncing"
      ? "同步中"
      : state.phase === "error"
        ? `同步失败:${state.error}`
        : state.conflict
          ? "已同步,有冲突的块"
          : "已同步,点击立即同步";
  return (
    <div className="sync">
      <button
        type="button"
        className={`ib sync-btn ${state.phase}${state.conflict ? " conflict" : ""}`}
        aria-label={label}
        title={label}
        onClick={() => (state.phase === "error" ? setOpen(!open) : onSync())}
      >
        {state.phase === "error" ? <CrossIcon /> : <SyncIcon />}
        {state.conflict && state.phase !== "error" && (
          <i className="badge">
            <AlertIcon />
          </i>
        )}
      </button>
      {open && state.phase === "error" && (
        <div className="sync-msg" role="alert">
          <span>✕ {state.error}</span>
          <button
            type="button"
            className="sym"
            onClick={() => {
              setOpen(false);
              onSync();
            }}
          >
            <SyncIcon />
            重试
          </button>
        </div>
      )}
    </div>
  );
}
