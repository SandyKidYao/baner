//! 本机密钥存储(ADR-0008,取代 ADR-0006 的系统钥匙串方案)。
//!
//! git token 与解开的文件钥匙存进一个只有当前用户可读写的 JSON 文件(0600,目录 0700)。
//! 这个文件必须在数据目录(git 工作区)之外,永远不进仓库。

use crate::{Error, Result};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub struct SecretStore {
    path: PathBuf,
}

impl SecretStore {
    /// `path` 是密钥文件路径;`data_dir` 是数据目录,用来确保密钥文件不在它里面。
    pub fn open(path: impl Into<PathBuf>, data_dir: &Path) -> Result<Self> {
        let path = path.into();
        let abs = |p: &Path| p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
        let parent = path
            .parent()
            .ok_or_else(|| Error::Secret("invalid secrets path".into()))?;
        fs::create_dir_all(parent)?;
        if abs(parent).starts_with(abs(data_dir)) {
            return Err(Error::Secret(
                "secrets file must live outside the data directory".into(),
            ));
        }
        restrict(parent, 0o700)?;
        Ok(Self { path })
    }

    fn read_all(&self) -> Result<BTreeMap<String, String>> {
        match fs::read_to_string(&self.path) {
            Ok(s) => Ok(serde_json::from_str(&s)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(e) => Err(e.into()),
        }
    }

    fn write_all(&self, map: &BTreeMap<String, String>) -> Result<()> {
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(map)?)?;
        restrict(&tmp, 0o600)?;
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    pub fn get(&self, name: &str) -> Result<Option<String>> {
        Ok(self.read_all()?.get(name).cloned())
    }

    pub fn set(&self, name: &str, value: &str) -> Result<()> {
        let mut m = self.read_all()?;
        m.insert(name.to_string(), value.to_string());
        self.write_all(&m)
    }

    pub fn delete(&self, name: &str) -> Result<()> {
        let mut m = self.read_all()?;
        if m.remove(name).is_some() {
            self.write_all(&m)?;
        }
        Ok(())
    }
}

#[cfg(unix)]
fn restrict(p: &Path, mode: u32) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(p, fs::Permissions::from_mode(mode))?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict(_p: &Path, _mode: u32) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_get_delete_roundtrip() {
        let d = tempfile::tempdir().unwrap();
        let data = d.path().join("data");
        fs::create_dir_all(&data).unwrap();
        let s = SecretStore::open(d.path().join("secrets.json"), &data).unwrap();
        assert_eq!(s.get("git-token").unwrap(), None);
        s.set("git-token", "ghp_x").unwrap();
        assert_eq!(s.get("git-token").unwrap().as_deref(), Some("ghp_x"));
        s.delete("git-token").unwrap();
        assert_eq!(s.get("git-token").unwrap(), None);
    }

    #[cfg(unix)]
    #[test]
    fn file_is_private_to_user() {
        use std::os::unix::fs::PermissionsExt;
        let d = tempfile::tempdir().unwrap();
        let data = d.path().join("data");
        fs::create_dir_all(&data).unwrap();
        let p = d.path().join("secrets.json");
        SecretStore::open(&p, &data).unwrap().set("k", "v").unwrap();
        assert_eq!(
            fs::metadata(&p).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[test]
    fn refuses_location_inside_data_dir() {
        let d = tempfile::tempdir().unwrap();
        assert!(SecretStore::open(d.path().join("sub/secrets.json"), d.path()).is_err());
    }
}
