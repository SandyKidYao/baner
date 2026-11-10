// 界面层调用核心层的唯一入口。其他模块不要直接调用 invoke。
import { invoke } from "@tauri-apps/api/core";
import type { Block, SyncConfig, SyncReport, SyncStatus, TabMeta } from "./types";

export type { Block, SyncConfig, SyncReport, SyncStatus, TabMeta } from "./types";

export const loadBlocks = (tab: string) => invoke<Block[]>("load_blocks", { tab });
export const saveBlock = (tab: string, block: Block) => invoke<boolean>("save_block", { tab, block });
export const deleteBlock = (tab: string, block: Pick<Block, "id" | "key">) =>
  invoke<void>("delete_block", { tab, id: block.id, key: block.key });
export const listTabs = () => invoke<TabMeta[]>("list_tabs");
export const saveTab = (tab: TabMeta) => invoke<void>("save_tab", { tab });
export const deleteTab = (id: string) => invoke<void>("delete_tab", { id });
export const syncStatus = () => invoke<SyncStatus>("sync_status");
/** token 为 undefined 表示不修改,空字符串表示删除 */
export const syncConfigure = (remoteUrl: string, username: string | null, token?: string) =>
  invoke<SyncStatus>("sync_configure", { remoteUrl, username, token: token ?? null });
export const setTabSynced = (id: string, synced: boolean) =>
  invoke<SyncConfig>("set_tab_synced", { id, synced });
export const syncNow = () => invoke<SyncReport>("sync_now");
export const appReady = () => invoke<void>("app_ready");
