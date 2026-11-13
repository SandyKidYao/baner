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
  /** 登录的 GitHub 账号;为空表示没有用 GitHub 登录 */
  githubLogin: string | null;
  githubId: number | null;
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
  /** 本机没用过的钥匙被仓库里的主密钥取代:需要重新输入主密钥 */
  keyReset: boolean;
}

/** GitHub 登录的验证码。秒为单位 */
export interface LoginCode {
  userCode: string;
  interval: number;
  expiresIn: number;
}

export type LoginPoll =
  | { state: "pending" }
  | { state: "slowDown"; interval: number }
  | { state: "expired" }
  | { state: "denied" }
  | { state: "done"; status: SyncStatus };

export interface Repo {
  /** owner/repo */
  fullName: string;
  private: boolean;
  pushedAt: string | null;
}

export interface RepoList {
  /** 是否已经在某个账号上安装了 Baner 的 GitHub App */
  installed: boolean;
  repos: Repo[];
}

/** 应用能替用户打开的 GitHub 页面 */
export type GithubPage = "device" | "install" | "newRepo";

/** GitHub Release 上比本机新的版本 */
export interface UpdateInfo {
  version: string;
  currentVersion: string;
  /** Release 说明 */
  notes: string | null;
}

/** 一条同步记录。连续的「没有变化」或同样的失败合并成一条 */
export interface SyncEntry {
  /** 毫秒时间戳;合并的记录是最后一次的时间 */
  at: number;
  /** 失败原因(原始信息);成功时为 null */
  error: string | null;
  committed: boolean;
  pushed: boolean;
  /** 远端带来变化的 tab id */
  changedTabs: string[];
  /** 写入冲突标记的块数 */
  conflicts: number;
  /** 合并了几次 */
  count: number;
}
