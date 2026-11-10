//! Tauri 外壳:只注册命令,逻辑全部交给 baner-core。

use baner_core::config::{ConfigStore, SyncConfig};
use baner_core::secrets::SecretStore;
use baner_core::storage::{Block, Store, TabMeta};
use baner_core::sync::{self, Credentials, Detect, SyncReport};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

struct AppState {
    store: Mutex<Store>,
    data_dir: PathBuf,
    secrets: Arc<SecretStore>,
    config: Arc<ConfigStore>,
    /// 同一时间只跑一次同步
    sync_lock: Arc<Mutex<()>>,
}

const TOKEN: &str = "git-token";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncStatus {
    detect: Detect,
    config: SyncConfig,
    has_token: bool,
}

type CmdResult<T> = Result<T, baner_core::Error>;

#[tauri::command]
fn load_blocks(state: State<AppState>, tab: String) -> CmdResult<Vec<Block>> {
    state.store.lock().unwrap().list_blocks(&tab)
}

#[tauri::command]
fn save_block(state: State<AppState>, tab: String, block: Block) -> CmdResult<bool> {
    state.store.lock().unwrap().save_block(&tab, &block)
}

#[tauri::command]
fn delete_block(state: State<AppState>, tab: String, id: String, key: String) -> CmdResult<()> {
    state.store.lock().unwrap().delete_block(&tab, &id, &key)
}

#[tauri::command]
fn list_tabs(state: State<AppState>) -> CmdResult<Vec<TabMeta>> {
    state.store.lock().unwrap().list_tabs()
}

#[tauri::command]
fn save_tab(state: State<AppState>, tab: TabMeta) -> CmdResult<()> {
    state.store.lock().unwrap().save_tab(&tab)
}

#[tauri::command]
fn delete_tab(state: State<AppState>, id: String) -> CmdResult<()> {
    state.store.lock().unwrap().delete_tab(&id)
}

#[tauri::command]
fn sync_status(state: State<AppState>) -> CmdResult<SyncStatus> {
    Ok(SyncStatus {
        detect: sync::detect(&state.data_dir),
        config: state.config.load()?,
        has_token: state.secrets.get(TOKEN)?.is_some(),
    })
}

/// 保存远端配置。token 为 None 表示不修改;为空字符串表示删除。
#[tauri::command]
fn sync_configure(
    state: State<AppState>,
    remote_url: String,
    username: Option<String>,
    token: Option<String>,
) -> CmdResult<SyncStatus> {
    let url = remote_url.trim();
    if url.is_empty() {
        return Err(baner_core::Error::Git("empty remote url".into()));
    }
    sync::configure(&state.data_dir, url)?;
    let mut c = state.config.load()?;
    c.remote_url = Some(url.to_string());
    c.username = username
        .map(|u| u.trim().to_string())
        .filter(|u| !u.is_empty());
    state.config.save(&c)?;
    match token.as_deref().map(str::trim) {
        Some("") => state.secrets.delete(TOKEN)?,
        Some(t) => state.secrets.set(TOKEN, t)?,
        None => {}
    }
    sync_status(state)
}

#[tauri::command]
fn set_tab_synced(state: State<AppState>, id: String, synced: bool) -> CmdResult<SyncConfig> {
    let mut c = state.config.load()?;
    c.unsynced_tabs.retain(|t| t != &id);
    if !synced {
        c.unsynced_tabs.push(id);
    }
    state.config.save(&c)?;
    Ok(c)
}

#[tauri::command]
async fn sync_now(state: State<'_, AppState>) -> CmdResult<SyncReport> {
    let dir = state.data_dir.clone();
    let cfg = state.config.load()?;
    let creds = Credentials {
        username: cfg.username.clone(),
        token: state.secrets.get(TOKEN)?,
    };
    let lock = state.sync_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().unwrap();
        sync::sync(&dir, &cfg.unsynced_tabs, &creds)
    })
    .await
    .map_err(|e| baner_core::Error::Git(e.to_string()))?
}

/// 界面内容就绪后调用:再显示窗口,避免空白闪烁。
#[tauri::command]
fn app_ready(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // BANER_APP_DIR / BANER_DATA_DIR 可覆盖默认位置(例如在一台机器上模拟两台设备)
            let app_dir: PathBuf = std::env::var_os("BANER_APP_DIR")
                .map(Into::into)
                .unwrap_or_else(|| app.path().app_data_dir().expect("app data dir"));
            let dir: std::path::PathBuf = std::env::var_os("BANER_DATA_DIR")
                .map(Into::into)
                .unwrap_or_else(|| app_dir.join("data"));
            let store = Store::open(&dir)?;
            // 密钥文件在数据目录之外,永不进仓库(ADR-0008)
            let secrets = SecretStore::open(app_dir.join("secrets.json"), &dir)?;
            app.manage(AppState {
                store: Mutex::new(store),
                data_dir: dir,
                secrets: Arc::new(secrets),
                config: Arc::new(ConfigStore::new(app_dir.join("config.json"))),
                sync_lock: Arc::new(Mutex::new(())),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_blocks,
            save_block,
            delete_block,
            list_tabs,
            save_tab,
            delete_tab,
            sync_status,
            sync_configure,
            set_tab_synced,
            sync_now,
            app_ready
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
