//! 系统安全存储(ADR-0006)。macOS 上是钥匙串;Android 在移植阶段补上。

use crate::{Error, Result};

pub const SERVICE: &str = "dev.baner.app";

fn entry(account: &str) -> Result<keyring::Entry> {
    keyring::Entry::new(SERVICE, account).map_err(|e| Error::Secret(e.to_string()))
}

pub fn set(account: &str, value: &str) -> Result<()> {
    entry(account)?
        .set_password(value)
        .map_err(|e| Error::Secret(e.to_string()))
}

/// 条目不存在时返回 Ok(None)。
pub fn get(account: &str) -> Result<Option<String>> {
    match entry(account)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(Error::Secret(e.to_string())),
    }
}

pub fn delete(account: &str) -> Result<()> {
    match entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(Error::Secret(e.to_string())),
    }
}
