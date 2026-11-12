//! GitHub 登录与仓库列表(ADR-0009)。
//!
//! 用 GitHub App 的 Device Flow 登录:不需要 client secret,也不需要回调地址。
//! 用户在浏览器里输入验证码并授权,应用轮询拿到 token。token 只能访问用户把这个
//! App 安装到的仓库,权限只有「仓库内容读写」。

use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::Duration;

/// GitHub App 的 Client ID(公开信息)。
pub const CLIENT_ID: &str = "Iv23libAL2glEQN7Ntag";
/// GitHub App 的网址名:`https://github.com/apps/<APP_SLUG>`。
pub const APP_SLUG: &str = "baner-notes";
/// 新建仓库时预填的名字
pub const DEFAULT_REPO_NAME: &str = "baner-notes";

const WEB: &str = "https://github.com";
const API: &str = "https://api.github.com";

/// HTTP 传输层,测试时换成假的。返回 (状态码, 响应体)。
pub trait Transport: Send + Sync {
    fn post_form(&self, url: &str, form: &[(&str, &str)]) -> Result<(u16, String)>;
    fn get(&self, url: &str, token: &Token) -> Result<(u16, String)>;
}

/// 访问 token。`Debug` 不输出内容,避免误写进日志(ADR-0008)。
#[derive(Clone, PartialEq, Eq)]
pub struct Token(String);

impl Token {
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
    }
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Token {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Token(***)")
    }
}

/// 真实的 HTTPS 传输(ureq + 系统 TLS)。
pub struct Https {
    agent: ureq::Agent,
}

impl Default for Https {
    fn default() -> Self {
        // 系统自带的 TLS 和证书库(macOS 上是 Security.framework)
        let tls = ureq::tls::TlsConfig::builder()
            .provider(ureq::tls::TlsProvider::NativeTls)
            .root_certs(ureq::tls::RootCerts::PlatformVerifier)
            .build();
        let agent = ureq::Agent::config_builder()
            .tls_config(tls)
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(20)))
            .user_agent("Baner")
            .build()
            .new_agent();
        Self { agent }
    }
}

fn net(e: ureq::Error) -> Error {
    Error::Github(format!("network: {e}"))
}

impl Transport for Https {
    fn post_form(&self, url: &str, form: &[(&str, &str)]) -> Result<(u16, String)> {
        let mut res = self
            .agent
            .post(url)
            .header("Accept", "application/json")
            .send_form(form.iter().copied())
            .map_err(net)?;
        let status = res.status().as_u16();
        Ok((status, res.body_mut().read_to_string().map_err(net)?))
    }

    fn get(&self, url: &str, token: &Token) -> Result<(u16, String)> {
        let mut res = self
            .agent
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("Authorization", &format!("Bearer {}", token.expose()))
            .call()
            .map_err(net)?;
        let status = res.status().as_u16();
        Ok((status, res.body_mut().read_to_string().map_err(net)?))
    }
}

/// 第一步拿到的验证码。`device_code` 只留在核心层,不交给界面。
#[derive(Debug, Clone, Deserialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    /// 秒
    pub expires_in: u64,
    /// 两次轮询之间至少等待的秒数
    pub interval: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Poll {
    /// 用户还没在浏览器里完成授权
    Pending,
    /// 轮询太快,以后按这个间隔(秒)
    SlowDown(u64),
    Done(Token),
    Expired,
    Denied,
}

#[derive(Deserialize)]
struct OAuthReply {
    access_token: Option<String>,
    error: Option<String>,
    interval: Option<u64>,
}

fn oauth_error(code: &str) -> Error {
    Error::Github(code.to_string())
}

/// 第一步:申请验证码。
pub fn start_login(t: &dyn Transport) -> Result<DeviceCode> {
    let (status, body) = t.post_form(
        &format!("{WEB}/login/device/code"),
        &[("client_id", CLIENT_ID)],
    )?;
    if let Ok(OAuthReply { error: Some(e), .. }) = serde_json::from_str(&body) {
        return Err(oauth_error(&e));
    }
    if status != 200 {
        return Err(Error::Github(format!("http {status}")));
    }
    let code: DeviceCode = serde_json::from_str(&body)?;
    if !code.verification_uri.starts_with(&format!("{WEB}/")) {
        return Err(Error::Github("unexpected verification uri".into()));
    }
    Ok(code)
}

/// 第二步:查询授权结果。调用方按 `interval` 间隔重复调用。
pub fn poll_login(t: &dyn Transport, device_code: &str) -> Result<Poll> {
    let (_status, body) = t.post_form(
        &format!("{WEB}/login/oauth/access_token"),
        &[
            ("client_id", CLIENT_ID),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ],
    )?;
    parse_poll(&body)
}

