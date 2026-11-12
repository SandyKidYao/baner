//! 数据目录布局(ADR-0005):
//! <root>/.baner/format.json
//! <root>/tabs/<tab-id>/tab.json[.age]
//! <root>/tabs/<tab-id>/<排序键>~<块id>.md[.age]
//!
//! 加密 tab(存在 tab.json.age)的所有文件都以 `.age` 结尾(ADR-0004)。这里的读写接口对上层透明:
//! 传入的都是「逻辑文件名」(不含 .age),按 tab 是否加密自动选择明文或密文。

use crate::crypto::FileKey;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

mod tabs;
pub use tabs::TabMeta;

pub const FORMAT_VERSION: u32 = 1;
const AGE: &str = ".age";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Block {
    pub id: String,
    pub key: String,
    pub text: String,
    /// "text" 或 "draw"(图块;内容通过 load_drawing 单独读取)
    #[serde(default = "text_kind")]
    pub kind: String,
}

fn text_kind() -> String {
    "text".into()
}

impl Block {
    pub fn text(id: &str, key: &str, text: &str) -> Self {
        Self {
            id: id.into(),
            key: key.into(),
            text: text.into(),
            kind: text_kind(),
        }
    }
}

/// 图块:Excalidraw 场景(事实来源)与 SVG 预览(ADR-0002)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Drawing {
    pub scene: String,
    pub svg: String,
}

const DRAW_EXTS: [&str; 2] = [".excalidraw", ".svg"];

pub struct Store {
    root: PathBuf,
    key: Option<FileKey>,
}

/// 只允许字母、数字和 `-`、`_`,防止路径穿越。
pub(crate) fn check_name(s: &str) -> Result<()> {
    if s.is_empty()
        || !s
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(Error::InvalidName(s.to_string()));
    }
    Ok(())
}

fn not_found(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::NotFound
}

