import { MOD } from "../rail/keys";
import type { MdMode } from "./markdown";

interface Props {
  mode: MdMode;
  onChange: (m: MdMode) => void;
}

/** 「所见 / 源码」切换(本机全局偏好,⌘E)。 */
export function ModeToggle({ mode, onChange }: Props) {
  const item = (m: MdMode, label: string, title: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      title={`${title} ${MOD}E`}
      aria-label={title}
      onClick={() => onChange(m)}
    >
      {label}
    </button>
  );
  return (
    <fieldset className="modes">
      <legend className="sr-only">编辑模式</legend>
      {item("wysiwyg", "Aa", "所见即所得")}
      {item("source", "#", "Markdown 源码")}
    </fieldset>
  );
}
