//! git 同步(ADR-0003)。流程:提交本地改动 → fetch → 合并 → 只检出变化的文件 → push。
//!
//! 冲突规则:
//! - `.md` 文本块:三方合并;同一行冲突时,把冲突标记写进文件。
//! - 其他文件(tab.json、.age 密文、图块 JSON 等):无法按行合并,保留提交时间较新的一边。
//! - 一边修改、一边删除:保留修改的一边,不丢内容。
//! - `.baner/identity.age`(包裹文件钥匙)两边不同:本机没用自己的钥匙加密过内容时改用仓库里的,
//!   并通知调用方清掉本机钥匙;否则停止同步,绝不覆盖仓库里的钥匙。

use crate::{Error, Result, crypto};
use git2::{
    Commit, Cred, FetchOptions, Index, IndexEntry, MergeOptions, Oid, PushOptions, RemoteCallbacks,
    Repository, Signature, Tree, build::CheckoutBuilder,
};
use serde::Serialize;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

pub const BRANCH: &str = "main";
const REMOTE: &str = "origin";

impl From<git2::Error> for Error {
    fn from(e: git2::Error) -> Self {
        Error::Git(e.message().to_string())
    }
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Detect {
    pub is_repo: bool,
    pub remote_url: Option<String>,
    pub has_commits: bool,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    /// 本地是否产生了新提交
    pub committed: bool,
    /// 合并或快进后,内容发生变化的 tab id
    pub changed_tabs: Vec<String>,
    /// 写入了冲突标记的文本块路径(相对数据目录)
    pub conflicts: Vec<String>,
    pub pushed: bool,
    /// 本机的 identity.age 被仓库里的取代:调用方要清掉本机的文件钥匙,让用户重新输入主密钥
    pub key_reset: bool,
}

/// 访问远端的身份。
pub struct Credentials {
    pub username: Option<String>,
    pub token: Option<String>,
    /// 提交作者;为空时用「Baner」
    pub author: Option<Author>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Author {
    pub name: String,
    pub email: String,
}

pub fn detect(dir: &Path) -> Detect {
    match Repository::open(dir) {
        Ok(repo) => Detect {
            is_repo: true,
            remote_url: repo
                .find_remote(REMOTE)
                .ok()
                .and_then(|r| r.url().ok().map(String::from)),
            has_commits: repo.head().is_ok(),
        },
        Err(_) => Detect::default(),
    }
}

fn open_or_init(dir: &Path) -> Result<Repository> {
    match Repository::open(dir) {
        Ok(r) => Ok(r),
        Err(_) => {
            let mut opts = git2::RepositoryInitOptions::new();
            opts.initial_head(BRANCH);
            Ok(Repository::init_opts(dir, &opts)?)
        }
    }
}

/// 设定远端地址(首次会初始化仓库)。
pub fn configure(dir: &Path, url: &str) -> Result<()> {
    let repo = open_or_init(dir)?;
    if repo.find_remote(REMOTE).is_ok() {
        repo.remote_set_url(REMOTE, url)?;
    } else {
        repo.remote(REMOTE, url)?;
    }
    Ok(())
}

/// 从远端取来仓库里的 identity.age(没有就返回 None)。只 fetch,不改工作区和本地分支。
pub fn fetch_identity(dir: &Path, creds: &Credentials) -> Result<Option<Vec<u8>>> {
    let repo = open_or_init(dir)?;
    if repo.find_remote(REMOTE).is_err() {
        return Ok(None);
    }
    let Some(id) = fetch(&repo, creds)? else {
        return Ok(None);
    };
    let tree = repo.find_commit(id)?.tree()?;
    match tree.get_path(Path::new(crypto::IDENTITY_FILE)) {
        Ok(e) => Ok(Some(repo.find_blob(e.id())?.content().to_vec())),
        Err(_) => Ok(None),
    }
}

fn identity_id(tree: &Tree) -> Option<Oid> {
    tree.get_path(Path::new(crypto::IDENTITY_FILE))
        .ok()
        .map(|e| e.id())
}

/// 两边的 identity.age 都在且不同时:本机树里没有任何密文就可以改用仓库里的(返回 true),
/// 否则返回 `IdentityConflict`。
fn check_identity(ours: &Tree, theirs: &Tree) -> Result<bool> {
    match (identity_id(ours), identity_id(theirs)) {
        (Some(o), Some(t)) if o != t => {
            let mut has_cipher = false;
            // 找到一个就中止遍历;中止时 walk 返回错误,忽略即可
            let _ = ours.walk(git2::TreeWalkMode::PreOrder, |root, e| {
                if root.starts_with("tabs/") && e.name().is_ok_and(|n| n.ends_with(".age")) {
                    has_cipher = true;
                    return git2::TreeWalkResult::Abort;
                }
                git2::TreeWalkResult::Ok
            });
            if has_cipher {
                Err(Error::IdentityConflict)
            } else {
                Ok(true)
            }
        }
        _ => Ok(false),
    }
}

/// 把不同步的 tab 写进 .git/info/exclude(只对本机生效),并把它们移出索引。
fn apply_exclusions(repo: &Repository, unsynced: &[String]) -> Result<()> {
    let git_dir = repo.path();
    fs::create_dir_all(git_dir.join("info"))?;
    let mut body = String::from("# 由 Baner 维护:本机不同步的 tab\n");
    for id in unsynced {
        crate::storage::check_name(id)?;
        body.push_str(&format!("/tabs/{id}/\n"));
    }
    fs::write(git_dir.join("info/exclude"), body)?;
    let mut index = repo.index()?;
    for id in unsynced {
        index.remove_dir(&Path::new("tabs").join(id), 0)?;
    }
    index.write()?;
    Ok(())
}

fn signature(author: Option<&Author>) -> Result<Signature<'static>> {
    Ok(match author {
        Some(a) => Signature::now(&a.name, &a.email)?,
        None => Signature::now("Baner", "baner@localhost")?,
    })
}

fn branch_ref() -> String {
    format!("refs/heads/{BRANCH}")
}

/// 暂存所有改动(含删除),有变化就提交。返回是否产生了提交。
fn commit_local(repo: &Repository, author: Option<&Author>) -> Result<bool> {
    let mut index = repo.index()?;
    index.add_all(["."], git2::IndexAddOption::DEFAULT, None)?;
    index.update_all(["."], None)?;
    index.write()?;
    let tree_id = index.write_tree()?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    if parent.as_ref().is_some_and(|p| p.tree_id() == tree_id) {
        return Ok(false);
    }
    if parent.is_none() && repo.find_tree(tree_id)?.is_empty() {
        return Ok(false);
    }
    let tree = repo.find_tree(tree_id)?;
    let sig = signature(author)?;
    let parents: Vec<&Commit> = parent.iter().collect();
    repo.commit(
        Some(&branch_ref()),
        &sig,
        &sig,
        "baner: 同步",
        &tree,
        &parents,
    )?;
    Ok(true)
}

fn callbacks(creds: &Credentials) -> RemoteCallbacks<'_> {
    let mut cb = RemoteCallbacks::new();
    cb.credentials(move |_url, user_from_url, _allowed| match &creds.token {
        Some(token) => {
            let user = creds
                .username
                .as_deref()
                .filter(|u| !u.is_empty())
                .or(user_from_url)
                .unwrap_or("git");
            Cred::userpass_plaintext(user, token)
        }
        None => Cred::default(),
    });
    cb
}

