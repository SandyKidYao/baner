---
id: 0006
title: 文件钥匙与 token 存在系统安全存储(macOS 钥匙串、Android Keystore)
status: superseded
date: 2026-11-10
supersedes:
superseded_by: 0008
---

# ADR-0006:密钥存在系统安全存储

## 背景

每台设备只需配置一次主密钥,之后进出加密 tab 不再输入(用户在线框阶段明确提出)。解开后的文件钥匙(ADR-0004)和 git token 要保存在设备上,既安全,又不用反复输入(D5)。

## 选项

### 选项 A:系统安全存储
- macOS:钥匙串,通过 `keyring` crate(4.x)访问。
- Android:Keystore。社区插件 `tauri-plugin-keyring-store` 0.3.2 刚发布(2026-11-09),太新,所以自己写一个小的 Kotlin 插件,社区插件仅作参考。
- 优点:安全;不需要反复输入。
- 缺点:macOS 上应用签名一变(比如重新构建),读取时会弹一次授权窗口。解决办法是用本机自建的免费自签名证书统一签名。

### 选项 B:Tauri Stronghold
- 缺点:保险库本身需要密码才能打开。要么每次启动输入(违背「配置一次」),要么把密码写死或存起来(安全性退化为 C,或者绕回 A)。

### 选项 C:应用私有目录里的普通文件
- 缺点:设备被 root,或者备份被导出时会泄露。

## 决定

采用 A(用户 2026-11-10 确认)。Spike perf-baseline 证实:同一个构建内读写无感知;ad-hoc 签名在重新构建后会弹窗(用户实际看到并拒绝),而且无法覆盖写入。所以**附加条件:使用本机自签名证书统一签名**,并在行走骨架中验证。用户 2026-11-10 确认改为 accepted。

## 理由

只有 A 能同时满足「安全」和「配置一次,不再输入」。

## 后果

- 正面:符合系统惯例;Android Keystore 有硬件级保护。
- 负面与代价:要自己维护一个小的 Android 插件;macOS 上需要一个本机自签名证书(写进工程约定)。
- 什么情况下应该重新审视:社区插件成熟,或者 Tauri 推出官方的钥匙串插件。

## 依据

- Tauri 官方插件列表(没有钥匙串插件):https://v2.tauri.app/plugin/
- keyring crate:https://crates.io/crates/keyring
- tauri-plugin-keyring-store:https://crates.io/crates/tauri-plugin-keyring-store

