// 浏览器内测试用:用内存(加 localStorage)模拟核心层命令,不需要启动 Tauri。
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Block } from "./types";

const KEY = "baner-mock-store";
type Db = Record<string, Block[]>;

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
    const a = (args ?? {}) as { tab?: string; block?: Block };
    const db = read();
    switch (cmd) {
      case "load_blocks":
        return [...(db[a.tab ?? ""] ?? [])].sort((x, y) => x.key.localeCompare(y.key));
      case "save_block": {
        const tab = a.tab ?? "";
        const b = a.block as Block;
        const list = (db[tab] ?? []).filter((x) => x.id !== b.id);
        db[tab] = [...list, b];
        write(db);
        return true;
      }
      case "app_ready":
        return null;
      default:
        throw new Error(`mock: unknown command ${cmd}`);
    }
  });
}
