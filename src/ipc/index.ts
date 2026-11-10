// 界面层调用核心层的唯一入口。其他模块不要直接调用 invoke。
import { invoke } from "@tauri-apps/api/core";
import type { Block } from "./types";

export type { Block } from "./types";

export const loadBlocks = (tab: string) => invoke<Block[]>("load_blocks", { tab });
export const saveBlock = (tab: string, block: Block) => invoke<boolean>("save_block", { tab, block });
export const appReady = () => invoke<void>("app_ready");
