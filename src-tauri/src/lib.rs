//! Tauri 外壳:只注册命令,逻辑全部交给 baner-core。

use baner_core::config::{ConfigStore, SyncConfig};
use baner_core::crypto::{self, FileKey};
use baner_core::github::{self, Https, Page, Poll, RepoList, Token};
use baner_core::secrets::SecretStore;
use baner_core::storage::{Block, Drawing, Store, TabMeta};
use baner_core::sync::{self, Author, Credentials, Detect, SyncReport};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

struct AppState {
    store: Arc<Mutex<Store>>,
    data_dir: PathBuf,
    secrets: Arc<SecretStore>,
    config: Arc<ConfigStore>,
    /// 同一时间只跑一次同步
    sync_lock: Arc<Mutex<()>>,
    http: Arc<Https>,
    /// 进行中的 GitHub 登录:device code 只留在这里,不交给界面
    login: Arc<Mutex<Option<String>>>,
}

const TOKEN: &str = "git-token";
const FILE_KEY: &str = "file-key";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CryptoStatus {
    /// 本机已有文件钥匙
    configured: bool,
    /// 仓库里已有 identity.age(另一台设备设置过主密钥)
    repo_has_identity: bool,
}

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
fn load_drawing(
    state: State<AppState>,
    tab: String,
    id: String,
    key: String,
) -> CmdResult<Option<Drawing>> {
    state.store.lock().unwrap().load_drawing(&tab, &id, &key)
}

#[tauri::command]
fn save_drawing(
    state: State<AppState>,
    tab: String,
    id: String,
    key: String,
    drawing: Drawing,
) -> CmdResult<bool> {
    state
        .store
        .lock()
        .unwrap()
        .save_drawing(&tab, &id, &key, &drawing)
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

/// 界面拿到的验证码(不含 device code)
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginCode {
    user_code: String,
    /// 秒
    interval: u64,
    expires_in: u64,
}

#[derive(Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
enum LoginPoll {
    Pending,
    SlowDown { interval: u64 },
    Expired,
    Denied,
    Done { status: SyncStatus },
}

/// 网络请求放到后台线程,不阻塞界面。
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> CmdResult<T> + Send + 'static,
) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| baner_core::Error::Github(e.to_string()))?
}

/// GitHub 登录第一步:申请验证码。
#[tauri::command]
async fn github_login_start(state: State<'_, AppState>) -> CmdResult<LoginCode> {
    let http = state.http.clone();
    let code = blocking(move || github::start_login(http.as_ref())).await?;
    *state.login.lock().unwrap() = Some(code.device_code);
    Ok(LoginCode {
        user_code: code.user_code,
        interval: code.interval,
        expires_in: code.expires_in,
    })
}

/// GitHub 登录第二步:界面按间隔调用,直到授权完成、过期或被拒绝。
#[tauri::command]
async fn github_login_poll(state: State<'_, AppState>) -> CmdResult<LoginPoll> {
    let device = state
        .login
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| baner_core::Error::Github("no login in progress".into()))?;
    let http = state.http.clone();
    let poll = blocking(move || github::poll_login(http.as_ref(), &device)).await?;
    let token = match poll {
        Poll::Pending => return Ok(LoginPoll::Pending),
        Poll::SlowDown(interval) => return Ok(LoginPoll::SlowDown { interval }),
        Poll::Expired | Poll::Denied => {
            *state.login.lock().unwrap() = None;
            return Ok(if matches!(poll, Poll::Expired) {
                LoginPoll::Expired
            } else {
                LoginPoll::Denied
            });
        }
        Poll::Done(t) => t,
    };
    *state.login.lock().unwrap() = None;
    let http = state.http.clone();
    let t = token.clone();
    let user = blocking(move || github::current_user(http.as_ref(), &t)).await?;
    state.secrets.set(TOKEN, token.expose())?;
    let mut c = state.config.load()?;
    c.github_login = Some(user.login);
    c.github_id = Some(user.id);
    state.config.save(&c)?;
    Ok(LoginPoll::Done {
        status: sync_status(state)?,
    })
}

/// 退出登录:删除本机 token,保留仓库选择(再次登录后接着用)。
#[tauri::command]
fn github_logout(state: State<AppState>) -> CmdResult<SyncStatus> {
    *state.login.lock().unwrap() = None;
    state.secrets.delete(TOKEN)?;
    let mut c = state.config.load()?;
    c.github_login = None;
    c.github_id = None;
    state.config.save(&c)?;
    sync_status(state)
}

/// 用户授权给 Baner 的仓库。
#[tauri::command]
async fn github_repos(state: State<'_, AppState>) -> CmdResult<RepoList> {
    let token = state
        .secrets
        .get(TOKEN)?
        .map(Token::new)
        .ok_or_else(|| baner_core::Error::Github("unauthorized".into()))?;
    let http = state.http.clone();
    blocking(move || github::list_repos(http.as_ref(), &token)).await
}

