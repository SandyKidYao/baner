import { useEffect, useRef, useState } from "react";
import type { TabMeta } from "../ipc";

interface Props {
  tab: TabMeta;
  /** 结束改名:有变化时带上新的 tab,取消或没变化时为 null */
  onDone: (t: TabMeta | null) => void;
}

/** 改名表单:单字 + 名称。回车或失去焦点时提交,Esc 取消。顶栏 tab 与手机顶栏共用。 */
export function TabNameEdit({ tab, onDone }: Props) {
  const [name, setName] = useState(tab.name);
  const [glyph, setGlyph] = useState(tab.glyph);
  const nameRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    nameRef.current?.select();
  }, []);

  const finish = (t: TabMeta | null) => {
    if (done.current) return; // 回车提交后表单卸载时还可能再收到一次 blur
    done.current = true;
    onDone(t);
  };
  const commit = () => {
    // 单字没动、且原本就是旧名字的首字时,跟随新名字
    const auto = glyph === tab.glyph && [...tab.name.trim()][0] === tab.glyph;
    if (name.trim() && (name !== tab.name || glyph !== tab.glyph))
      finish({ ...tab, name, glyph: auto ? "" : glyph });
    else finish(null);
  };

  return (
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
          e.preventDefault();
          finish(null);
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
  );
}
