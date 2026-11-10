//! Tauri 外壳:只注册命令,逻辑全部交给 baner-core。

use baner_core::secrets::SecretStore;
use baner_core::storage::{Block, Store};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    store: Mutex<Store>,
    #[allow(dead_code)] // backlog 第 3 项(git token)起使用
    secrets: SecretStore,
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
            let app_dir = app.path().app_data_dir().expect("app data dir");
            let dir: std::path::PathBuf = std::env::var_os("BANER_DATA_DIR")
                .map(Into::into)
                .unwrap_or_else(|| app_dir.join("data"));
            let store = Store::open(&dir)?;
            // 密钥文件在数据目录之外,永不进仓库(ADR-0008)
            let secrets = SecretStore::open(app_dir.join("secrets.json"), &dir)?;
            app.manage(AppState {
                store: Mutex::new(store),
                secrets,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_blocks, save_block, app_ready])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
