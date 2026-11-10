// 浏览器内测试用:用内存(加 localStorage)模拟核心层命令,不需要启动 Tauri。
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Block, TabMeta } from "./types";

const KEY = "baner-mock-store";
type MockSync = {
  remoteUrl: string | null;
  username: string | null;
  unsyncedTabs: string[];
  hasToken: boolean;
};
type Db = Record<string, Block[]> & { __tabs?: TabMeta[]; __sync?: MockSync };

function read(): Db {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Db;
  } catch {
    return {};
  }
}
function write(db: Db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* 测试环境无存储时忽略 */
  }
}

export function installMockIpc() {
  mockWindows("main");
  const handler = (cmd: string, args?: unknown): unknown => {
    const a = (args ?? {}) as { tab?: string; block?: Block; id?: string };
    const db = read();
    switch (cmd) {
      case "load_blocks":
        return [...(db[a.tab ?? ""] ?? [])].sort((x, y) => x.key.localeCompare(y.key));
      case "save_block": {
        const tab = a.tab ?? "";
        const b = a.block as Block;
        if (!tab) throw new Error("mock: missing tab");
        const list = (db[tab] ?? []).filter((x) => x.id !== b.id);
        db[tab] = [...list, b];
        write(db);
        return true;
      }
      case "delete_block": {
        const tab = a.tab ?? "";
        const id = (args as { id?: string }).id;
        db[tab] = (db[tab] ?? []).filter((x) => x.id !== id);
        write(db);
        return null;
      }
      case "list_tabs":
        return [...(db.__tabs ?? [])].sort((x, y) => x.key.localeCompare(y.key));
      case "save_tab": {
        const t = (args as { tab: TabMeta }).tab;
        const name = t.name.trim();
        if (!name) throw new Error("invalid name: empty tab name");
        const glyph = [...(t.glyph.trim() || name)][0];
        db.__tabs = [...(db.__tabs ?? []).filter((x) => x.id !== t.id), { ...t, name, glyph }];
        write(db);
        return null;
      }
      case "delete_tab":
        db.__tabs = (db.__tabs ?? []).filter((x) => x.id !== a.id);
        delete db[a.id ?? ""];
        write(db);
        return null;
      case "sync_status": {
        const c = db.__sync ?? { remoteUrl: null, username: null, unsyncedTabs: [], hasToken: false };
        return {
          detect: { isRepo: !!c.remoteUrl, remoteUrl: c.remoteUrl, hasCommits: false },
          config: { remoteUrl: c.remoteUrl, username: c.username, unsyncedTabs: c.unsyncedTabs },
          hasToken: c.hasToken,
        };
      }
      case "sync_configure": {
        const x = args as { remoteUrl: string; username: string | null; token: string | null };
        const prev = db.__sync ?? { remoteUrl: null, username: null, unsyncedTabs: [], hasToken: false };
        db.__sync = {
          ...prev,
          remoteUrl: x.remoteUrl.trim(),
          username: x.username,
          hasToken: x.token === null ? prev.hasToken : x.token.trim() !== "",
        };
        write(db);
        return handler("sync_status", {});
      }
      case "set_tab_synced": {
        const x = args as { id: string; synced: boolean };
        const c = db.__sync ?? { remoteUrl: null, username: null, unsyncedTabs: [], hasToken: false };
        c.unsyncedTabs = c.unsyncedTabs.filter((t) => t !== x.id);
        if (!x.synced) c.unsyncedTabs.push(x.id);
        db.__sync = c;
        write(db);
        return { remoteUrl: c.remoteUrl, username: c.username, unsyncedTabs: c.unsyncedTabs };
      }
      case "sync_now": {
        // 测试可设置 localStorage["baner-mock-sync-error"] 来模拟失败
        const err = localStorage.getItem("baner-mock-sync-error");
        localStorage.setItem(
          "baner-mock-sync-count",
          String(Number(localStorage.getItem("baner-mock-sync-count")) + 1),
        );
        // 测试可设置 localStorage["baner-mock-sync-incoming"] = {tabs, blocks} 模拟远端带来的内容
        const incoming = localStorage.getItem("baner-mock-sync-incoming");
        let changedTabs: string[] = [];
        if (!err && incoming) {
          const x = JSON.parse(incoming) as { tabs: TabMeta[]; blocks: Record<string, Block[]> };
          const cur = read();
          cur.__tabs = [...(cur.__tabs ?? []), ...x.tabs];
          for (const [t, bs] of Object.entries(x.blocks)) cur[t] = bs;
          write(cur);
          localStorage.removeItem("baner-mock-sync-incoming");
          changedTabs = x.tabs.map((t) => t.id);
        }
        return new Promise((resolve, reject) =>
          setTimeout(
            () =>
              err ? reject(err) : resolve({ committed: true, changedTabs, conflicts: [], pushed: true }),
            150,
          ),
        );
      }
      case "app_ready":
        return null;
      default:
        throw new Error(`mock: unknown command ${cmd}`);
    }
  };
  mockIPC((cmd, args) => handler(cmd, args));
}
