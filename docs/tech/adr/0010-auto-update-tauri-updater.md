---
artifact: adr
id: 0010
title: 自动更新:Tauri updater 插件,从 GitHub Release 取签名的更新包
status: accepted
date: 2026-11-13
supersedes:
superseded_by:
pending_spike:
---

# ADR-0010:自动更新用 Tauri updater 插件

## 背景

0.1.0 起在 GitHub Release 上发布构建好的 `.dmg`,用户每次都要自己去下载、拖进「应用程序」、再放行一次 Gatekeeper。0.1.1 要求「基于 GitHub 的 release 实现自动更新」。

约束:没有服务器、零费用(D7);构建是 ad-hoc 签名,没有 Apple 开发者证书,不公证;代码和 Release 都公开。

## 选项

### 选项 A:Tauri 官方 updater 插件(采用)
- 优点:Tauri 2 的标准做法,文档完善;更新包用 minisign 私钥签名,应用内置公钥校验,和 Apple 证书无关;macOS 上原子替换 `.app`,失败时还原;下载走应用自己的 HTTP 请求,不带隔离标记,更新后不会再被 Gatekeeper 拦。
- 缺点:要多管一把签名私钥;Release 要多发 `.app.tar.gz` 和 `latest.json`;新增 reqwest 等依赖,应用体积略增。

### 选项 B:核心层自己实现(GitHub API 查最新 Release,下载 `.app.zip` 替换自己)
- 优点:不新增依赖,复用已有的 ureq。
- 缺点:替换正在运行的 `.app`、失败还原、权限不足时提权都要自己写;没有签名校验,只能比对同一个 Release 里的 SHA256,Release 被篡改时防不住。

### 选项 C:只提示有新版本,打开下载页
- 优点:最简单。
- 缺点:不算「自动更新」,用户仍要手动安装、放行。

## 决定

采用 A(用户 2026-11-13 提出需求)。

- 更新地址固定为 `https://github.com/SandyKidYao/baner/releases/latest/download/latest.json`;`releases/latest` 不含 prerelease,所以测试版不会推给正式用户。
- CI 构建时打开 `createUpdaterArtifacts`,用仓库 secret `TAURI_SIGNING_PRIVATE_KEY` 签名;universal 更新包同时登记为 `darwin-aarch64` 和 `darwin-x86_64`。本机构建(`scripts/install-app.sh`)不生成更新包,不需要私钥。
- 公钥写在 `src-tauri/tauri.conf.json`;私钥只在作者本机(`~/.tauri/baner.key`)和 GitHub secret 里,不进仓库。
- 检查与安装由 `src-tauri` 的 `update_check`、`update_install` 两个命令调用插件的 Rust 接口完成,界面仍只经过 `src/ipc/`,不开放插件的前端权限。逻辑全在插件里,所以没有放进 baner-core。
- 启动 5 秒后、之后每 6 小时检查一次(应用常驻 Dock);有新版本时 ⚙ 带小圆点,不弹窗。用户在面板里点「更新并重启」:先保存正在编辑的块,再下载、校验、替换、重启。后台检查失败不提示。
- 打开 `requireSignedVersion`:签名的可信注释里带着版本号(当前 Tauri CLI 会写入,已在本机验证),`latest.json` 宣称的版本必须与之一致,防止有人把旧版的合法更新包配上更高的版本号,强行让用户降级。

## 理由

自动更新会替换用户机器上的程序,签名校验是底线。A 用一把与 Apple 无关的私钥解决了这个问题,替换与还原的边界情况由插件处理,和 D7「技术主流、文档完善」一致。B 省下的依赖不值得自己承担替换失败、篡改的风险。

## 后果

- 正面:装了 0.1.1 及以后版本的用户,一键更新,不用重新下载和放行。
- 负面与代价:**私钥丢了,已经发出去的应用就再也收不到更新**(只能让用户手动下载新版),私钥要另外备份;私钥泄露时,别人可以给 Baner 用户推送恶意更新(还需要能改 Release),这时要换公钥并让用户手动升级一次。0.1.0 没有更新功能,只能手动升到 0.1.1。
- 什么情况下应该重新审视:私钥丢失或泄露;有了 Apple 开发者证书、需要公证;移植到 Android(应用商店分发,不用这套);发 prerelease 时想让一部分用户提前更新。

## 依据

- Tauri updater 插件(签名、`latest.json` 格式、`createUpdaterArtifacts`):https://v2.tauri.app/plugin/updater/
- GitHub「最新 Release」的下载地址(不含 prerelease 和 draft):https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases
