//! 本机配置(不进仓库):远端地址、登录的 GitHub 账号、不同步的 tab。token 在 secrets 里。

use crate::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SyncConfig {
    pub remote_url: Option<String>,
    /// 登录的 GitHub 账号;为空表示没有用 GitHub 登录(可能是旧版手动填的 token)
    pub github_login: Option<String>,
    pub github_id: Option<u64>,
    /// 本机不同步的 tab id
    pub unsynced_tabs: Vec<String>,
}

impl SyncConfig {
    /// 开关一个 tab 的同步。新建的 tab 默认不同步,由用户在 tab 菜单或设置里打开。
    pub fn set_tab_synced(&mut self, id: &str, synced: bool) {
        self.unsynced_tabs.retain(|t| t != id);
        if !synced {
            self.unsynced_tabs.push(id.into());
        }
    }

    pub fn is_tab_synced(&self, id: &str) -> bool {
        !self.unsynced_tabs.iter().any(|t| t == id)
    }
}

pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn new(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
        }
    }

    pub fn load(&self) -> Result<SyncConfig> {
        match fs::read_to_string(&self.path) {
            Ok(s) => Ok(serde_json::from_str(&s)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(SyncConfig::default()),
            Err(e) => Err(e.into()),
        }
    }

    pub fn save(&self, c: &SyncConfig) -> Result<()> {
        if let Some(p) = self.path.parent() {
            fs::create_dir_all(p)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(c)?)?;
        crate::fsutil::replace(&tmp, &self.path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toggling_sync_keeps_one_entry_per_tab() {
        let mut c = SyncConfig::default();
        assert!(c.is_tab_synced("t1"));
        c.set_tab_synced("t1", false);
        c.set_tab_synced("t1", false);
        assert_eq!(c.unsynced_tabs, vec!["t1".to_string()]);
        assert!(!c.is_tab_synced("t1"));
        c.set_tab_synced("t1", true);
        assert!(c.unsynced_tabs.is_empty());
    }

    #[test]
    fn save_and_load_round_trip() {
        let d = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(d.path().join("config.json"));
        assert_eq!(store.load().unwrap(), SyncConfig::default());
        let mut c = SyncConfig::default();
        c.set_tab_synced("t1", false);
        store.save(&c).unwrap();
        assert_eq!(store.load().unwrap(), c);
    }
}
