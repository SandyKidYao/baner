//! 数据目录布局(ADR-0005):
//! <root>/.baner/format.json
//! <root>/tabs/<tab-id>/<排序键>~<块id>.md

use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Block {
    pub id: String,
    pub key: String,
    pub text: String,
}

pub struct Store {
    root: PathBuf,
}

/// 只允许字母、数字和 `-`、`_`,防止路径穿越。
fn check_name(s: &str) -> Result<()> {
    if s.is_empty()
        || !s
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(Error::InvalidName(s.to_string()));
    }
    Ok(())
}

impl Store {
    /// 打开(必要时初始化)数据目录。
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(root.join(".baner"))?;
        fs::create_dir_all(root.join("tabs"))?;
        let fmt = root.join(".baner/format.json");
        if !fmt.exists() {
            fs::write(
                &fmt,
                serde_json::to_string_pretty(&serde_json::json!({ "version": FORMAT_VERSION }))?,
            )?;
        }
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn tab_dir(&self, tab: &str) -> Result<PathBuf> {
        check_name(tab)?;
        Ok(self.root.join("tabs").join(tab))
    }

    /// 按排序键顺序列出一个 tab 的文本块。
    pub fn list_blocks(&self, tab: &str) -> Result<Vec<Block>> {
        let dir = self.tab_dir(tab)?;
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut out = vec![];
        for entry in fs::read_dir(&dir)? {
            let path = entry?.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            let Some(stem) = name.strip_suffix(".md") else {
                continue;
            };
            let Some((key, id)) = stem.split_once('~') else {
                continue;
            };
            out.push(Block {
                id: id.to_string(),
                key: key.to_string(),
                text: fs::read_to_string(&path)?,
            });
        }
        out.sort_by(|a, b| a.key.cmp(&b.key).then(a.id.cmp(&b.id)));
        Ok(out)
    }

    /// 写入一个文本块。明文没有变化时不写盘,返回 false。
    pub fn save_block(&self, tab: &str, block: &Block) -> Result<bool> {
        check_name(&block.id)?;
        check_name(&block.key)?;
        let dir = self.tab_dir(tab)?;
        fs::create_dir_all(&dir)?;
        let path = dir.join(format!("{}~{}.md", block.key, block.id));
        if fs::read_to_string(&path).ok().as_deref() == Some(block.text.as_str()) {
            return Ok(false);
        }
        let tmp = dir.join(format!(".{}~{}.md.tmp", block.key, block.id));
        fs::write(&tmp, &block.text)?;
        fs::rename(&tmp, &path)?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(id: &str, key: &str, text: &str) -> Block {
        Block {
            id: id.into(),
            key: key.into(),
            text: text.into(),
        }
    }

    #[test]
    fn open_creates_layout() {
        let d = tempfile::tempdir().unwrap();
        Store::open(d.path()).unwrap();
        assert!(d.path().join(".baner/format.json").exists());
        assert!(d.path().join("tabs").is_dir());
    }

    #[test]
    fn save_then_list_roundtrip_in_key_order() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.save_block("work", &b("b2", "a1", "second")).unwrap();
        s.save_block("work", &b("b1", "a0", "first")).unwrap();
        let got = s.list_blocks("work").unwrap();
        assert_eq!(got, vec![b("b1", "a0", "first"), b("b2", "a1", "second")]);
        assert!(d.path().join("tabs/work/a0~b1.md").exists());
    }

    #[test]
    fn unchanged_text_is_not_rewritten() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        assert!(s.save_block("work", &b("b1", "a0", "x")).unwrap());
        assert!(!s.save_block("work", &b("b1", "a0", "x")).unwrap());
    }

    #[test]
    fn rejects_path_traversal() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        assert!(s.list_blocks("../etc").is_err());
        assert!(s.save_block("work", &b("../x", "a0", "")).is_err());
    }
}
