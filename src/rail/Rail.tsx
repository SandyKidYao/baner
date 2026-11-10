import type { TabMeta } from "../ipc";
import { PlusIcon } from "./icons";
import { MOD } from "./keys";

interface Props {
  tabs: TabMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

/** 左侧轨道:单字 tab,悬停显示全名与快捷键。 */
export function Rail({ tabs, activeId, onSelect, onCreate }: Props) {
  return (
    <nav className="rail" aria-label="tab">
      {tabs.map((t, i) => {
        const hint = i < 9 ? ` ${MOD}${i + 1}` : "";
        return (
          <button
            key={t.id}
            type="button"
            className={t.id === activeId ? "tab act" : "tab"}
            aria-current={t.id === activeId ? "page" : undefined}
            aria-label={t.name}
            title={`${t.name}${hint}`}
            onClick={() => onSelect(t.id)}
          >
            {t.glyph}
          </button>
        );
      })}
      <button
        type="button"
        className="tab add"
        aria-label="新 tab"
        title={`新 tab ${MOD}T`}
        onClick={onCreate}
      >
        <PlusIcon />
      </button>
    </nav>
  );
}
