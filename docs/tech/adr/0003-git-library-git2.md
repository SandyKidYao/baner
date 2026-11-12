---
id: 0003
title: 应用内 git 使用 git2(libgit2),isomorphic-git 作为退路
status: proposed
date: 2026-11-10
supersedes:
superseded_by:
---

# ADR-0003:应用内 git 使用 git2(libgit2)

## 背景

Android 上没有命令行 git,同步必须内嵌 git 库(D3)。需要支持 fetch、合并(明文三方合并,加密文件整份保留一边)、commit 和 HTTPS token push。

## 选项

### 选项 A:git2 0.21(libgit2 1.9.7 的 Rust 封装)
- 优点:功能完整,HTTPS 和 SSH 都支持;放在 Rust 核心里,不占用界面线程。
- 缺点:网络功能默认关闭,需要开启 `https` 特性(依赖 OpenSSL),可以用 vendored 版本;git2-rs 没有 Android 交叉编译文档;Android 上需要自己处理 CA 证书。
- 成本与风险:构建链路复杂,APK 体积会增加。

### 选项 B:isomorphic-git 1.44(纯 JavaScript)
- 优点:不用编译原生代码;可以对接自定义文件系统和 HTTP 客户端。
- 缺点:遇到多个合并基时会直接失败;不支持 SSH;维护者只有两位志愿者;Obsidian Git 的移动端模式被作者自己称为「非常不稳定」。

### 选项 C:gitoxide(gix 0.90)
- 缺点:还没实现 push。排除。

## 决定

采用 A,B 作为退路(用户 2026-11-10 确认)。状态为 proposed,等 Spike git-android 的结果:证实就改为 accepted;证伪就写新的 ADR,改用 B。

## 理由

同步是用户最看重的能力之一,底层库要选功能最完整、最成熟的。风险集中在 Android 的构建上,能用 Spike 早早回答。

## 后果

- 正面:合并能力完整;以后要加 SSH 支持不用换库。
- 负面与代价:Android 构建链路复杂,依赖 OpenSSL。
- 什么情况下应该重新审视:Spike 失败;或者 gitoxide 实现了 push(可以去掉 C 依赖)。

## 依据

- git2 0.21.0 / libgit2 1.9.7:https://crates.io/crates/git2 、https://github.com/rust-lang/git2-rs
- gitoxide 功能状态(push 未实现):https://github.com/GitoxideLabs/gitoxide/blob/main/crate-status.md
- isomorphic-git 合并限制:https://isomorphic-git.org/docs/en/merge
- Obsidian Git 移动端说明:https://github.com/Vinzent03/obsidian-git
- libgit2 在移动端的构建难度(GitJournal):https://github.com/GitJournal/dart-git

