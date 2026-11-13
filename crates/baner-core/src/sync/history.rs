//! 本机的同步记录(不进仓库):最近几十次同步的时间和结果,供设置面板显示。
//!
//! 定时拉取每几分钟一次,大多「没有变化」;连续的同类记录(都没变化,或同样的失败原因)
//! 合并成一条并计数,免得把有内容的记录挤掉。

use super::SyncReport;
use crate::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 最多保留的条数
pub const KEEP: usize = 50;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncEntry {
    /// 毫秒时间戳;合并的记录是最后一次的时间
    pub at: u64,
    /// 失败原因(核心层的错误信息,不含 token);成功时为空
    pub error: Option<String>,
    pub committed: bool,
    pub pushed: bool,
    /// 远端带来变化的 tab id
    pub changed_tabs: Vec<String>,
    /// 写入冲突标记的块数
    pub conflicts: usize,
    /// 合并了几次
    #[serde(default = "one")]
    pub count: u32,
}

fn one() -> u32 {
    1
}

impl SyncEntry {
    pub fn ok(at: u64, r: &SyncReport) -> Self {
        Self {
            at,
            error: None,
            committed: r.committed,
            pushed: r.pushed,
            changed_tabs: r.changed_tabs.clone(),
            conflicts: r.conflicts.len(),
            count: 1,
        }
    }

    pub fn failed(at: u64, error: impl ToString) -> Self {
        Self {
            at,
            error: Some(error.to_string()),
            committed: false,
            pushed: false,
            changed_tabs: Vec::new(),
            conflicts: 0,
            count: 1,
        }
    }

    /// 成功且什么都没发生
    pub fn is_noop(&self) -> bool {
        self.error.is_none()
            && !self.committed
            && !self.pushed
            && self.changed_tabs.is_empty()
            && self.conflicts == 0
    }

    /// 可以和上一条合并:都没变化,或失败原因相同
    fn same_kind(&self, other: &SyncEntry) -> bool {
        (self.is_noop() && other.is_noop()) || (self.error.is_some() && self.error == other.error)
    }
}

pub struct SyncHistory {
    path: PathBuf,
}

impl SyncHistory {
    pub fn new(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
        }
    }

    /// 新的在前。文件不存在或损坏时当作空(记录只是给人看的,不能影响同步)。
    pub fn list(&self) -> Vec<SyncEntry> {
        fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn record(&self, entry: SyncEntry) -> Result<()> {
        let mut list = self.list();
        match list.first_mut() {
            Some(last) if last.same_kind(&entry) => {
                last.at = entry.at;
                last.count += 1;
            }
            _ => list.insert(0, entry),
        }
        list.truncate(KEEP);
        if let Some(p) = self.path.parent() {
            fs::create_dir_all(p)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec(&list)?)?;
        fs::rename(tmp, &self.path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(committed: bool, pushed: bool, changed: &[&str]) -> SyncReport {
        SyncReport {
            committed,
            pushed,
            changed_tabs: changed.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    #[test]
    fn records_newest_first_and_merges_noops() {
        let dir = tempfile::tempdir().unwrap();
        let h = SyncHistory::new(dir.path().join("sync-log.json"));
        assert!(h.list().is_empty());

        h.record(SyncEntry::ok(1, &report(true, true, &[])))
            .unwrap();
        h.record(SyncEntry::ok(2, &report(false, false, &[])))
            .unwrap();
        h.record(SyncEntry::ok(3, &report(false, false, &[])))
            .unwrap();
        h.record(SyncEntry::ok(4, &report(false, false, &["t1"])))
            .unwrap();

        let list = h.list();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].changed_tabs, vec!["t1"]);
        // 两次「没有变化」合并成一条,时间是最后一次
        assert!(list[1].is_noop());
        assert_eq!((list[1].at, list[1].count), (3, 2));
        assert!(list[2].pushed);
    }

    #[test]
    fn merges_repeated_failures_only_with_the_same_reason() {
        let dir = tempfile::tempdir().unwrap();
        let h = SyncHistory::new(dir.path().join("sync-log.json"));
        h.record(SyncEntry::failed(1, "git: network")).unwrap();
        h.record(SyncEntry::failed(2, "git: network")).unwrap();
        h.record(SyncEntry::failed(3, "git: 401")).unwrap();
        let list = h.list();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].error.as_deref(), Some("git: 401"));
        assert_eq!(list[1].count, 2);
    }

    #[test]
    fn keeps_at_most_keep_entries() {
        let dir = tempfile::tempdir().unwrap();
        let h = SyncHistory::new(dir.path().join("sync-log.json"));
        for i in 0..(KEEP as u64 + 10) {
            h.record(SyncEntry::ok(i, &report(true, true, &[])))
                .unwrap();
        }
        let list = h.list();
        assert_eq!(list.len(), KEEP);
        assert_eq!(list[0].at, KEEP as u64 + 9);
    }

    #[test]
    fn corrupt_file_counts_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sync-log.json");
        fs::write(&path, "not json").unwrap();
        let h = SyncHistory::new(&path);
        assert!(h.list().is_empty());
        h.record(SyncEntry::failed(1, "x")).unwrap();
        assert_eq!(h.list().len(), 1);
    }
}
