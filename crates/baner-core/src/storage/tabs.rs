//! tab 元数据:tabs/<tab-id>/tab.json(ADR-0005)。

use super::{Store, check_name};
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TabMeta {
    pub id: String,
    pub name: String,
    /// 轨道上显示的单字
    pub glyph: String,
    /// 排序键(分数排序键,与块相同的规则)
    pub key: String,
}

#[derive(Serialize, Deserialize)]
struct TabFile {
    name: String,
    glyph: String,
    key: String,
}

fn first_char(s: &str) -> String {
    s.chars()
        .find(|c| !c.is_whitespace())
        .map(String::from)
        .unwrap_or_else(|| "·".into())
}

impl Store {
    /// 按排序键列出所有 tab。缺少 tab.json 的旧文件夹按文件夹名补全元数据。
    pub fn list_tabs(&self) -> Result<Vec<TabMeta>> {
        let mut out = vec![];
        for entry in fs::read_dir(self.root().join("tabs"))? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let Some(id) = entry.file_name().to_str().map(String::from) else {
                continue;
            };
            if check_name(&id).is_err() {
                continue;
            }
            let meta = match fs::read_to_string(entry.path().join("tab.json")) {
                Ok(s) => {
                    let f: TabFile = serde_json::from_str(&s)?;
                    TabMeta {
                        id,
                        name: f.name,
                        glyph: f.glyph,
                        key: f.key,
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => TabMeta {
                    glyph: first_char(&id),
                    name: id.clone(),
                    key: "a0".into(),
                    id,
                },
                Err(e) => return Err(e.into()),
            };
            out.push(meta);
        }
        out.sort_by(|a, b| a.key.cmp(&b.key).then(a.id.cmp(&b.id)));
        Ok(out)
    }

    /// 新建或更新一个 tab 的元数据。
    pub fn save_tab(&self, tab: &TabMeta) -> Result<()> {
        check_name(&tab.id)?;
        check_name(&tab.key)?;
        let name = tab.name.trim();
        if name.is_empty() {
            return Err(Error::InvalidName("empty tab name".into()));
        }
        let glyph = if tab.glyph.trim().is_empty() {
            first_char(name)
        } else {
            first_char(&tab.glyph)
        };
        let dir = self.tab_dir(&tab.id)?;
        fs::create_dir_all(&dir)?;
        let body = serde_json::to_string_pretty(&TabFile {
            name: name.into(),
            glyph,
            key: tab.key.clone(),
        })?;
        let tmp = dir.join(".tab.json.tmp");
        fs::write(&tmp, body)?;
        fs::rename(&tmp, dir.join("tab.json"))?;
        Ok(())
    }

    /// 删除整个 tab 文件夹。
    pub fn delete_tab(&self, id: &str) -> Result<()> {
        let dir = self.tab_dir(id)?;
        match fs::remove_dir_all(&dir) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Block;

    fn t(id: &str, name: &str, glyph: &str, key: &str) -> TabMeta {
        TabMeta {
            id: id.into(),
            name: name.into(),
            glyph: glyph.into(),
            key: key.into(),
        }
    }

    #[test]
    fn save_list_in_key_order_and_glyph_defaults_to_first_char() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.save_tab(&t("t2", "需求池", "", "a1")).unwrap();
        s.save_tab(&t("t1", "工作", "工", "a0")).unwrap();
        let tabs = s.list_tabs().unwrap();
        assert_eq!(
            tabs,
            vec![t("t1", "工作", "工", "a0"), t("t2", "需求池", "需", "a1")]
        );
    }

    #[test]
    fn legacy_folder_without_tab_json_is_listed() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.save_block(
            "default",
            &Block {
                id: "b0".into(),
                key: "a0".into(),
                text: "x".into(),
            },
        )
        .unwrap();
        assert_eq!(
            s.list_tabs().unwrap(),
            vec![t("default", "default", "d", "a0")]
        );
    }

    #[test]
    fn delete_tab_removes_blocks_too() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.save_tab(&t("t1", "工作", "工", "a0")).unwrap();
        s.save_block(
            "t1",
            &Block {
                id: "b0".into(),
                key: "a0".into(),
                text: "x".into(),
            },
        )
        .unwrap();
        s.delete_tab("t1").unwrap();
        assert!(s.list_tabs().unwrap().is_empty());
        assert!(s.delete_tab("../x").is_err());
    }

    #[test]
    fn rejects_empty_name() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        assert!(s.save_tab(&t("t1", "  ", "", "a0")).is_err());
    }
}
