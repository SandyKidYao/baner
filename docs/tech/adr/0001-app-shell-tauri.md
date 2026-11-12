---
id: 0001
title: 应用外壳用 Tauri 2(Rust 核心 + 系统 WebView)
status: accepted
date: 2026-11-10
supersedes:
superseded_by:
---

# ADR-0001:应用外壳用 Tauri 2

## 背景

需要一个外壳框架:第一版覆盖 Mac + Android,之后加 Windows + iOS,同时尽量轻快。相关驱动:D1 轻快、D2 一套代码跨端、D3 应用内 git、D6 编辑手感。

## 选项

### 选项 A:Tauri 2(Rust 核心 + 系统 WebView)
- 优点:一套界面代码覆盖四个平台(D2);可以直接用 CodeMirror 6(D6);git 和加密放在 Rust 里,不依赖命令行(D3)。
- 缺点:公开测量中,macOS 上冷启动约 311ms、空闲内存约 109MB,与 Electron(约 273ms / 128MB)差距不大(D1 不是必然成立);移动端插件不全;Android 的 WebView 版本由设备决定。
- 成本与风险:v3 已进入 alpha,以后要做迁移。

### 选项 B:每个平台写原生应用,共享 Rust 核心
- 优点:最轻(D1)。
- 缺点:界面和图块编辑器要写两遍以上;用户移动端经验少(D2)。

### 选项 C:Flutter
- 优点:一套代码,原生渲染。
- 缺点:没有 CodeMirror 6 那样成熟的编辑器组件,HeyNote 式的分块编辑要从头做(D6)。

### 选项 D:Electron
- 缺点:没有 Android 版本(D2)。只作为性能对比的基准。

## 决定

采用 A。用户 2026-11-10 确认「第一版先用 Tauri,比较快,迁移跨平台也容易」。Spike perf-baseline:内存证实(约 97MB,HeyNote 为 235MB),启动绝对值 0.5~0.65 秒可以接受,与 HeyNote 的对比留到 MVP 验收时补测。用户 2026-11-10 确认改为 accepted。

## 理由

在一个人、主要靠 AI 开发、要覆盖四个平台的约束下,它是唯一能同时满足 D2、D3、D6 的选项。D1 的不确定性由 Spike 来回答。

## 后果

- 正面:界面只写一套;Rust 核心以后换外壳也能复用。
- 负面与代价:轻快程度可能只是略好于 HeyNote,而不是显著更好。
- 什么情况下应该重新审视:Spike 显示在你的 Mac 上明显不如 HeyNote;或者 Android WebView 的编辑体验无法接受。

## 依据

- Tauri 2.12.5(crates.io,2026-10-21);v3.0.0-alpha.6(2026-11-06):https://github.com/tauri-apps/tauri/releases
- 移动端支持说明:https://v2.tauri.app/blog/tauri-20/
- 性能对比(BetterStack,2026-07-20 更新):https://betterstack.com/community/guides/scaling-nodejs/tauri-vs-electron-vs-deno-vs-electrobun/
- Flutter 编辑器生态:https://pub.dev/packages/re_editor

