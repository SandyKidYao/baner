// 界面层调用核心层的唯一入口。其他模块不要直接调用 invoke。
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import type {
  Block,
  CryptoStatus,
  Drawing,
  GithubPage,
  LoginCode,
  LoginPoll,
  RepoList,
  SyncConfig,
  SyncReport,
  SyncStatus,
  TabMeta,
  UpdateInfo,
} from "./types";

export type {
  Block,
  CryptoStatus,
  Drawing,
  GithubPage,
  LoginCode,
  LoginPoll,
  Repo,
  RepoList,
  SyncConfig,
  SyncReport,
  SyncStatus,
  TabMeta,
  UpdateInfo,
} from "./types";

export const loadBlocks = (tab: string) => invoke<Block[]>("load_blocks", { tab });
export const saveBlock = (tab: string, block: Block) => invoke<boolean>("save_block", { tab, block });
export const deleteBlock = (tab: string, block: Pick<Block, "id" | "key">) =>
  invoke<void>("delete_block", { tab, id: block.id, key: block.key });
export const loadDrawing = (tab: string, block: Pick<Block, "id" | "key">) =>
  invoke<Drawing | null>("load_drawing", { tab, id: block.id, key: block.key });
export const saveDrawing = (tab: string, block: Pick<Block, "id" | "key">, drawing: Drawing) =>
  invoke<boolean>("save_drawing", { tab, id: block.id, key: block.key, drawing });
export const listTabs = () => invoke<TabMeta[]>("list_tabs");
export const saveTab = (tab: TabMeta) => invoke<void>("save_tab", { tab });
export const deleteTab = (id: string) => invoke<void>("delete_tab", { id });
export const syncStatus = () => invoke<SyncStatus>("sync_status");
export const githubLoginStart = () => invoke<LoginCode>("github_login_start");
export const githubLoginPoll = () => invoke<LoginPoll>("github_login_poll");
export const githubLogout = () => invoke<SyncStatus>("github_logout");
export const githubRepos = () => invoke<RepoList>("github_repos");
export const githubOpen = (page: GithubPage) => invoke<void>("github_open", { page });
/** 选定同步用的仓库(owner/repo) */
export const syncUseRepo = (fullName: string) => invoke<SyncStatus>("sync_use_repo", { fullName });
export const setTabSynced = (id: string, synced: boolean) =>
  invoke<SyncConfig>("set_tab_synced", { id, synced });
/** skip:这次临时跳过的 tab(只有本机确实没有内容时核心层才会跳过) */
export const syncNow = (skip: string[] = []) => invoke<SyncReport>("sync_now", { skip });
export const cryptoStatus = () => invoke<CryptoStatus>("crypto_status");
export const cryptoSetup = (passphrase: string) => invoke<CryptoStatus>("crypto_setup", { passphrase });
export const setTabEncrypted = (id: string, on: boolean) => invoke<void>("set_tab_encrypted", { id, on });
export const isLocked = (e: unknown) => /^locked/.test(String(e));
/** 内容是用另一把钥匙加密的(本机的主密钥和仓库里的不一致) */
export const isKeyMismatch = (e: unknown) => /^locked: key mismatch/.test(String(e));
export const appReady = () => invoke<void>("app_ready");
/** 本机应用的版本号(tauri.conf.json 的 version) */
export const appVersion = () => getVersion();
/** 检查 GitHub Release 上有没有新版本;没有时为 null */
export const updateCheck = () => invoke<UpdateInfo | null>("update_check");
/** 下载并安装 updateCheck 找到的新版本,随后应用重启 */
export const updateInstall = () => invoke<void>("update_install");