/// 在浏览器里打开 GitHub 的某个页面。地址由核心层给出,界面不能指定任意网址。
#[tauri::command]
fn github_open(app: tauri::AppHandle, page: Page) -> CmdResult<()> {
    app.opener()
        .open_url(github::page_url(page), None::<&str>)
        .map_err(|e| baner_core::Error::Github(e.to_string()))
}

/// 选定同步用的仓库(`owner/repo`)。首次会初始化本地仓库。
#[tauri::command]
fn sync_use_repo(state: State<AppState>, full_name: String) -> CmdResult<SyncStatus> {
    let url = github::remote_url(&full_name)?;
    sync::configure(&state.data_dir, &url)?;
    let mut c = state.config.load()?;
    c.remote_url = Some(url);
    state.config.save(&c)?;
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
    let author = match (&cfg.github_login, cfg.github_id) {
        (Some(login), Some(id)) => Some(Author {
            name: login.clone(),
            email: github::User {
                login: login.clone(),
                id,
            }
            .noreply_email(),
        }),
        _ => None,
    };
    let creds = Credentials {
        username: Some("x-access-token".into()),
        token: state.secrets.get(TOKEN)?,
        author,
    };
    let lock = state.sync_lock.clone();
    let store = state.store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().unwrap();
        let mut report = sync::sync(&dir, &cfg.unsynced_tabs, &creds)?;
        // 合并可能把明文文件带进加密 tab(另一台设备开启加密前的修改),立即加密掉
        let fixed = store.lock().unwrap().enforce_encryption()?;
        if !fixed.is_empty() {
            report.changed_tabs.extend(fixed);
            report.changed_tabs.sort();
            report.changed_tabs.dedup();
        }
        Ok(report)
    })
    .await
    .map_err(|e| baner_core::Error::Git(e.to_string()))?
}

#[tauri::command]
fn crypto_status(state: State<AppState>) -> CmdResult<CryptoStatus> {
    Ok(CryptoStatus {
        configured: state.store.lock().unwrap().has_key(),
        repo_has_identity: state.data_dir.join(crypto::IDENTITY_FILE).exists(),
    })
}

/// 设置或输入主密钥:仓库里已有 identity.age 就用主密钥解开它;否则生成新的文件钥匙并用主密钥包裹。
#[tauri::command]
async fn crypto_setup(state: State<'_, AppState>, passphrase: String) -> CmdResult<CryptoStatus> {
    let path = state.data_dir.join(crypto::IDENTITY_FILE);
    // scrypt 约 1 秒,放到后台线程
    let key = tauri::async_runtime::spawn_blocking(move || -> baner_core::Result<FileKey> {
        match std::fs::read(&path) {
            Ok(data) => crypto::unwrap(&data, &passphrase),
            Err(_) => {
                let key = FileKey::generate();
                std::fs::write(&path, crypto::wrap(&key, &passphrase, None)?)?;
                Ok(key)
            }
        }
    })
    .await
    .map_err(|e| baner_core::Error::Crypto(e.to_string()))??;
    state.secrets.set(FILE_KEY, &key.export())?;
    state.store.lock().unwrap().set_key(Some(key));
    crypto_status(state)
}

#[tauri::command]
fn set_tab_encrypted(state: State<AppState>, id: String, on: bool) -> CmdResult<()> {
    state.store.lock().unwrap().set_tab_encrypted(&id, on)
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
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // BANER_APP_DIR / BANER_DATA_DIR 可覆盖默认位置(例如在一台机器上模拟两台设备)
            let app_dir: PathBuf = std::env::var_os("BANER_APP_DIR")
                .map(Into::into)
                .unwrap_or_else(|| app.path().app_data_dir().expect("app data dir"));
            let dir: std::path::PathBuf = std::env::var_os("BANER_DATA_DIR")
                .map(Into::into)
                .unwrap_or_else(|| app_dir.join("data"));
            let mut store = Store::open(&dir)?;
            // 密钥文件在数据目录之外,永不进仓库(ADR-0008)
            let secrets = SecretStore::open(app_dir.join("secrets.json"), &dir)?;
            if let Some(k) = secrets.get(FILE_KEY)? {
                store.set_key(Some(FileKey::parse(&k)?));
            }
            app.manage(AppState {
                store: Arc::new(Mutex::new(store)),
                data_dir: dir,
                secrets: Arc::new(secrets),
                config: Arc::new(ConfigStore::new(app_dir.join("config.json"))),
                sync_lock: Arc::new(Mutex::new(())),
                http: Arc::new(Https::default()),
                login: Arc::new(Mutex::new(None)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_blocks,
            save_block,
            delete_block,
            load_drawing,
            save_drawing,
            list_tabs,
            save_tab,
            delete_tab,
            sync_status,
            github_login_start,
            github_login_poll,
            github_logout,
            github_repos,
            github_open,
            sync_use_repo,
            set_tab_synced,
            sync_now,
            crypto_status,
            crypto_setup,
            set_tab_encrypted,
            app_ready
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
