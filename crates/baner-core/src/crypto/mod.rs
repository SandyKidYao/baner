//! 端侧加密(ADR-0004):age 格式,两层钥匙。
//! - 文件钥匙:一把 age X25519 身份,所有加密文件都以它为接收者。
//! - 主密钥:用户记住的口令,用 age 的 scrypt 口令模式包裹文件钥匙,存为 `.baner/identity.age` 随仓库同步。
//!
//! 逃生通道:`age -d .baner/identity.age > key.txt`(输入主密钥),再 `age -d -i key.txt 任意文件.age`。

use crate::{Error, Result};
use age::secrecy::{ExposeSecret, SecretString};
use std::io::{Read, Write};
use std::iter;

pub const IDENTITY_FILE: &str = ".baner/identity.age";

pub struct FileKey(age::x25519::Identity);

impl FileKey {
    pub fn generate() -> Self {
        Self(age::x25519::Identity::generate())
    }

    pub fn parse(s: &str) -> Result<Self> {
        s.trim()
            .parse::<age::x25519::Identity>()
            .map(Self)
            .map_err(|e| Error::Crypto(e.to_string()))
    }

    /// 导出为 `AGE-SECRET-KEY-…` 字符串(只写入本机密钥文件)。
    pub fn export(&self) -> String {
        self.0.to_string().expose_secret().to_string()
    }

    pub fn encrypt(&self, plain: &[u8]) -> Result<Vec<u8>> {
        age::encrypt(&self.0.to_public(), plain).map_err(|e| Error::Crypto(e.to_string()))
    }

    pub fn decrypt(&self, cipher: &[u8]) -> Result<Vec<u8>> {
        age::decrypt(&self.0, cipher).map_err(|e| Error::Crypto(e.to_string()))
    }
}

/// 用主密钥包裹文件钥匙,得到 identity.age 的内容。`log_n` 仅测试时用来降低 scrypt 强度。
pub fn wrap(key: &FileKey, passphrase: &str, log_n: Option<u8>) -> Result<Vec<u8>> {
    if passphrase.chars().count() < 8 {
        return Err(Error::Crypto("master key too short".into()));
    }
    let mut r = age::scrypt::Recipient::new(SecretString::from(passphrase.to_owned()));
    if let Some(n) = log_n {
        r.set_work_factor(n);
    }
    let enc = age::Encryptor::with_recipients(iter::once(&r as &dyn age::Recipient))
        .map_err(|e| Error::Crypto(e.to_string()))?;
    let mut out = vec![];
    let mut w = enc.wrap_output(&mut out)?;
    w.write_all(key.export().as_bytes())?;
    w.finish()?;
    Ok(out)
}

/// 用主密钥解开 identity.age。主密钥错误时返回 `Error::WrongMasterKey`。
pub fn unwrap(data: &[u8], passphrase: &str) -> Result<FileKey> {
    let dec = age::Decryptor::new(data).map_err(|e| Error::Crypto(e.to_string()))?;
    let id = age::scrypt::Identity::new(SecretString::from(passphrase.to_owned()));
    let mut reader = dec
        .decrypt(iter::once(&id as &dyn age::Identity))
        .map_err(|e| match e {
            age::DecryptError::DecryptionFailed | age::DecryptError::NoMatchingKeys => {
                Error::WrongMasterKey
            }
            other => Error::Crypto(other.to_string()),
        })?;
    let mut s = String::new();
    reader.read_to_string(&mut s)?;
    FileKey::parse(&s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip_and_ciphertext_hides_plaintext() {
        let k = FileKey::generate();
        let c = k.encrypt(b"ghp_secret_token").unwrap();
        assert!(!c.windows(6).any(|w| w == b"secret"));
        assert_eq!(k.decrypt(&c).unwrap(), b"ghp_secret_token");
        assert!(FileKey::generate().decrypt(&c).is_err());
    }

    #[test]
    fn wrap_unwrap_with_master_key() {
        let k = FileKey::generate();
        let w = wrap(&k, "correct horse", Some(10)).unwrap();
        assert_eq!(unwrap(&w, "correct horse").unwrap().export(), k.export());
        assert!(matches!(
            unwrap(&w, "wrong horse!"),
            Err(Error::WrongMasterKey)
        ));
    }

    #[test]
    fn rejects_short_master_key() {
        assert!(wrap(&FileKey::generate(), "short", Some(10)).is_err());
    }

    #[test]
    fn export_parse_roundtrip() {
        let k = FileKey::generate();
        assert_eq!(FileKey::parse(&k.export()).unwrap().export(), k.export());
    }
}
