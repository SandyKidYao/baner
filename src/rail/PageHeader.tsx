import { useEffect, useRef, useState } from "react";
import type { TabMeta } from "../ipc";
import { EraseIcon } from "./icons";

interface Props {
  tab: TabMeta;
  canDelete: boolean;
  /** 新建的 tab 直接进入改名 */
  editOnMount: boolean;
  onUpdate: (t: TabMeta) => void;
  onDelete: () => void;
}

/** 页头:tab 名(点击改名)、单字、删除(原地再按一次确认)。 */
export function PageHeader({ tab, canDelete, editOnMount, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(editOnMount);
  const [name, setName] = useState(tab.name);
  const [glyph, setGlyph] = useState(tab.glyph);
  const [armed, setArmed] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(tab.name);
    setGlyph(tab.glyph);
    setArmed(false);
  }, [tab]);
  useEffect(() => {
    if (editOnMount) setEditing(true);
  }, [editOnMount]);
  useEffect(() => {
    if (editing) nameRef.current?.select();
  }, [editing]);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

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
      ) : (
        <button type="button" className="ph-name" title="改名" onClick={() => setEditing(true)}>
          {tab.name}
        </button>
      )}
      <span className="ph-tools">
        {canDelete && (
          <button
            type="button"
            className={armed ? "sym danger armed" : "sym"}
            aria-label={armed ? "再按一次删除这个 tab" : "删除 tab"}
            title={armed ? "再按一次确认" : "删除 tab"}
            onClick={() => (armed ? onDelete() : setArmed(true))}
          >
            <EraseIcon />
            {armed && <span className="sym-text">再按一次确认</span>}
          </button>
        )}
      </span>
    </header>
  );
}
