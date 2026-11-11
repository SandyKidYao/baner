import { type ReactNode, useEffect, useRef, useState } from "react";
import type { TabMeta } from "../ipc";
import { LockIcon, SyncIcon } from "./icons";

interface Props {
  tab: TabMeta;
  /** 新建的 tab 直接进入改名 */
  editOnMount: boolean;
  onUpdate: (t: TabMeta) => void;
  /** 这个 tab 是否同步;null 表示还没有配置同步(不显示) */
  synced: boolean | null;
  narrow: boolean;
  /** 手机布局:名称前的 ≡ */
  lead?: ReactNode;
  /** 右侧:编辑模式切换;手机布局另有同步符号 */
  tools?: ReactNode;
}

/**
 * 页头。桌面上是页面岛顶部「选中的 tab」:单字 + 名称(点击改名),右侧是状态与编辑模式;
 * 手机布局放在窗口底色上。删除、同步、加密在 tab 的右键菜单里。
 */
export function PageHeader({ tab, editOnMount, onUpdate, synced, narrow, lead, tools }: Props) {
  const [editing, setEditing] = useState(editOnMount);
  const [name, setName] = useState(tab.name);
  const [glyph, setGlyph] = useState(tab.glyph);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(tab.name);
    setGlyph(tab.glyph);
  }, [tab]);
  useEffect(() => {
    if (editOnMount && !tab.locked) setEditing(true);
  }, [editOnMount, tab.locked]);
  useEffect(() => {
    if (editing) nameRef.current?.select();
  }, [editing]);
  const commit = () => {
    setEditing(false);
    // 单字没动、且原本就是旧名字的首字时,跟随新名字
    const auto = glyph === tab.glyph && [...tab.name.trim()][0] === tab.glyph;
    if (name.trim() && (name !== tab.name || glyph !== tab.glyph))
      onUpdate({ ...tab, name, glyph: auto ? "" : glyph });
    else {
      setName(tab.name);
      setGlyph(tab.glyph);
    }
  };

  return (
    <header className="ph">
      {lead}
      <span className="ph-crumb">
        {!narrow && (
          <span className="ph-g" aria-hidden="true">
            {tab.locked ? <LockIcon /> : tab.glyph}
          </span>
        )}
        {editing ? (
          <form
            className="ph-edit"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) commit();
            }}
            onKeyDown={(e) => {
              // 两个输入框且没有提交按钮时,浏览器不会把回车当提交,这里自己处理
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setName(tab.name);
                setGlyph(tab.glyph);
                setEditing(false);
              }
            }}
          >
            <input
              className="ph-glyph"
              aria-label="单字"
              value={glyph}
              maxLength={2}
              onChange={(e) => setGlyph(e.target.value)}
            />
            <input
              ref={nameRef}
              className="ph-name-input"
              aria-label="tab 名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </form>
        ) : tab.locked ? (
          <span className="ph-name">加密 tab</span>
        ) : (
          <button type="button" className="ph-name" title="改名" onClick={() => setEditing(true)}>
            {tab.name}
          </button>
        )}
      </span>
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
