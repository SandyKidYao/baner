use super::*;
use crate::storage::{Block, Store, TabMeta};

struct Env {
    _tmp: tempfile::TempDir,
    remote: PathBuf,
    a: PathBuf,
    b: PathBuf,
}

fn env() -> Env {
    let tmp = tempfile::tempdir().unwrap();
    let remote = tmp.path().join("remote.git");
    Repository::init_bare(&remote).unwrap();
    let (a, b) = (tmp.path().join("a"), tmp.path().join("b"));
    for d in [&a, &b] {
        Store::open(d).unwrap();
        configure(d, remote.to_str().unwrap()).unwrap();
    }
    Env {
        _tmp: tmp,
        remote,
        a,
        b,
    }
}

const NO: Credentials = Credentials {
    username: None,
    token: None,
};

fn run(d: &Path) -> SyncReport {
    sync(d, &[], &NO).unwrap()
}
fn put(d: &Path, tab: &str, id: &str, text: &str) {
    Store::open(d)
        .unwrap()
        .save_block(
            tab,
            &Block {
                id: id.into(),
                key: "a0".into(),
                text: text.into(),
            },
        )
        .unwrap();
}
fn get(d: &Path, tab: &str) -> Vec<String> {
    Store::open(d)
        .unwrap()
        .list_blocks(tab)
        .unwrap()
        .into_iter()
        .map(|b| b.text)
        .collect()
}

#[test]
fn detect_reports_repo_and_remote() {
    let e = env();
    let d = detect(&e.a);
    assert!(d.is_repo && !d.has_commits);
    assert_eq!(d.remote_url.as_deref(), e.remote.to_str());
    assert!(!detect(&e._tmp.path().join("nope")).is_repo);
}

#[test]
fn second_device_receives_first_devices_blocks() {
    let e = env();
    put(&e.a, "t1", "b1", "hello");
    let r = run(&e.a);
    assert!(r.committed && r.pushed);
    let r = run(&e.b);
    assert_eq!(r.changed_tabs, vec!["t1"]);
    assert_eq!(get(&e.b, "t1"), vec!["hello"]);
}

#[test]
fn edits_on_different_lines_merge_cleanly() {
    let e = env();
    put(&e.a, "t1", "b1", "l1\nl2\nl3\n");
    run(&e.a);
    run(&e.b);
    put(&e.a, "t1", "b1", "L1\nl2\nl3\n");
    run(&e.a);
    put(&e.b, "t1", "b1", "l1\nl2\nL3\n");
    let r = run(&e.b);
    assert!(r.conflicts.is_empty());
    assert_eq!(get(&e.b, "t1"), vec!["L1\nl2\nL3\n"]);
    run(&e.a);
    assert_eq!(get(&e.a, "t1"), vec!["L1\nl2\nL3\n"]);
}

#[test]
fn same_line_conflict_writes_markers_into_the_block() {
    let e = env();
    put(&e.a, "t1", "b1", "x\n");
    run(&e.a);
    run(&e.b);
    put(&e.a, "t1", "b1", "from a\n");
    run(&e.a);
    put(&e.b, "t1", "b1", "from b\n");
    let r = run(&e.b);
    assert_eq!(r.conflicts, vec!["tabs/t1/a0~b1.md"]);
    let text = &get(&e.b, "t1")[0];
    assert!(
        text.contains("<<<<<<< 本机") && text.contains("from b") && text.contains("from a"),
        "{text}"
    );
    // 冲突已作为普通内容提交,另一台设备也能看到
    run(&e.a);
    assert!(get(&e.a, "t1")[0].contains(">>>>>>> 远端"));
}

#[test]
fn json_conflict_keeps_one_side_intact() {
    let e = env();
    let t = |name: &str| TabMeta {
        id: "t1".into(),
        name: name.into(),
        glyph: "".into(),
        key: "a0".into(),
    };
    Store::open(&e.a).unwrap().save_tab(&t("工作")).unwrap();
    run(&e.a);
    run(&e.b);
    Store::open(&e.a).unwrap().save_tab(&t("甲")).unwrap();
    run(&e.a);
    Store::open(&e.b).unwrap().save_tab(&t("乙")).unwrap();
    let r = run(&e.b);
    assert!(r.conflicts.is_empty());
    let name = &Store::open(&e.b).unwrap().list_tabs().unwrap()[0].name;
    assert!(
        name == "甲" || name == "乙",
        "tab.json 必须仍是合法 JSON,得到 {name}"
    );
}

#[test]
fn modify_beats_delete() {
    let e = env();
    put(&e.a, "t1", "b1", "v1");
    run(&e.a);
    run(&e.b);
    Store::open(&e.a)
        .unwrap()
        .delete_block("t1", "b1", "a0")
        .unwrap();
    run(&e.a);
    put(&e.b, "t1", "b1", "v2 edited");
    run(&e.b);
    assert_eq!(get(&e.b, "t1"), vec!["v2 edited"]);
    run(&e.a);
    assert_eq!(get(&e.a, "t1"), vec!["v2 edited"]);
}

#[test]
fn unsynced_tab_never_leaves_the_device() {
    let e = env();
    put(&e.a, "local", "b1", "secret-ish");
    put(&e.a, "shared", "b2", "public");
    sync(&e.a, &["local".into()], &NO).unwrap();
    run(&e.b);
    assert!(get(&e.b, "local").is_empty());
    assert_eq!(get(&e.b, "shared"), vec!["public"]);
    assert_eq!(get(&e.a, "local"), vec!["secret-ish"]); // 本机文件仍在
}

#[test]
fn unrelated_histories_keep_both_sides() {
    let e = env();
    put(&e.a, "ta", "b1", "from a");
    run(&e.a);
    put(&e.b, "tb", "b2", "from b"); // b 在首次同步前已有自己的内容
    let r = run(&e.b);
    assert!(r.pushed);
    assert_eq!(get(&e.b, "ta"), vec!["from a"]);
    assert_eq!(get(&e.b, "tb"), vec!["from b"]);
    run(&e.a);
    assert_eq!(get(&e.a, "tb"), vec!["from b"]);
}

#[test]
fn second_sync_without_changes_is_a_noop() {
    let e = env();
    run(&e.a);
    let r = run(&e.a);
    assert!(!r.committed && r.changed_tabs.is_empty() && r.conflicts.is_empty());
}
