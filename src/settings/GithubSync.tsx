import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  githubLoginPoll,
  githubLoginStart,
  githubLogout,
  githubOpen,
  githubRepos,
  type LoginCode,
  type RepoList,
  type SyncStatus,
  syncUseRepo,
} from "../ipc";
import { CheckIcon, LockIcon, PlusIcon, SyncIcon } from "../rail/icons";
import { describeGithubError } from "../sync/errors";

interface Props {
  status: SyncStatus | null;
  /** 登录、选仓库、退出登录之后调用 */
  onChanged: (s: SyncStatus) => void;
}

/** https://github.com/owner/repo.git → owner/repo */
export function repoName(url: string | null): string | null {
  const m = url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(\.git)?$/);
  return m ? m[1] : null;
}

const Err = ({ msg }: { msg: string | null }) =>
  msg ? (
    <p className="err" role="alert">
      ✕ {msg}
    </p>
  ) : null;

/** 同步:用 GitHub 登录 → 选择仓库(ADR-0009)。 */
export function GithubSync({ status, onChanged }: Props) {
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!status) return null;

  const account = status.config.githubLogin;
  const loggedIn = status.hasToken && !!account;
  const repo = repoName(status.config.remoteUrl);

  const logout = async () => {
    setErr(null);
    try {
      onChanged(await githubLogout());
      setPicking(false);
    } catch (e) {
      setErr(describeGithubError(e));
    }
  };

  if (!loggedIn) {
    return (
      <div className="fields">
        {status.hasToken && (
          <p className="hint muted">
            正在用旧版手动填写的 token 同步。改用 GitHub 登录后,只有你授权的仓库能被访问。
          </p>
        )}
        {!status.hasToken && repo && <p className="hint muted">已选仓库 {repo},登录后继续同步。</p>}
        <Login onDone={onChanged} />
      </div>
    );
  }

  return (
    <div className="fields">
      <div className="gh-row">
        <span className="gh-account">@{account}</span>
        <button type="button" className="sym" onClick={logout}>
          退出登录
        </button>
      </div>
      {repo && !picking ? (
        <div className="gh-row gh-current">
          <span>
            <SyncIcon /> {repo}
          </span>
          <button type="button" className="sym" onClick={() => setPicking(true)}>
            换仓库
          </button>
        </div>
      ) : (
        <RepoPicker
          current={repo}
          onPicked={(s) => {
            setPicking(false);
            onChanged(s);
          }}
          onCancel={repo ? () => setPicking(false) : undefined}
        />
      )}
      <Err msg={err} />
    </div>
  );
}

type LoginState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "waiting"; code: LoginCode }
  | { kind: "expired" }
  | { kind: "denied" };

