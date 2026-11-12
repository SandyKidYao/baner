use super::*;
use std::collections::VecDeque;
use std::sync::Mutex;

/// 按顺序回放预设回复,并记下请求过的地址。
#[derive(Default)]
struct Fake {
    replies: Mutex<VecDeque<(u16, String)>>,
    urls: Mutex<Vec<String>>,
}

impl Fake {
    fn new(replies: &[(u16, &str)]) -> Self {
        Self {
            replies: Mutex::new(replies.iter().map(|(s, b)| (*s, b.to_string())).collect()),
            urls: Mutex::default(),
        }
    }
    fn next(&self, url: &str) -> Result<(u16, String)> {
        self.urls.lock().unwrap().push(url.to_string());
        Ok(self
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .expect("no reply left"))
    }
    fn urls(&self) -> Vec<String> {
        self.urls.lock().unwrap().clone()
    }
}

impl Transport for Fake {
    fn post_form(&self, url: &str, _form: &[(&str, &str)]) -> Result<(u16, String)> {
        self.next(url)
    }
    fn get(&self, url: &str, _token: &Token) -> Result<(u16, String)> {
        self.next(url)
    }
}

#[test]
fn start_login_reads_code() {
    let t = Fake::new(&[(
        200,
        r#"{"device_code":"dc","user_code":"WDJB-MJHT","verification_uri":"https://github.com/login/device","expires_in":899,"interval":5}"#,
    )]);
    let c = start_login(&t).unwrap();
    assert_eq!(c.user_code, "WDJB-MJHT");
    assert_eq!(c.interval, 5);
    assert_eq!(t.urls(), ["https://github.com/login/device/code"]);
}

#[test]
fn start_login_reports_disabled_device_flow() {
    let t = Fake::new(&[(400, r#"{"error":"device_flow_disabled"}"#)]);
    let e = start_login(&t).unwrap_err().to_string();
    assert!(e.contains("device_flow_disabled"), "{e}");
}

#[test]
fn start_login_rejects_foreign_verification_uri() {
    let t = Fake::new(&[(
        200,
        r#"{"device_code":"dc","user_code":"X","verification_uri":"https://evil.example/","expires_in":9,"interval":5}"#,
    )]);
    assert!(start_login(&t).is_err());
}

#[test]
fn poll_states() {
    assert_eq!(
        parse_poll(r#"{"error":"authorization_pending"}"#).unwrap(),
        Poll::Pending
    );
    assert_eq!(
        parse_poll(r#"{"error":"slow_down","interval":10}"#).unwrap(),
        Poll::SlowDown(10)
    );
    assert_eq!(
        parse_poll(r#"{"error":"expired_token"}"#).unwrap(),
        Poll::Expired
    );
    assert_eq!(
        parse_poll(r#"{"error":"access_denied"}"#).unwrap(),
        Poll::Denied
    );
    assert_eq!(
        parse_poll(r#"{"access_token":"ghu_x","token_type":"bearer","scope":""}"#).unwrap(),
        Poll::Done(Token::new("ghu_x"))
    );
    assert!(parse_poll(r#"{"error":"incorrect_device_code"}"#).is_err());
}

#[test]
fn token_never_shows_in_debug_output() {
    let p = Poll::Done(Token::new("ghu_secret"));
    assert!(!format!("{p:?}").contains("ghu_secret"));
}

#[test]
fn lists_repos_across_installations_and_pages_newest_first() {
    let page1: Vec<String> = (0..100)
        .map(|i| {
            format!(
                r#"{{"full_name":"me/r{i:03}","private":true,"pushed_at":"2026-01-01T00:00:00Z"}}"#
            )
        })
        .collect();
    let page1 = format!(
        r#"{{"total_count":101,"repositories":[{}]}}"#,
        page1.join(",")
    );
    let t = Fake::new(&[
        (200, r#"{"installations":[{"id":1},{"id":2}]}"#),
        (200, &page1),
        (
            200,
            r#"{"total_count":101,"repositories":[{"full_name":"me/notes","private":true,"pushed_at":"2026-11-01T00:00:00Z"}]}"#,
        ),
        (
            200,
            r#"{"total_count":1,"repositories":[{"full_name":"org/x","private":false,"pushed_at":null}]}"#,
        ),
    ]);
    let l = list_repos(&t, &Token::new("t")).unwrap();
    assert!(l.installed);
    assert_eq!(l.repos.len(), 102);
    assert_eq!(l.repos[0].full_name, "me/notes");
    assert_eq!(l.repos.last().unwrap().full_name, "org/x");
    let urls = t.urls();
    assert!(urls[2].ends_with("/user/installations/1/repositories?per_page=100&page=2"));
    assert!(urls[3].contains("/user/installations/2/"));
}

#[test]
fn no_installation_means_not_installed() {
    let t = Fake::new(&[(200, r#"{"total_count":0,"installations":[]}"#)]);
    assert_eq!(
        list_repos(&t, &Token::new("t")).unwrap(),
        RepoList::default()
    );
}

#[test]
fn expired_token_is_reported_as_unauthorized() {
    let t = Fake::new(&[(401, r#"{"message":"Bad credentials"}"#)]);
    let e = current_user(&t, &Token::new("t")).unwrap_err().to_string();
    assert!(e.contains("unauthorized"), "{e}");
}

#[test]
fn remote_url_validates_name() {
    assert_eq!(
        remote_url("me/baner-notes").unwrap(),
        "https://github.com/me/baner-notes.git"
    );
    assert_eq!(
        remote_url("Me-2/notes.v2_x").unwrap(),
        "https://github.com/Me-2/notes.v2_x.git"
    );
    for bad in [
        "me", "me/", "/x", "me/../x", "me/x?y", "me/x/y", "me x/y", "me/.git",
    ] {
        assert!(remote_url(bad).is_err(), "{bad}");
    }
}

#[test]
fn noreply_email() {
    let u = User {
        login: "octo".into(),
        id: 42,
    };
    assert_eq!(u.noreply_email(), "42+octo@users.noreply.github.com");
}

/// 真实网络:向 GitHub 申请验证码(不需要授权)。手动运行:
/// `cargo test -p baner-core real_device_code -- --ignored`
#[test]
#[ignore]
fn real_device_code() {
    let c = start_login(&Https::default()).unwrap();
    assert_eq!(c.user_code.len(), 9, "{}", c.user_code);
    assert!(c.interval > 0);
}
