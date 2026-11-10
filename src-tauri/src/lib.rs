//! Tauri 外壳:只注册命令,逻辑全部交给 baner-core。

use baner_core::storage::{Block, Store};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    store: Mutex<Store>,
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

/// `BANER_PROBE_KEYCHAIN=1` 时,只做一次钥匙串读写探测然后退出,用于验证代码签名稳定(ADR-0006)。
fn keychain_probe() -> ! {
    use baner_core::secrets;
    let t = std::time::Instant::now();
    let before = secrets::get("probe");
    let read_ms = t.elapsed().as_millis();
    let write = secrets::set("probe", "ok");
    println!("PROBE read_existing={before:?} read_ms={read_ms} write={write:?}");
    std::process::exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if std::env::var("BANER_PROBE_KEYCHAIN").as_deref() == Ok("1") {
        keychain_probe();
    }
    tauri::Builder::default()
        .setup(|app| {
            let dir = std::env::var_os("BANER_DATA_DIR")
                .map(Into::into)
                .unwrap_or_else(|| {
                    app.path()
                        .app_data_dir()
                        .expect("app data dir")
                        .join("data")
                });
            let store = Store::open(dir)?;
            app.manage(AppState {
                store: Mutex::new(store),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_blocks, save_block, app_ready])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
