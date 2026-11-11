import type { ReactNode } from "react";
import type { TabMeta } from "../ipc";
import { LockIcon, SyncIcon } from "./icons";
import { TabNameEdit } from "./TabNameEdit";

interface Props {
  tab: TabMeta;
  /** 桌面:tab 条(代替手机顶栏的「当前 tab 名称」) */
  strip?: ReactNode;
  /** 手机顶栏:当前 tab 正在改名 */
  renaming: boolean;
  onRename: () => void;
  onRenamed: (t: TabMeta | null) => void;
  /** 这个 tab 是否同步;null 表示还没有配置同步(不显示) */
  synced: boolean | null;
  narrow: boolean;
  /** 手机布局:名称前的 ≡ */
  lead?: ReactNode;
  /** 右侧:编辑模式切换;手机布局另有同步符号 */
  tools?: ReactNode;
}

/**
 * 页头。桌面上是页面岛顶部:左边 tab 条,右边是当前 tab 的状态与编辑模式;
 * 手机布局放在窗口底色上,只显示当前 tab 名称(点击改名)。删除、同步、加密在 tab 的右键菜单里。
 */
export function PageHeader({
  tab,
  strip,
  renaming,
  onRename,
  onRenamed,
  synced,
  narrow,
  lead,
  tools,
}: Props) {
  return (
    <header className="ph">
      {lead}
      {strip ?? (
        <span className="ph-crumb">
          {renaming && !tab.locked ? (
            <TabNameEdit tab={tab} onDone={onRenamed} />
          ) : tab.locked ? (
            <span className="ph-name">加密 tab</span>
          ) : (
            <button type="button" className="ph-name" title="改名" onClick={onRename}>
              {tab.name}
            </button>
          )}
        </span>
      )}
      <span className="ph-meta">
        {tab.encrypted && (
          <span className="ph-lock" title="加密:内容和名称在仓库里是密文">
            <LockIcon />
            {!narrow && " 加密"}
          </span>
        )}
        {!narrow && synced !== null && (
          <span title={synced ? "这个 tab 会同步" : "这个 tab 只留在本机"}>
            {synced ? (
              <>
                <SyncIcon /> 同步
              </>
            ) : (
              "○ 不同步"
            )}
          </span>
        )}
      </span>
      {tools && <span className="ph-tools">{tools}</span>}
    </header>
  );
}
