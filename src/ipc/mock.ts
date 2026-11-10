// 浏览器内测试用:用内存(加 localStorage)模拟核心层命令,不需要启动 Tauri。
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Block, TabMeta } from "./types";

const KEY = "baner-mock-store";
type Db = Record<string, Block[]> & { __tabs?: TabMeta[] };

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
  mockIPC((cmd, args) => {
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
      case "app_ready":
        return null;
      default:
        throw new Error(`mock: unknown command ${cmd}`);
    }
  });
}