/** Device Flow:显示验证码,用户在浏览器里输入并授权,这里轮询结果。 */
function Login({ onDone }: { onDone: (s: SyncStatus) => void }) {
  const [st, setSt] = useState<LoginState>({ kind: "idle" });
  const [opened, setOpened] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const start = async () => {
    setErr(null);
    setOpened(false);
    setSt({ kind: "starting" });
    try {
      setSt({ kind: "waiting", code: await githubLoginStart() });
    } catch (e) {
      setErr(describeGithubError(e));
      setSt({ kind: "idle" });
    }
  };

  const code = st.kind === "waiting" ? st.code : null;
  useEffect(() => {
    if (!code) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let interval = code.interval;
    const deadline = Date.now() + code.expiresIn * 1000;
    const tick = async () => {
      if (stopped) return;
      if (Date.now() > deadline) return setSt({ kind: "expired" });
      try {
        const r = await githubLoginPoll();
        if (stopped) return;
        if (r.state === "done") return done.current(r.status);
        if (r.state === "expired" || r.state === "denied") return setSt({ kind: r.state });
        if (r.state === "slowDown") interval = r.interval;
        timer = setTimeout(tick, interval * 1000);
      } catch (e) {
        if (stopped) return;
        setErr(describeGithubError(e));
        setSt({ kind: "idle" });
      }
    };
    timer = setTimeout(tick, interval * 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [code]);

  if (code) {
    const open = () => {
      navigator.clipboard?.writeText(code.userCode).catch(() => {});
      githubOpen("device").catch((e) => setErr(describeGithubError(e)));
      setOpened(true);
    };
    return (
      <div className="fields">
        <span className="field">
          <span>在 GitHub 页面输入验证码</span>
          <output className="device-code" aria-label="验证码">
            {code.userCode}
          </output>
        </span>
        <button type="button" className="primary" onClick={open}>
          {opened ? "重新打开 GitHub" : "复制验证码并打开 GitHub"}
        </button>
        <p className="hint muted gh-row">
          <span>{opened ? "已复制。授权后这里会自动继续…" : "正在等待授权…"}</span>
          <button type="button" className="sym" onClick={() => setSt({ kind: "idle" })}>
            取消
          </button>
        </p>
        <Err msg={err} />
      </div>
    );
  }

  return (
    <div className="fields">
      {st.kind === "expired" && <p className="warn">验证码已过期,重新获取一个。</p>}
      {st.kind === "denied" && <p className="warn">在 GitHub 上没有完成授权。</p>}
      <button type="button" className="primary" disabled={st.kind === "starting"} onClick={start}>
        {st.kind === "idle" || st.kind === "starting" ? "用 GitHub 登录" : "重新获取验证码"}
      </button>
      {st.kind === "idle" && (
        <p className="hint muted">会在浏览器里打开 GitHub。授权后回到这里,选择存放笔记的仓库。</p>
      )}
      <Err msg={err} />
    </div>
  );
}

/** 列出授权给 Baner 的仓库。窗口重新获得焦点时刷新(用户可能刚在浏览器里新建或授权了仓库)。 */
function RepoPicker({
  current,
  onPicked,
  onCancel,
}: {
  current: string | null;
  onPicked: (s: SyncStatus) => void;
  onCancel?: () => void;
}) {
  const [list, setList] = useState<RepoList | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await githubRepos());
      setErr(null);
    } catch (e) {
      setErr(describeGithubError(e));
    }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const shown = useMemo(
    () => (list?.repos ?? []).filter((r) => r.fullName.toLowerCase().includes(q.trim().toLowerCase())),
    [list, q],
  );

  const pick = async (fullName: string) => {
    setBusy(true);
    setErr(null);
    try {
      onPicked(await syncUseRepo(fullName));
    } catch (e) {
      setErr(describeGithubError(e));
    } finally {
      setBusy(false);
    }
  };
  const open = (p: "install" | "newRepo") => {
    githubOpen(p).catch((e) => setErr(describeGithubError(e)));
    if (p === "newRepo") setCreated(true);
  };

  const newRepo = (
    <button type="button" className="sym" onClick={() => open("newRepo")}>
      <PlusIcon /> 新建私有仓库
    </button>
  );
  const createdHint = created && (
    <p className="hint muted">在 GitHub 上建好后,点「授权仓库」把它勾选上,回到这里就会出现。</p>
  );

  if (!list) {
    return (
      <>
        {!err && <p className="hint muted">正在读取仓库…</p>}
        <Err msg={err} />
      </>
    );
  }

  if (!list.installed || list.repos.length === 0) {
    return (
      <>
        <p className="hint">还没有仓库授权给 Baner。</p>
        <button type="button" className="primary" onClick={() => open("install")}>
          授权仓库
        </button>
        <p className="hint muted">
          在打开的页面里选「Only select repositories」,勾选用来存笔记的仓库。没有合适的就先新建一个。
        </p>
        <div className="gh-row">{newRepo}</div>
        {createdHint}
        <Err msg={err} />
      </>
    );
  }

  return (
    <>
      <span className="field">
        <span>选择存放笔记的仓库</span>
        {list.repos.length > 6 && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索"
            aria-label="搜索仓库"
            spellCheck={false}
            autoCapitalize="off"
          />
        )}
      </span>
      <ul className="repo-list" aria-label="仓库">
        {shown.map((r) => (
          <li key={r.fullName}>
            <button
              type="button"
              disabled={busy}
              aria-current={r.fullName === current || undefined}
              onClick={() => pick(r.fullName)}
            >
              <span>{r.fullName}</span>
              {r.fullName === current ? <CheckIcon /> : r.private && <LockIcon />}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="muted">没有匹配的仓库</li>}
      </ul>
      <div className="gh-row">
        {newRepo}
        <button type="button" className="sym" onClick={() => open("install")}>
          授权仓库
        </button>
        {onCancel && (
          <button type="button" className="sym" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
      {createdHint}
      {current && <p className="hint muted">换仓库后,本机的笔记会合并进新仓库。</p>}
      <Err msg={err} />
    </>
  );
}
