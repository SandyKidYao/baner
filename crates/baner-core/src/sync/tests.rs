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
    author: None,
};

fn run(d: &Path) -> SyncReport {
    sync(d, &[], &NO).unwrap()
}
fn put(d: &Path, tab: &str, id: &str, text: &str) {
    Store::open(d)
        .unwrap()
        .save_block(tab, &Block::text(id, "a0", text))
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

/// 用户的 git 配置开了 autocrlf(Windows 上常见)时,同步下来的文件也必须逐字节不变:
/// 文本块不能变成 CRLF,没有 NUL 字节的密文不能被当成文本转换。
#[test]
fn line_endings_survive_autocrlf() {
    let e = env();
    let cipher: &[u8] = b"age-encryption.org/v1\n-> X25519 abc\n--- def\n\x01\x02\n";
    put(&e.a, "t1", "b1", "l1\nl2\n");
    // 只看字节,不走 Store 解密:放在另一个 tab 里
    fs::create_dir_all(e.a.join("tabs/t2")).unwrap();
    fs::write(e.a.join("tabs/t2/a1~b2.md.age"), cipher).unwrap();
    run(&e.a);
    let repo = Repository::open(&e.b).unwrap();
    repo.config()
        .unwrap()
        .set_bool("core.autocrlf", true)
        .unwrap();
    fs::write(repo.path().join("info/attributes"), "* text\n").unwrap();
    run(&e.b);
    assert_eq!(get(&e.b, "t1"), vec!["l1\nl2\n"]);
    assert_eq!(fs::read(e.b.join("tabs/t2/a1~b2.md.age")).unwrap(), cipher);
    let repo = Repository::open(&e.b).unwrap();
    assert!(!repo.config().unwrap().get_bool("core.autocrlf").unwrap());
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
    let t = |name: &str| TabMeta::new("t1", name, "", "a0");
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

#[test]
fn encrypted_tab_syncs_as_ciphertext_and_conflicts_keep_a_valid_version() {
    use crate::crypto::FileKey;
    let e = env();
    let key = FileKey::generate();
    let with_key = |d: &Path| {
        let mut s = Store::open(d).unwrap();
        s.set_key(Some(FileKey::parse(&key.export()).unwrap()));
        s
    };
    let a = with_key(&e.a);
    a.save_tab(&TabMeta::new("k1", "密钥", "钥", "a0")).unwrap();
    a.save_block("k1", &Block::text("b1", "a0", "TOKEN=1"))
        .unwrap();
    a.set_tab_encrypted("k1", true).unwrap();
    run(&e.a);

    // 仓库里只有密文
    let repo = Repository::open_bare(&e.remote).unwrap();
    let tree = repo
        .find_reference("refs/heads/main")
        .unwrap()
        .peel_to_tree()
        .unwrap();
    let mut names = vec![];
    tree.walk(git2::TreeWalkMode::PreOrder, |_, en| {
        names.push(en.name().unwrap_or("").to_string());
        git2::TreeWalkResult::Ok
    })
    .unwrap();
    assert!(names.iter().any(|n| n == "a0~b1.md.age") && !names.iter().any(|n| n == "a0~b1.md"));

    // 没有钥匙的设备:锁定
    run(&e.b);
    assert!(Store::open(&e.b).unwrap().list_tabs().unwrap()[0].locked);

    // 两边都改同一个加密块:保留其中一版,且仍可解密
    let b = with_key(&e.b);
    a.save_block("k1", &Block::text("b1", "a0", "TOKEN=from-a"))
        .unwrap();
    run(&e.a);
    b.save_block("k1", &Block::text("b1", "a0", "TOKEN=from-b"))
        .unwrap();
    let r = run(&e.b);
    assert!(r.conflicts.is_empty());
    let text = &b.list_blocks("k1").unwrap()[0].text;
    assert!(text == "TOKEN=from-a" || text == "TOKEN=from-b", "{text}");
}

#[test]
fn commits_use_the_given_author() {
    let e = env();
    put(&e.a, "t1", "b1", "hi");
    let creds = Credentials {
        username: None,
        token: None,
        author: Some(Author {
            name: "octo".into(),
            email: "42+octo@users.noreply.github.com".into(),
        }),
    };
    sync(&e.a, &[], &creds).unwrap();
    let repo = Repository::open_bare(&e.remote).unwrap();
    let c = repo
        .find_reference("refs/heads/main")
        .unwrap()
        .peel_to_commit()
        .unwrap();
    assert_eq!(c.author().name().unwrap(), "octo");
    assert_eq!(
        c.author().email().unwrap(),
        "42+octo@users.noreply.github.com"
    );
}

mod master_key {
    use super::*;
    use crate::crypto::{self, FileKey};

    const PASS: &str = "correct horse";

    fn identity(d: &Path) -> Vec<u8> {
        fs::read(d.join(crypto::IDENTITY_FILE)).unwrap()
    }
    fn remote_identity(e: &Env) -> Vec<u8> {
        let repo = Repository::open_bare(&e.remote).unwrap();
        let tree = repo
            .find_reference("refs/heads/main")
            .unwrap()
            .peel_to_tree()
            .unwrap();
        let id = tree
            .get_path(Path::new(crypto::IDENTITY_FILE))
            .unwrap()
            .id();
        repo.find_blob(id).unwrap().content().to_vec()
    }
    /// 设备 A:设主密钥、建一个加密 tab、同步
    fn device_a_with_secret(e: &Env) -> FileKey {
        let key = FileKey::generate();
        fs::create_dir_all(e.a.join(".baner")).unwrap();
        fs::write(
            e.a.join(crypto::IDENTITY_FILE),
            crypto::wrap(&key, PASS, Some(10)).unwrap(),
        )
        .unwrap();
        let mut s = Store::open(&e.a).unwrap();
        s.set_key(Some(FileKey::parse(&key.export()).unwrap()));
        s.save_tab(&TabMeta::new("k1", "秘密", "秘", "a0")).unwrap();
        s.save_block("k1", &Block::text("b1", "a0", "A 的秘密"))
            .unwrap();
        s.set_tab_encrypted("k1", true).unwrap();
        run(&e.a);
        key
    }

    #[test]
    fn fetch_identity_reads_the_repository_copy() {
        let e = env();
        assert_eq!(fetch_identity(&e.b, &NO).unwrap(), None); // 空仓库
        device_a_with_secret(&e);
        assert_eq!(fetch_identity(&e.b, &NO).unwrap(), Some(identity(&e.a)));
        assert!(!e.b.join(crypto::IDENTITY_FILE).exists()); // 只取来,不改工作区
    }

    /// 复现:新设备第一次同步前就设了主密钥(生成了另一把钥匙)
    #[test]
    fn unused_local_key_gives_way_to_the_repository_key() {
        let e = env();
        let ka = device_a_with_secret(&e);
        let before = remote_identity(&e);

        fs::create_dir_all(e.b.join(".baner")).unwrap();
        fs::write(
            e.b.join(crypto::IDENTITY_FILE),
            crypto::wrap(&FileKey::generate(), PASS, Some(10)).unwrap(),
        )
        .unwrap();
        put(&e.b, "t1", "b1", "B 的明文");
        let r = run(&e.b);
        assert!(r.key_reset && r.pushed);
        // 仓库里的钥匙没被覆盖,B 本机换成了仓库里那份,输入主密钥就能拿到 A 的钥匙
        assert_eq!(remote_identity(&e), before);
        assert_eq!(identity(&e.b), before);
        let kb = crypto::unwrap(&identity(&e.b), PASS).unwrap();
        assert_eq!(kb.export(), ka.export());
        let mut s = Store::open(&e.b).unwrap();
        s.set_key(Some(kb));
        assert_eq!(s.list_blocks("k1").unwrap()[0].text, "A 的秘密");
    }

    #[test]
    fn local_key_already_in_use_stops_the_sync_instead_of_overwriting() {
        let e = env();
        device_a_with_secret(&e);
        let before = remote_identity(&e);

        let kb = FileKey::generate();
        fs::create_dir_all(e.b.join(".baner")).unwrap();
        fs::write(
            e.b.join(crypto::IDENTITY_FILE),
            crypto::wrap(&kb, PASS, Some(10)).unwrap(),
        )
        .unwrap();
        let mut s = Store::open(&e.b).unwrap();
        s.set_key(Some(kb));
        s.save_tab(&TabMeta::new("k2", "B 的秘密", "B", "a1"))
            .unwrap();
        s.set_tab_encrypted("k2", true).unwrap();
        assert!(matches!(sync(&e.b, &[], &NO), Err(Error::IdentityConflict)));
        assert_eq!(remote_identity(&e), before);
    }

    #[test]
    fn same_key_on_both_sides_is_not_a_conflict() {
        let e = env();
        device_a_with_secret(&e);
        // B 用 crypto::setup 先取来仓库里的那份(修复后的流程)
        let remote = fetch_identity(&e.b, &NO).unwrap();
        crypto::setup(&e.b, PASS, remote).unwrap();
        put(&e.b, "t1", "b1", "B 的明文");
        let r = run(&e.b);
        assert!(!r.key_reset && r.pushed && r.conflicts.is_empty());
    }
}

/// 假的 HTTP git 远端:每个请求都回同一个状态行。返回仓库地址和收到的请求数。
fn fake_http_remote(
    status: &'static str,
) -> (String, std::sync::Arc<std::sync::atomic::AtomicUsize>) {
    use std::io::{Read, Write};
    use std::sync::atomic::Ordering;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/o/r.git", listener.local_addr().unwrap());
    let count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let n = count.clone();
    std::thread::spawn(move || {
        for conn in listener.incoming() {
            let Ok(mut s) = conn else { break };
            let mut req = vec![];
            let mut buf = [0u8; 1024];
            // 只有 GET 请求(没有正文),读到头部结束就回复
            while let Ok(k) = s.read(&mut buf) {
                if k == 0 {
                    break;
                }
                req.extend_from_slice(&buf[..k]);
                if req.windows(4).any(|w| w == b"\r\n\r\n") {
                    n.fetch_add(1, Ordering::SeqCst);
                    let _ = write!(
                        s,
                        "HTTP/1.1 {status}\r\nWWW-Authenticate: Basic realm=\"x\"\r\n\
                         Content-Length: 0\r\nConnection: close\r\n\r\n"
                    );
                    break;
                }
            }
        }
    });
    (url, count)
}

fn sync_against(url: &str) -> Result<SyncReport> {
    let tmp = tempfile::tempdir().unwrap();
    let d = tmp.path().join("a");
    Store::open(&d).unwrap();
    configure(&d, url).unwrap();
    put(&d, "t1", "b1", "hello");
    let creds = Credentials {
        username: Some("x-access-token".into()),
        token: Some("expired".into()),
        author: None,
    };
    sync(&d, &[], &creds)
}

#[test]
fn rejected_token_is_reported_as_auth_without_replaying() {
    let (url, requests) = fake_http_remote("401 Unauthorized");
    let err = sync_against(&url).unwrap_err();
    assert!(matches!(err, Error::AuthRejected), "{err}");
    // 第一次不带凭据,第二次带 token;被拒后不再拿同一个 token 重试
    assert_eq!(requests.load(std::sync::atomic::Ordering::SeqCst), 2);
}

#[test]
fn missing_repository_is_reported_as_repo() {
    let (url, _) = fake_http_remote("404 Not Found");
    let err = sync_against(&url).unwrap_err();
    assert!(matches!(err, Error::RepoUnavailable(_)), "{err}");
}

#[test]
fn unreachable_remote_is_reported_as_network() {
    // 拿一个空闲端口再关掉,连接会被拒绝
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let err = sync_against(&format!("http://127.0.0.1:{port}/o/r.git")).unwrap_err();
    assert!(matches!(err, Error::Network(_)), "{err}");
}