fn fetch(repo: &Repository, creds: &Credentials) -> Result<Option<Oid>> {
    let mut remote = repo.find_remote(REMOTE)?;
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks(creds));
    remote.fetch(
        &[format!(
            "+refs/heads/{BRANCH}:refs/remotes/{REMOTE}/{BRANCH}"
        )],
        Some(&mut fo),
        None,
    )?;
    Ok(repo
        .refname_to_id(&format!("refs/remotes/{REMOTE}/{BRANCH}"))
        .ok())
}

enum PushOutcome {
    Ok,
    Rejected,
}

fn push(repo: &Repository, creds: &Credentials) -> Result<PushOutcome> {
    let mut remote = repo.find_remote(REMOTE)?;
    let rejected = std::cell::Cell::new(false);
    {
        let mut cb = callbacks(creds);
        cb.push_update_reference(|_r, status| {
            if status.is_some() {
                rejected.set(true);
            }
            Ok(())
        });
        let mut po = PushOptions::new();
        po.remote_callbacks(cb);
        match remote.push(
            &[format!("{}:{}", branch_ref(), branch_ref())],
            Some(&mut po),
        ) {
            Ok(()) => {}
            // 部分服务端直接以错误返回 non-fast-forward
            Err(e) if e.code() == git2::ErrorCode::NotFastForward => {
                return Ok(PushOutcome::Rejected);
            }
            Err(e) => return Err(e.into()),
        }
    }
    Ok(if rejected.get() {
        PushOutcome::Rejected
    } else {
        PushOutcome::Ok
    })
}

