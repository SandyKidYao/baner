export interface Block {
  id: string;
  key: string;
  text: string;
}

export interface TabMeta {
  id: string;
  name: string;
  /** 轨道上显示的单字 */
  glyph: string;
  key: string;
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
