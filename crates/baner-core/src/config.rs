//! 本机配置(不进仓库):远端地址、用户名、不同步的 tab。token 在 secrets 里。

use crate::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SyncConfig {
    pub remote_url: Option<String>,
    /// HTTPS 用户名;GitHub 可以留空(用 token 即可)
    pub username: Option<String>,
    /// 本机不同步的 tab id
    pub unsynced_tabs: Vec<String>,
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
        fs::rename(tmp, &self.path)?;
        Ok(())
    }
}
