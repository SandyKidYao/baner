import { useState } from "react";
import { type CryptoStatus, cryptoSetup, cryptoStatus } from "../ipc";
import { CheckIcon, LockIcon } from "../rail/icons";
import { describeCryptoError } from "./errors";

interface Props {
  status: CryptoStatus | null;
  onChanged: (s: CryptoStatus) => void;
  /** 失败后重新读取的状态 */
  onStatus: (s: CryptoStatus) => void;
}

/** 主密钥:首次设置(输两遍)/ 另一台设备已设置过时输入解锁 / 已配置。 */
export function MasterKey({ status, onChanged, onStatus }: Props) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!status) return null;
  if (status.configured) {
    return (
      <p className="mark ok key-ok">
        <CheckIcon /> 本机已配置主密钥
      </p>
    );
  }
  const unlock = status.repoHasIdentity;
  const mismatch = !unlock && again !== "" && pass !== again;

  const submit = async () => {
    if (!unlock && pass !== again) return;
    setBusy(true);
    setErr(null);
    try {
      onChanged(await cryptoSetup(pass));
      setPass("");
      setAgain("");
    } catch (e) {
      // 本以为是新设置,其实仓库里已有主密钥:核心层已把它取到本机,界面切换成「输入」
      setErr(
        !unlock && /wrong master key/.test(String(e))
          ? "仓库里已有主密钥,请输入另一台设备上设置的那个"
          : describeCryptoError(e),
      );
      cryptoStatus()
        .then(onStatus)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="fields"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="field">
        <span>{unlock ? "输入主密钥(另一台设备上设置的)" : "设置主密钥(至少 8 位)"}</span>
        <input
          type="password"
          value={pass}
          onChange={(e) => {
            setPass(e.target.value);
            setErr(null);
          }}
          autoComplete="off"
        />
      </label>
      {!unlock && (
        <label className="field">
          <span>再输一次</span>
          <input
            type="password"
            value={again}
            onChange={(e) => {
              setAgain(e.target.value);
              setErr(null);
            }}
            autoComplete="off"
          />
        </label>
      )}
      <p className="warn">
        <LockIcon /> 忘记主密钥就无法找回加密内容
      </p>
      {(err || mismatch) && (
        <p className="err" role="alert">
          ✕ {err ?? "两次输入不一致"}
        </p>
      )}
      <button type="submit" className="primary" disabled={busy || pass === "" || (!unlock && pass !== again)}>
        <LockIcon /> {busy ? "…" : unlock ? "解锁" : "设置"}
      </button>
    </form>
  );
}