fn parse_poll(body: &str) -> Result<Poll> {
    let r: OAuthReply = serde_json::from_str(body)?;
    if let Some(tok) = r.access_token.filter(|s| !s.is_empty()) {
        return Ok(Poll::Done(Token::new(tok)));
    }
    match r.error.as_deref() {
        Some("authorization_pending") => Ok(Poll::Pending),
        Some("slow_down") => Ok(Poll::SlowDown(r.interval.unwrap_or(10))),
        Some("expired_token") => Ok(Poll::Expired),
        Some("access_denied") => Ok(Poll::Denied),
        Some(e) => Err(oauth_error(e)),
        None => Err(Error::Github("unexpected reply".into())),
    }
}

fn api_get<T: for<'de> Deserialize<'de>>(
    t: &dyn Transport,
    token: &Token,
    path: &str,
) -> Result<T> {
    let (status, body) = t.get(&format!("{API}{path}"), token)?;
    match status {
        200 => Ok(serde_json::from_str(&body)?),
        401 => Err(Error::Github("unauthorized".into())),
        s => Err(Error::Github(format!("http {s}"))),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct User {
    pub login: String,
    pub id: u64,
}

impl User {
    /// GitHub 的 noreply 邮箱,用作提交作者,提交在网页上会显示头像。
    pub fn noreply_email(&self) -> String {
        format!("{}+{}@users.noreply.github.com", self.id, self.login)
    }
}

pub fn current_user(t: &dyn Transport, token: &Token) -> Result<User> {
    api_get(t, token, "/user")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    pub full_name: String,
    pub private: bool,
    /// 最近推送时间(ISO 8601),用来排序
    pub pushed_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoList {
    /// 用户是否已经在某个账号上安装了这个 App
    pub installed: bool,
    /// 最近推送的在前
    pub repos: Vec<Repo>,
}

#[derive(Deserialize)]
struct Installations {
    installations: Vec<Installation>,
}

#[derive(Deserialize)]
struct Installation {
    id: u64,
}

#[derive(Deserialize)]
struct InstallationRepos {
    total_count: usize,
    repositories: Vec<RawRepo>,
}

#[derive(Deserialize)]
struct RawRepo {
    full_name: String,
    private: bool,
    pushed_at: Option<String>,
}

const PAGE: usize = 100;

/// 列出用户授权给这个 App 的全部仓库。
pub fn list_repos(t: &dyn Transport, token: &Token) -> Result<RepoList> {
    let inst: Installations = api_get(t, token, &format!("/user/installations?per_page={PAGE}"))?;
    let mut repos: Vec<Repo> = vec![];
    for i in &inst.installations {
        for page in 1.. {
            let r: InstallationRepos = api_get(
                t,
                token,
                &format!(
                    "/user/installations/{}/repositories?per_page={PAGE}&page={page}",
                    i.id
                ),
            )?;
            let n = r.repositories.len();
            repos.extend(r.repositories.into_iter().map(|x| Repo {
                full_name: x.full_name,
                private: x.private,
                pushed_at: x.pushed_at,
            }));
            if n < PAGE || page * PAGE >= r.total_count {
                break;
            }
        }
    }
    repos.sort_by(|a, b| {
        b.pushed_at
            .cmp(&a.pushed_at)
            .then(a.full_name.cmp(&b.full_name))
    });
    repos.dedup_by(|a, b| a.full_name == b.full_name);
    Ok(RepoList {
        installed: !inst.installations.is_empty(),
        repos,
    })
}

fn valid_full_name(full_name: &str) -> bool {
    let ok = |s: &str, extra: &str| {
        !s.is_empty()
            && !s.starts_with('.')
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || extra.contains(c))
    };
    matches!(full_name.split_once('/'), Some((o, r)) if ok(o, "") && ok(r, "._"))
}

/// `owner/repo` → HTTPS 远端地址。
pub fn remote_url(full_name: &str) -> Result<String> {
    if !valid_full_name(full_name) {
        return Err(Error::Github(format!(
            "invalid repository name: {full_name}"
        )));
    }
    Ok(format!("{WEB}/{full_name}.git"))
}

/// 应用会替用户打开的网页。地址全部由核心层拼出,界面不能让应用打开任意网址。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Page {
    /// 输入验证码的页面
    Device,
    /// 安装 App、选择授权哪些仓库(已安装时 GitHub 会给出「Configure」入口)
    Install,
    /// 新建私有仓库,名字预填
    NewRepo,
}

pub fn page_url(p: Page) -> String {
    match p {
        Page::Device => format!("{WEB}/login/device"),
        Page::Install => format!("{WEB}/apps/{APP_SLUG}/installations/new"),
        Page::NewRepo => format!("{WEB}/new?name={DEFAULT_REPO_NAME}&visibility=private"),
    }
}

#[cfg(test)]
mod tests;
