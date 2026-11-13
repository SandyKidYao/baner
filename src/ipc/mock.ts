// 浏览器内测试用:用内存(加 localStorage)模拟核心层命令,不需要启动 Tauri。
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Block, Drawing, TabMeta } from "./types";

const KEY = "baner-mock-store";
type MockSync = {
  remoteUrl: string | null;
  githubLogin: string | null;
  unsyncedTabs: string[];
  hasToken: boolean;
};
const NO_SYNC: MockSync = { remoteUrl: null, githubLogin: null, unsyncedTabs: [], hasToken: false };
const config = (c: MockSync) => ({
  remoteUrl: c.remoteUrl,
  githubLogin: c.githubLogin,
  githubId: c.githubLogin ? 1 : null,
  unsyncedTabs: c.unsyncedTabs,
});
type Db = Record<string, Block[]> & {
  __tabs?: TabMeta[];
  __sync?: MockSync;
  /** 模拟:本机是否有文件钥匙;本机是否已有 identity.age;主密钥;
   *  remotePass:远端仓库里已有主密钥、但还没同步到本机 */
  __crypto?: {
    configured: boolean;
    repoHasIdentity: boolean;
    pass?: string;
    remotePass?: string;
    /** 这些 tab 是用另一把钥匙加密的 */
    mismatch?: string[];
  };
  /** 图块内容,键为 "<tab>/<块id>" */
  __drawings?: Record<string, Drawing>;
};

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
      case "load_blocks": {
        const t = (db.__tabs ?? []).find((x) => x.id === a.tab);
        if (t?.encrypted && !db.__crypto?.configured)
          throw "locked: master key not configured on this device";
        if (t && db.__crypto?.mismatch?.includes(t.id)) throw "locked: key mismatch";
        return [...(db[a.tab ?? ""] ?? [])].sort((x, y) => x.key.localeCompare(y.key));
      }
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
        if (db.__drawings) delete db.__drawings[`${tab}/${id}`];
        write(db);
        return null;
      }
      case "load_drawing": {
        const x = args as { tab: string; id: string };
        const t = (db.__tabs ?? []).find((y) => y.id === x.tab);
        if (t?.encrypted && !db.__crypto?.configured)
          throw "locked: master key not configured on this device";
        return db.__drawings?.[`${x.tab}/${x.id}`] ?? null;
      }
      case "save_drawing": {
        const x = args as { tab: string; id: string; key: string; drawing: Drawing };
        db.__drawings = { ...db.__drawings, [`${x.tab}/${x.id}`]: x.drawing };
        db[x.tab] = [
          ...(db[x.tab] ?? []).filter((y) => y.id !== x.id),
          { id: x.id, key: x.key, text: "", kind: "draw" },
        ];
        write(db);
        return true;
      }
      case "list_tabs": {
        const locked = !db.__crypto?.configured;
        return [...(db.__tabs ?? [])]
          .map((t) => (t.encrypted && locked ? { ...t, name: "", glyph: "⚿", key: "~", locked: true } : t))
          .sort((x, y) => x.key.localeCompare(y.key));
      }
      case "save_tab": {
        const t = (args as { tab: TabMeta }).tab;
        const name = t.name.trim();
        if (!name) throw new Error("invalid name: empty tab name");
        const glyph = [...(t.glyph.trim() || name)][0];
        const prev = (db.__tabs ?? []).find((x) => x.id === t.id);
        db.__tabs = [
          ...(db.__tabs ?? []).filter((x) => x.id !== t.id),
          { ...t, name, glyph, encrypted: prev?.encrypted ?? false, locked: false },
        ];
        write(db);
        // 测试可设置 localStorage["baner-mock-save-tab-delay"] 让写 tab 变慢,复现启动时的竞争
        const delay = Number(localStorage.getItem("baner-mock-save-tab-delay"));
        return delay ? new Promise((r) => setTimeout(() => r(null), delay)) : null;
      }
      case "delete_tab":
        db.__tabs = (db.__tabs ?? []).filter((x) => x.id !== a.id);
        delete db[a.id ?? ""];
        write(db);
        return null;
      case "sync_status": {
        const c = db.__sync ?? NO_SYNC;
        return {
          detect: { isRepo: !!c.remoteUrl, remoteUrl: c.remoteUrl, hasCommits: false },
          config: config(c),
          hasToken: c.hasToken,
        };
      }
      case "github_login_start":
        localStorage.setItem("baner-mock-github-polls", "0");
        return { userCode: "WDJB-MJHT", interval: 0.05, expiresIn: 900 };
      case "github_login_poll": {
        // 测试可设置 localStorage["baner-mock-github-poll"] = pending / denied / expired;不设则第二次轮询完成
        const n = Number(localStorage.getItem("baner-mock-github-polls")) + 1;
        localStorage.setItem("baner-mock-github-polls", String(n));
        const forced = localStorage.getItem("baner-mock-github-poll");
        if (forced) return { state: forced };
        if (n < 2) return { state: "pending" };
        db.__sync = { ...(db.__sync ?? NO_SYNC), githubLogin: "octo", hasToken: true };
        write(db);
        return { state: "done", status: handler("sync_status", {}) };
      }
      case "github_logout":
        db.__sync = { ...(db.__sync ?? NO_SYNC), githubLogin: null, hasToken: false };
        write(db);
        return handler("sync_status", {});
      case "github_repos": {
        // 测试可设置 localStorage["baner-mock-github-repos"] 为 RepoList 的 JSON
        const custom = localStorage.getItem("baner-mock-github-repos");
        if (custom) return JSON.parse(custom);
        return {
          installed: true,
          repos: [
            { fullName: "octo/baner-notes", private: true, pushedAt: "2026-11-01T00:00:00Z" },
            { fullName: "octo/blog", private: false, pushedAt: "2026-10-01T00:00:00Z" },
          ],
        };
      }
      case "github_open": {
        const opened = JSON.parse(localStorage.getItem("baner-mock-opened") ?? "[]") as string[];
        opened.push((args as { page: string }).page);
        localStorage.setItem("baner-mock-opened", JSON.stringify(opened));
        return null;
      }
      case "sync_use_repo": {
        const name = (args as { fullName: string }).fullName;
        db.__sync = { ...(db.__sync ?? NO_SYNC), remoteUrl: `https://github.com/${name}.git` };
        write(db);
        return handler("sync_status", {});
      }
      case "set_tab_synced": {
        const x = args as { id: string; synced: boolean };
        const c = db.__sync ?? { ...NO_SYNC };
        c.unsyncedTabs = c.unsyncedTabs.filter((t) => t !== x.id);
        if (!x.synced) c.unsyncedTabs.push(x.id);
        db.__sync = c;
        write(db);
        return config(c);
      }
      case "sync_now": {
        localStorage.setItem(
          "baner-mock-sync-skip",
          JSON.stringify((args as { skip?: string[] }).skip ?? []),
        );
        // 测试可设置 localStorage["baner-mock-sync-error"] 来模拟失败
        const err = localStorage.getItem("baner-mock-sync-error");
        localStorage.setItem(
          "baner-mock-sync-count",
          String(Number(localStorage.getItem("baner-mock-sync-count")) + 1),
        );
        // 测试可设置 localStorage["baner-mock-sync-incoming"] = {tabs, blocks} 模拟远端带来的内容
        const incoming = localStorage.getItem("baner-mock-sync-incoming");
        let changedTabs: string[] = [];
        // 测试可设置 localStorage["baner-mock-sync-keyreset"] 模拟本机钥匙被仓库里的主密钥取代
        const keyReset = !err && !!localStorage.getItem("baner-mock-sync-keyreset");
        if (keyReset) {
          localStorage.removeItem("baner-mock-sync-keyreset");
          const cur = read();
          cur.__crypto = { configured: false, repoHasIdentity: true, pass: cur.__crypto?.remotePass };
          write(cur);
        }
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
              err
                ? reject(err)
                : resolve({ committed: true, changedTabs, conflicts: [], pushed: true, keyReset }),
            150,
          ),
        );
      }
      case "crypto_status":
        return {
          configured: !!db.__crypto?.configured,
          repoHasIdentity: !!db.__crypto?.repoHasIdentity,
        };
      case "crypto_setup": {
        const pass = (args as { passphrase: string }).passphrase;
        if ([...pass].length < 8) throw "crypto: master key too short";
        const c = db.__crypto ?? { configured: false, repoHasIdentity: false };
        if (!c.repoHasIdentity && c.remotePass) {
          // 先从仓库取来 identity.age,即使主密钥输错也留在本机
          c.repoHasIdentity = true;
          c.pass = c.remotePass;
          db.__crypto = c;
          write(db);
        }
        if (c.repoHasIdentity && c.pass && c.pass !== pass) throw "wrong master key";
        db.__crypto = { configured: true, repoHasIdentity: true, pass: c.pass ?? pass };
        write(db);
        return { configured: true, repoHasIdentity: true };
      }
      case "set_tab_encrypted": {
        const x = args as { id: string; on: boolean };
        if (!db.__crypto?.configured) throw "locked: master key not configured on this device";
        db.__tabs = (db.__tabs ?? []).map((t) => (t.id === x.id ? { ...t, encrypted: x.on } : t));
        write(db);
        return null;
      }
      case "app_ready":
        return null;
      case "plugin:app|version":
        return "0.1.1";
      case "update_check": {
        // 测试可设置 localStorage["baner-mock-update"] 为 UpdateInfo 的 JSON 模拟有新版本;
        // 设为 "error" 模拟连不上
        const u = localStorage.getItem("baner-mock-update");
        localStorage.setItem(
          "baner-mock-update-checks",
          String(Number(localStorage.getItem("baner-mock-update-checks")) + 1),
        );
        if (u === "error") throw "update: error sending request: network unreachable";
        return u ? JSON.parse(u) : null;
      }
      case "update_install":
        // 真实应用会在这里重启;模拟只记一笔
        localStorage.setItem("baner-mock-update-installed", "1");
        return new Promise((r) => setTimeout(() => r(null), 150));
      default:
        throw new Error(`mock: unknown command ${cmd}`);
    }
  };
  mockIPC((cmd, args) => handler(cmd, args));
}