fn remove_if_exists(p: &Path) -> Result<()> {
    match fs::remove_file(p) {
        Ok(()) => Ok(()),
        Err(e) if not_found(&e) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

fn write_atomic(dir: &Path, name: &str, data: &[u8]) -> Result<()> {
    let tmp = dir.join(format!(".{name}.tmp"));
    fs::write(&tmp, data)?;
    fs::rename(&tmp, dir.join(name))?;
    Ok(())
}

/// tab 文件夹里的数据文件(跳过隐藏文件与临时文件)
fn data_files(dir: &Path) -> Result<Vec<String>> {
    let mut out = vec![];
    for e in fs::read_dir(dir)? {
        let e = e?;
        if !e.file_type()?.is_file() {
            continue;
        }
        if let Some(n) = e.file_name().to_str()
            && !n.starts_with('.')
        {
            out.push(n.to_string());
        }
    }
    Ok(out)
}

pub(crate) fn is_encrypted_dir(dir: &Path) -> bool {
    dir.join(format!("tab.json{AGE}")).exists()
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
        Ok(Self { root, key: None })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// 设置本机的文件钥匙(解开主密钥后得到)。
    pub fn set_key(&mut self, key: Option<FileKey>) {
        self.key = key;
    }

    pub fn has_key(&self) -> bool {
        self.key.is_some()
    }

    fn key(&self) -> Result<&FileKey> {
        self.key.as_ref().ok_or(Error::Locked)
    }

    pub(crate) fn tab_dir(&self, tab: &str) -> Result<PathBuf> {
        check_name(tab)?;
        Ok(self.root.join("tabs").join(tab))
    }

    /// 读取逻辑文件:有 `.age` 版本就解密;都不存在返回 None。
    pub(crate) fn read_logical(&self, dir: &Path, name: &str) -> Result<Option<Vec<u8>>> {
        match fs::read(dir.join(format!("{name}{AGE}"))) {
            Ok(c) => return Ok(Some(self.key()?.decrypt(&c)?)),
            Err(e) if not_found(&e) => {}
            Err(e) => return Err(e.into()),
        }
        match fs::read(dir.join(name)) {
            Ok(b) => Ok(Some(b)),
            Err(e) if not_found(&e) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// 写入逻辑文件:按 tab 是否加密写明文或密文,并删掉另一种版本。明文没变时不写盘,返回 false。
    pub(crate) fn write_logical(&self, dir: &Path, name: &str, data: &[u8]) -> Result<bool> {
        fs::create_dir_all(dir)?;
        let enc = is_encrypted_dir(dir);
        let (target, other) = if enc {
            (format!("{name}{AGE}"), name.to_string())
        } else {
            (name.to_string(), format!("{name}{AGE}"))
        };
        let other_exists = dir.join(&other).exists();
        if !other_exists && self.read_logical(dir, name)?.as_deref() == Some(data) {
            return Ok(false);
        }
        let bytes = if enc {
            self.key()?.encrypt(data)?
        } else {
            data.to_vec()
        };
        write_atomic(dir, &target, &bytes)?;
        remove_if_exists(&dir.join(other))?;
        Ok(true)
    }

    pub(crate) fn remove_logical(&self, dir: &Path, name: &str) -> Result<()> {
        remove_if_exists(&dir.join(name))?;
        remove_if_exists(&dir.join(format!("{name}{AGE}")))
    }

    /// 按排序键顺序列出一个 tab 的块。图块只给出位置(kind = "draw",text 为空),
    /// 内容用 `load_drawing` 读取。加密 tab 在本机没有钥匙时返回 `Error::Locked`。
    pub fn list_blocks(&self, tab: &str) -> Result<Vec<Block>> {
        let dir = self.tab_dir(tab)?;
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut out = vec![];
        for name in data_files(&dir)? {
            let logical = name.strip_suffix(AGE).unwrap_or(&name);
            let (stem, draw) = match (
                logical.strip_suffix(".md"),
                logical.strip_suffix(".excalidraw"),
            ) {
                (Some(s), _) => (s, false),
                (_, Some(s)) => (s, true),
                _ => continue,
            };
            let Some((key, id)) = stem.split_once('~') else {
                continue;
            };
            if out.iter().any(|b: &Block| b.id == id) {
                continue; // 同时存在明文与密文版本时只取一次
            }
            if draw {
                if is_encrypted_dir(&dir) {
                    self.key()?; // 与文本块一致:没有钥匙时报 Locked
                }
                out.push(Block {
                    kind: "draw".into(),
                    ..Block::text(id, key, "")
                });
                continue;
            }
            let bytes = self.read_logical(&dir, logical)?.unwrap_or_default();
            out.push(Block::text(id, key, &String::from_utf8_lossy(&bytes)));
        }
        out.sort_by(|a, b| a.key.cmp(&b.key).then(a.id.cmp(&b.id)));
        Ok(out)
    }

    /// 写入一个文本块。明文没有变化时不写盘,返回 false。
    pub fn save_block(&self, tab: &str, block: &Block) -> Result<bool> {
        check_name(&block.id)?;
        check_name(&block.key)?;
        let dir = self.tab_dir(tab)?;
        self.write_logical(
            &dir,
            &format!("{}~{}.md", block.key, block.id),
            block.text.as_bytes(),
        )
    }

    /// 删除一个块(文本或图块,明文与密文版本都删)。文件不存在时不报错。
    pub fn delete_block(&self, tab: &str, id: &str, key: &str) -> Result<()> {
        check_name(id)?;
        check_name(key)?;
        let dir = self.tab_dir(tab)?;
        self.remove_logical(&dir, &format!("{key}~{id}.md"))?;
        for ext in DRAW_EXTS {
            self.remove_logical(&dir, &format!("{key}~{id}{ext}"))?;
        }
        Ok(())
    }

    pub fn load_drawing(&self, tab: &str, id: &str, key: &str) -> Result<Option<Drawing>> {
        check_name(id)?;
        check_name(key)?;
        let dir = self.tab_dir(tab)?;
        let Some(scene) = self.read_logical(&dir, &format!("{key}~{id}.excalidraw"))? else {
            return Ok(None);
        };
        let svg = self
            .read_logical(&dir, &format!("{key}~{id}.svg"))?
            .unwrap_or_default();
        Ok(Some(Drawing {
            scene: String::from_utf8_lossy(&scene).into_owned(),
            svg: String::from_utf8_lossy(&svg).into_owned(),
        }))
    }

    pub fn save_drawing(&self, tab: &str, id: &str, key: &str, d: &Drawing) -> Result<bool> {
        check_name(id)?;
        check_name(key)?;
        let dir = self.tab_dir(tab)?;
        let a = self.write_logical(&dir, &format!("{key}~{id}.excalidraw"), d.scene.as_bytes())?;
        let b = self.write_logical(&dir, &format!("{key}~{id}.svg"), d.svg.as_bytes())?;
        Ok(a || b)
    }

    /// 打开或关闭一个 tab 的加密:把文件夹里的所有数据文件转成密文或明文。
    pub fn set_tab_encrypted(&self, tab: &str, on: bool) -> Result<()> {
        let key = self.key()?;
        let dir = self.tab_dir(tab)?;
        for name in data_files(&dir)? {
            match (on, name.strip_suffix(AGE)) {
                (true, None) => {
                    let plain = fs::read(dir.join(&name))?;
                    write_atomic(&dir, &format!("{name}{AGE}"), &key.encrypt(&plain)?)?;
                    remove_if_exists(&dir.join(&name))?;
                }
                (false, Some(logical)) => {
                    let plain = key.decrypt(&fs::read(dir.join(&name))?)?;
                    write_atomic(&dir, logical, &plain)?;
                    remove_if_exists(&dir.join(&name))?;
                }
                _ => {}
            }
        }
        Ok(())
    }

    /// 同步之后调用:加密 tab 里如果混进了明文文件(例如另一台设备在开启加密前的修改被合并进来),
    /// 就把它们加密掉。本机没有钥匙时什么都不做。返回被加密的 tab。
    pub fn enforce_encryption(&self) -> Result<Vec<String>> {
        let mut fixed = vec![];
        if self.key.is_none() {
            return Ok(fixed);
        }
        for e in fs::read_dir(self.root.join("tabs"))? {
            let e = e?;
            let Some(id) = e.file_name().to_str().map(String::from) else {
                continue;
            };
            if check_name(&id).is_err() || !e.file_type()?.is_dir() || !is_encrypted_dir(&e.path())
            {
                continue;
            }
            if data_files(&e.path())?.iter().any(|n| !n.ends_with(AGE)) {
                self.set_tab_encrypted(&id, true)?;
                fixed.push(id);
            }
        }
        Ok(fixed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(id: &str, key: &str, text: &str) -> Block {
        Block::text(id, key, text)
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
    fn delete_removes_file_and_is_idempotent() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.save_block("work", &b("b1", "a0", "x")).unwrap();
        s.delete_block("work", "b1", "a0").unwrap();
        s.delete_block("work", "b1", "a0").unwrap();
        assert!(s.list_blocks("work").unwrap().is_empty());
    }

    #[test]
    fn drawings_roundtrip_list_and_delete() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.save_block("t1", &b("b1", "a0", "text")).unwrap();
        let dr = Drawing {
            scene: r#"{"elements":[]}"#.into(),
            svg: "<svg/>".into(),
        };
        assert!(s.save_drawing("t1", "d1", "a1", &dr).unwrap());
        assert!(!s.save_drawing("t1", "d1", "a1", &dr).unwrap());
        let kinds: Vec<_> = s
            .list_blocks("t1")
            .unwrap()
            .into_iter()
            .map(|b| (b.id, b.kind))
            .collect();
        assert_eq!(
            kinds,
            vec![("b1".into(), "text".into()), ("d1".into(), "draw".into())]
        );
        assert_eq!(s.load_drawing("t1", "d1", "a1").unwrap(), Some(dr));
        s.delete_block("t1", "d1", "a1").unwrap();
        assert_eq!(s.list_blocks("t1").unwrap().len(), 1);
        assert!(!d.path().join("tabs/t1/a1~d1.svg").exists());
    }

    fn keyed(d: &Path) -> Store {
        let mut s = Store::open(d).unwrap();
        s.set_key(Some(FileKey::generate()));
        s
    }

    fn files(d: &Path, tab: &str) -> Vec<String> {
        let mut v = data_files(&d.join("tabs").join(tab)).unwrap();
        v.sort();
        v
    }

    #[test]
    fn encrypting_a_tab_converts_every_file_and_reads_back() {
        let d = tempfile::tempdir().unwrap();
        let s = keyed(d.path());
        s.save_tab(&TabMeta::new("t1", "密钥", "钥", "a0")).unwrap();
        s.save_block("t1", &b("b1", "a0", "GITHUB_TOKEN=ghp_xxx"))
            .unwrap();
        s.set_tab_encrypted("t1", true).unwrap();
        assert_eq!(files(d.path(), "t1"), vec!["a0~b1.md.age", "tab.json.age"]);
        let raw = fs::read(d.path().join("tabs/t1/a0~b1.md.age")).unwrap();
        assert!(!raw.windows(6).any(|w| w == b"GITHUB"));
        assert_eq!(s.list_blocks("t1").unwrap()[0].text, "GITHUB_TOKEN=ghp_xxx");
        // 新写入的块也直接是密文
        s.save_block("t1", &b("b2", "a1", "new")).unwrap();
        assert!(d.path().join("tabs/t1/a1~b2.md.age").exists());
        // 明文没变时不重写(密文每次都不同,避免无谓的提交)
        assert!(!s.save_block("t1", &b("b2", "a1", "new")).unwrap());
        // 关闭加密还原成明文
        s.set_tab_encrypted("t1", false).unwrap();
        assert_eq!(
            files(d.path(), "t1"),
            vec!["a0~b1.md", "a1~b2.md", "tab.json"]
        );
    }

    #[test]
    fn drawings_in_encrypted_tab_are_ciphertext_and_locked_without_key() {
        let d = tempfile::tempdir().unwrap();
        let s = keyed(d.path());
        s.save_tab(&TabMeta::new("t1", "密钥", "钥", "a0")).unwrap();
        let dr = Drawing {
            scene: r#"{"elements":[{"text":"SECRET"}]}"#.into(),
            svg: "<svg>SECRET</svg>".into(),
        };
        s.save_drawing("t1", "d1", "a0", &dr).unwrap();
        s.set_tab_encrypted("t1", true).unwrap();
        assert_eq!(
            files(d.path(), "t1"),
            vec!["a0~d1.excalidraw.age", "a0~d1.svg.age", "tab.json.age"]
        );
        for f in ["a0~d1.excalidraw.age", "a0~d1.svg.age"] {
            let raw = fs::read(d.path().join("tabs/t1").join(f)).unwrap();
            assert!(!raw.windows(6).any(|w| w == b"SECRET"));
        }
        assert_eq!(s.list_blocks("t1").unwrap()[0].kind, "draw");
        assert_eq!(s.load_drawing("t1", "d1", "a0").unwrap(), Some(dr));
        let other = Store::open(d.path()).unwrap();
        assert!(matches!(other.list_blocks("t1"), Err(Error::Locked)));
        assert!(matches!(
            other.load_drawing("t1", "d1", "a0"),
            Err(Error::Locked)
        ));
    }

    #[test]
    fn tab_encrypted_with_another_key_is_locked_not_an_error() {
        let d = tempfile::tempdir().unwrap();
        let s = keyed(d.path());
        s.save_tab(&TabMeta::new("t1", "密钥", "钥", "a0")).unwrap();
        s.save_block("t1", &b("b1", "a0", "x")).unwrap();
        s.set_tab_encrypted("t1", true).unwrap();
        s.save_tab(&TabMeta::new("t2", "明文", "明", "a1")).unwrap();
        let mut other = Store::open(d.path()).unwrap();
        other.set_key(Some(FileKey::generate()));
        // 整个列表照常读出,只有那个 tab 显示为锁定
        let tabs = other.list_tabs().unwrap();
        assert_eq!(tabs.len(), 2);
        let t = tabs.iter().find(|t| t.id == "t1").unwrap();
        assert!(t.encrypted && t.locked && t.name.is_empty());
        assert!(matches!(other.list_blocks("t1"), Err(Error::KeyMismatch)));
    }

    #[test]
    fn encrypted_tab_is_locked_without_key() {
        let d = tempfile::tempdir().unwrap();
        let s = keyed(d.path());
        s.save_tab(&TabMeta::new("t1", "密钥", "钥", "a0")).unwrap();
        s.save_block("t1", &b("b1", "a0", "x")).unwrap();
        s.set_tab_encrypted("t1", true).unwrap();
        let other = Store::open(d.path()).unwrap();
        assert!(matches!(other.list_blocks("t1"), Err(Error::Locked)));
        let t = &other.list_tabs().unwrap()[0];
        assert!(t.encrypted && t.locked && t.name.is_empty());
    }

    #[test]
    fn enforce_encryption_encrypts_stray_plain_files() {
        let d = tempfile::tempdir().unwrap();
        let s = keyed(d.path());
        s.save_tab(&TabMeta::new("t1", "密钥", "钥", "a0")).unwrap();
        s.set_tab_encrypted("t1", true).unwrap();
        fs::write(d.path().join("tabs/t1/a5~zz.md"), "merged plaintext").unwrap();
        assert_eq!(s.enforce_encryption().unwrap(), vec!["t1"]);
        assert_eq!(files(d.path(), "t1"), vec!["a5~zz.md.age", "tab.json.age"]);
    }

    #[test]
    fn rejects_path_traversal() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        assert!(s.list_blocks("../etc").is_err());
        assert!(s.save_block("work", &b("../x", "a0", "")).is_err());
    }
}