fn entry_path(e: &IndexEntry) -> String {
    String::from_utf8_lossy(&e.path).into_owned()
}

fn conflict_markers(ours: &[u8], theirs: &[u8]) -> Vec<u8> {
    let mut v = "<<<<<<< 本机\n".as_bytes().to_vec();
    v.extend_from_slice(ours);
    if !ours.ends_with(b"\n") {
        v.push(b'\n');
    }
    v.extend_from_slice(b"=======\n");
    v.extend_from_slice(theirs);
    if !theirs.ends_with(b"\n") {
        v.push(b'\n');
    }
    v.extend_from_slice(">>>>>>> 远端\n".as_bytes());
    v
}

/// 解决合并索引里的冲突,返回写入了冲突标记的路径。
fn resolve_conflicts(
    repo: &Repository,
    index: &mut Index,
    ours_newer: bool,
) -> Result<Vec<String>> {
    let mut marked = vec![];
    let conflicts: Vec<_> = index.conflicts()?.collect::<std::result::Result<_, _>>()?;
    for c in conflicts {
        let path = c
            .our
            .as_ref()
            .or(c.their.as_ref())
            .or(c.ancestor.as_ref())
            .map(entry_path)
            .unwrap_or_default();
        let resolved: Option<IndexEntry> = match (c.our, c.their) {
            // 走到这里时 check_identity 已确认可以改用仓库里的钥匙
            (Some(_), Some(t)) if path == crypto::IDENTITY_FILE => Some(t),
            (Some(o), Some(t)) if path.ends_with(".md") => {
                let content = match &c.ancestor {
                    Some(a) => {
                        let mut opts = git2::MergeFileOptions::new();
                        opts.our_label("本机").their_label("远端");
                        repo.merge_file_from_index(a, &o, &t, Some(&mut opts))?
                            .content()
                            .to_vec()
                    }
                    None => conflict_markers(
                        repo.find_blob(o.id)?.content(),
                        repo.find_blob(t.id)?.content(),
                    ),
                };
                let id = repo.blob(&content)?;
                marked.push(path.clone());
                Some(IndexEntry {
                    id,
                    file_size: content.len() as u32,
                    ..o
                })
            }
            (Some(o), Some(t)) => Some(if ours_newer { o } else { t }),
            (Some(o), None) => Some(o),
            (None, Some(t)) => Some(t),
            (None, None) => None,
        };
        index.conflict_remove(Path::new(&path))?;
        if let Some(mut e) = resolved {
            e.flags &= !0x3000; // 清除冲突阶段位,写成 stage 0
            index.add(&e)?;
        }
    }
    Ok(marked)
}

fn diff_paths(repo: &Repository, old: Option<&Tree>, new: &Tree) -> Result<Vec<PathBuf>> {
    let diff = repo.diff_tree_to_tree(old, Some(new), None)?;
    let mut out = BTreeSet::new();
    for d in diff.deltas() {
        for f in [d.old_file(), d.new_file()] {
            if let Some(p) = f.path() {
                out.insert(p.to_path_buf());
            }
        }
    }
    Ok(out.into_iter().collect())
}

fn tabs_of(paths: &[PathBuf]) -> Vec<String> {
    let mut tabs = BTreeSet::new();
    for p in paths {
        let mut it = p.components();
        if it.next().is_some_and(|c| c.as_os_str() == "tabs")
            && let Some(id) = it.next()
        {
            tabs.insert(id.as_os_str().to_string_lossy().into_owned());
        }
    }
    tabs.into_iter().collect()
}

