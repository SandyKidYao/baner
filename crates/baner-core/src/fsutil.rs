//! 跨平台的文件小工具。

use std::path::Path;
use std::{fs, io};

/// 用 `tmp` 原子地替换 `dest`(先写临时文件再改名的最后一步)。
///
/// Windows 上目标文件被别的进程短暂打开(杀毒软件、搜索索引、同步盘)时,改名会报
/// 「拒绝访问」;稍等后重试几次(最多约 0.3 秒)。其他平台几乎不会走到重试。
pub fn replace(tmp: &Path, dest: &Path) -> io::Result<()> {
    const RETRIES: u32 = 5;
    let mut attempt = 0;
    loop {
        match fs::rename(tmp, dest) {
            Err(e) if attempt < RETRIES && e.kind() == io::ErrorKind::PermissionDenied => {
                attempt += 1;
                std::thread::sleep(std::time::Duration::from_millis(20 * u64::from(attempt)));
            }
            r => return r,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_existing_file() {
        let d = tempfile::tempdir().unwrap();
        let (tmp, dest) = (d.path().join("a.tmp"), d.path().join("a"));
        fs::write(&dest, "old").unwrap();
        fs::write(&tmp, "new").unwrap();
        replace(&tmp, &dest).unwrap();
        assert_eq!(fs::read_to_string(&dest).unwrap(), "new");
        assert!(!tmp.exists());
    }
}
