import { type ReactNode, useEffect, useRef, useState } from "react";
import type { TabMeta } from "../ipc";

interface Props {
  tab: TabMeta;
  /** 新建的 tab 直接进入改名 */
  editOnMount: boolean;
  onUpdate: (t: TabMeta) => void;
  /** 手机布局:名称前的 ≡ */
  lead?: ReactNode;
  /** 手机布局:同步符号 */
  tools?: ReactNode;
}

/** 页头:tab 名(点击改名)与单字。删除、同步、加密在 tab 的右键菜单里。 */
export function PageHeader({ tab, editOnMount, onUpdate, lead, tools }: Props) {
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
        <span className="ph-name">⚿ 加密 tab</span>
      ) : (
        <button type="button" className="ph-name" title="改名" onClick={() => setEditing(true)}>
          {tab.encrypted && <span className="muted">⚿ </span>}
          {tab.name}
        </button>
      )}
      {tools && <span className="ph-tools">{tools}</span>}
    </header>
  );
}
