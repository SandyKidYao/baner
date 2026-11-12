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
    /// GitHub 登录与接口;内容不含 token
    #[error("github: {0}")]
    Github(String),
    #[error("crypto: {0}")]
    Crypto(String),
    #[error("wrong master key")]
    WrongMasterKey,
    /// 加密内容,但本机还没有配置主密钥
    #[error("locked: master key not configured on this device")]
    Locked,
}

pub type Result<T> = std::result::Result<T, Error>;

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
