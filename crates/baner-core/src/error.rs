use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid name: {0}")]
    InvalidName(String),
    #[error("secure storage: {0}")]
    Secret(String),
    #[error("git: {0}")]
    Git(String),
    // 下面三种是访问 git 远端时的错误分类。界面按前缀(auth: / network: / repo:)决定提示和
    // 是否自动重试,见 src/sync/errors.ts;改前缀要同步改那里。
    /// 远端拒绝了凭据:token 失效、被撤销,或本机没有 token
    #[error("auth: remote rejected the credentials")]
    AuthRejected,
    /// 连不上远端:解析地址、建立连接、收发数据或 TLS 失败
    #[error("network: {0}")]
    Network(String),
    /// 远端没有这个仓库,或 token 无权访问它
    #[error("repo: {0}")]
    RepoUnavailable(String),
    /// GitHub 登录与接口;内容不含 token
    #[error("github: {0}")]
    Github(String),
    /// 检查或安装新版本(GitHub Release)
    #[error("update: {0}")]
    Update(String),
    #[error("crypto: {0}")]
    Crypto(String),
    #[error("wrong master key")]
    WrongMasterKey,
    /// 加密内容,但本机还没有配置主密钥
    #[error("locked: master key not configured on this device")]
    Locked,
    /// 加密内容用的是另一把文件钥匙(本机的主密钥和仓库里的不一致)
    #[error("locked: key mismatch")]
    KeyMismatch,
    /// 同步时两边的 identity.age 不同,而本机已经用自己的钥匙加密过内容:不能自动处理
    #[error("identity conflict: this device's master key differs from the repository's")]
    IdentityConflict,
}

pub type Result<T> = std::result::Result<T, Error>;

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
