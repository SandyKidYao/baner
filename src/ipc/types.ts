export interface Block {
  id: string;
  key: string;
  text: string;
  /** 缺省为 "text";图块的 text 为空,内容用 loadDrawing 读取 */
  kind?: "text" | "draw";
}

/** 图块:Excalidraw 场景 JSON(事实来源)与 SVG 预览(ADR-0002) */
export interface Drawing {
  scene: string;
  svg: string;
}

export interface TabMeta {
  id: string;
  name: string;
  /** 轨道上显示的单字 */
  glyph: string;
  key: string;
  /** 是否加密(只读,由核心层给出) */
  encrypted?: boolean;
  /** 加密且本机没有主密钥:名称与内容都不可读 */
  locked?: boolean;
}

export interface CryptoStatus {
  configured: boolean;
  repoHasIdentity: boolean;
}

export interface SyncConfig {
  remoteUrl: string | null;
  username: string | null;
  unsyncedTabs: string[];
}

export interface SyncStatus {
  detect: { isRepo: boolean; remoteUrl: string | null; hasCommits: boolean };
  config: SyncConfig;
  hasToken: boolean;
}

export interface SyncReport {
  committed: boolean;
  changedTabs: string[];
  conflicts: string[];
  pushed: boolean;
}