/// 把 HEAD 从 old 移到 new:只检出变化的文件,同步索引,返回变化的 tab。
fn move_to(repo: &Repository, old: &Tree, new: &Tree) -> Result<Vec<String>> {
    let paths = diff_paths(repo, Some(old), new)?;
    if !paths.is_empty() {
        let mut co = CheckoutBuilder::new();
        co.force().remove_untracked(false);
        for p in &paths {
            co.path(p);
        }
        repo.checkout_tree(new.as_object(), Some(&mut co))?;
    }
    let mut idx = repo.index()?;
    idx.read_tree(new)?;
    idx.write()?;
    Ok(tabs_of(&paths))
}

/// 完整同步一次。
pub fn sync(dir: &Path, unsynced: &[String], creds: &Credentials) -> Result<SyncReport> {
    let repo = open_or_init(dir)?;
    if repo.find_remote(REMOTE).is_err() {
        return Err(Error::Git("no remote configured".into()));
    }
    apply_exclusions(&repo, unsynced)?;
    let mut report = SyncReport {
        committed: commit_local(&repo, creds.author.as_ref())?,
        ..Default::default()
    };
    let mut changed = BTreeSet::new();

    // 推送被拒(期间别处又推了)时,重新合并再推,最多三次
    for _ in 0..3 {
        let theirs_id = fetch(&repo, creds)?;
        let ours = repo.head().ok().and_then(|h| h.peel_to_commit().ok());

        if let (Some(theirs_id), Some(ours)) = (theirs_id, ours.as_ref()) {
            let theirs = repo.find_commit(theirs_id)?;
            let base = repo.merge_base(ours.id(), theirs.id()).ok();
            if base == Some(theirs.id()) {
                // 本机领先:直接推送
            } else if base == Some(ours.id()) {
                // 快进:本机没有新提交,不需要推送
                changed.extend(move_to(&repo, &ours.tree()?, &theirs.tree()?)?);
                repo.reference(&branch_ref(), theirs.id(), true, "baner: 快进")?;
                report.changed_tabs = changed.into_iter().collect();
                return Ok(report);
            } else {
                if check_identity(&ours.tree()?, &theirs.tree()?)? {
                    report.key_reset = true;
                }
                let mut opts = MergeOptions::new();
                opts.fail_on_conflict(false);
                let mut index = match base {
                    Some(_) => repo.merge_commits(ours, &theirs, Some(&opts))?,
                    None => {
                        // 两边历史不相关(例如第二台设备首次同步):以空树作为共同祖先
                        let empty = repo.find_tree(repo.treebuilder(None)?.write()?)?;
                        repo.merge_trees(&empty, &ours.tree()?, &theirs.tree()?, Some(&opts))?
                    }
                };
                if index.has_conflicts() {
                    let ours_newer = ours.time().seconds() >= theirs.time().seconds();
                    report
                        .conflicts
                        .extend(resolve_conflicts(&repo, &mut index, ours_newer)?);
                }
                let tree = repo.find_tree(index.write_tree_to(&repo)?)?;
                let sig = signature(creds.author.as_ref())?;
                repo.commit(
                    Some(&branch_ref()),
                    &sig,
                    &sig,
                    "baner: 合并",
                    &tree,
                    &[ours, &theirs],
                )?;
                changed.extend(move_to(&repo, &ours.tree()?, &tree)?);
            }
        } else if let (Some(theirs_id), None) = (theirs_id, ours.as_ref()) {
            // 本机还没有任何提交(空数据目录):直接采用远端
            let theirs = repo.find_commit(theirs_id)?;
            let empty = repo.find_tree(repo.treebuilder(None)?.write()?)?;
            changed.extend(move_to(&repo, &empty, &theirs.tree()?)?);
            repo.reference(&branch_ref(), theirs.id(), true, "baner: 首次同步")?;
            report.changed_tabs = changed.into_iter().collect();
            return Ok(report);
        } else if ours.is_none() {
            // 两边都是空的
            report.changed_tabs = changed.into_iter().collect();
            return Ok(report);
        }

        match push(&repo, creds)? {
            PushOutcome::Ok => {
                report.pushed = true;
                report.changed_tabs = changed.into_iter().collect();
                return Ok(report);
            }
            PushOutcome::Rejected => continue,
        }
    }
    Err(Error::Git("push rejected repeatedly".into()))
}

#[cfg(test)]
mod tests;
