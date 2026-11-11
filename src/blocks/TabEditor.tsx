import { Annotation, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { DrawHost } from "../draw/draw-host";
import { type Block, deleteBlock, isLocked, loadBlocks, saveBlock, saveDrawing } from "../ipc";
import { GearIcon, LockIcon } from "../rail/icons";
import { debounce } from "./debounce";
import { blockExtensions, drawHooks, insertBlockAfter, insertDrawing } from "./editor";
import { type Diff, diff, isDraw, newBlock, parse, serialize } from "./model";

/** 同步协调用:同步前先落盘,同步后按需从磁盘重新载入。 */
export interface EditorApi {
  flush: () => Promise<void>;
  isDirty: () => boolean;
  /** 从磁盘重新载入;编辑器有未保存的改动时不覆盖,返回 false */
  reload: () => Promise<boolean>;
  /** 在当前块处插入图块并打开编辑 */
  insertDrawing: () => void;
  /** 在当前块后新建文本块并聚焦(手机布局右下角的 +) */
  insertBlock: () => void;
}

interface Props {
  tab: string;
  onReady?: () => void;
  autoFocus?: boolean;
  /** 有块落盘后调用(用于安排自动同步) */
  onSaved?: () => void;
  api?: MutableRefObject<EditorApi | null>;
  /** 加密 tab 在本机没有主密钥时,点「⚙ →」打开配置 */
  onOpenSettings?: () => void;
}

const external = Annotation.define<boolean>(); // 来自磁盘的替换,不触发保存

/** 一个 tab 的分块编辑器:载入块文件 → 编辑 → 停止输入 300ms 后只保存有变化的块。 */
export function TabEditor({ tab, onReady, autoFocus = true, onSaved, api, onOpenSettings }: Props) {
  const [locked, setLocked] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  const focus = useRef(autoFocus);
  const saved$ = useRef(onSaved);
  saved$.current = onSaved;

  useEffect(() => {
    let view: EditorView | undefined;
    let cancelled = false;
    const saved = new Map<string, Block>();
    let chain = Promise.resolve();
    const enqueue = (op: () => Promise<unknown>) => {
      chain = chain.then(op).then(
        () => {},
        (e) => console.error("保存失败", e),
      );
    };
    const draws = new DrawHost({
      tab,
      enqueue,
      onSaved: (b) => {
        saved.set(b.id, b);
        saved$.current?.();
      },
    });
    // 新出现的图块只有在内容已知时才能写(撤销删除时从缓存写回);新插入的图块由图块编辑器保存
    const pending = (d: Diff) => ({
      deletes: d.deletes,
      upserts: d.upserts.filter((b) => !isDraw(b) || draws.cache.has(b.id)),
    });

    const persist = (doc: string) =>
      enqueue(async () => {
        const { upserts, deletes } = pending(diff(saved, parse(doc)));
        for (const b of deletes) {
          await deleteBlock(tab, b);
          saved.delete(b.id);
        }
        for (const b of upserts) {
          const d = draws.cache.get(b.id);
          if (isDraw(b) && d) await saveDrawing(tab, b, d);
          else await saveBlock(tab, b);
          saved.set(b.id, b);
        }
        if (upserts.length + deletes.length > 0) saved$.current?.();
      });
    const save = debounce(persist, 300);
    const flush = () => view && save.flush(view.state.doc.toString());

    loadBlocks(tab)
      .then((blocks) => {
        if (cancelled || !host.current) return;
        for (const b of blocks) saved.set(b.id, b);
        const initial = blocks.length > 0 ? blocks : [newBlock(null, null)];
        const doc = serialize(initial);
        view = new EditorView({
          parent: host.current,
          state: EditorState.create({
            doc,
            selection: { anchor: doc.length },
            extensions: [
              blockExtensions(),
              drawHooks.of(draws.hooks),
              EditorView.contentAttributes.of({ "aria-label": "块编辑区", "data-testid": "editor" }),
              EditorView.updateListener.of((u) => {
                if (u.docChanged && !u.transactions.some((t) => t.annotation(external)))
                  save(u.state.doc.toString());
              }),
            ],
          }),
        });
        draws.view = view;
        if (focus.current) view.focus();
      })
      .catch((e) => {
        if (isLocked(e)) setLocked(true);
        else console.error("载入失败", e);
      })
      .finally(() => ready.current?.());

    const isDirty = () => {
      if (!view) return false;
      const d = pending(diff(saved, parse(view.state.doc.toString())));
      return d.upserts.length + d.deletes.length > 0;
    };
    if (api) {
      api.current = {
        flush: async () => {
          await draws.flush();
          flush();
          await chain;
        },
        isDirty,
        reload: async () => {
          await chain;
          if (!view || isDirty()) return false;
          const blocks = await loadBlocks(tab);
          if (!view || isDirty()) return false;
          saved.clear();
          for (const b of blocks) saved.set(b.id, b);
          draws.reload(); // 同步可能只改了图块内容,文档本身不变
          const doc = serialize(blocks.length > 0 ? blocks : [newBlock(null, null)]);
          if (doc === view.state.doc.toString()) return true;
          const head = Math.min(view.state.selection.main.head, doc.length);
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: doc },
            selection: { anchor: head },
            annotations: [external.of(true)],
          });
          return true;
        },
        insertDrawing: () => {
          if (view) insertDrawing(view);
        },
        insertBlock: () => {
          if (!view) return;
          insertBlockAfter(view);
          view.focus();
        },
      };
    }

    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      cancelled = true;
      void draws.flush();
      flush();
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", flush);
      view?.destroy();
      draws.destroy();
      if (api) api.current = null;
    };
  }, [tab, api]);

  if (locked) {
    return (
      <div className="locked">
        <span className="big">
          <LockIcon />
        </span>
        <p>本机未配置主密钥</p>
        <button type="button" className="sym" onClick={onOpenSettings} aria-label="去配置主密钥">
          <GearIcon /> →
        </button>
        <p className="muted">配置一次后,进出加密 tab 不再提示</p>
      </div>
    );
  }
  return <div ref={host} className="tab-editor" />;
}
