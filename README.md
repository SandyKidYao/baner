# Baner

超轻量的分块记事板:同页、无限、分块书写,支持图块、tab、按 tab 的 git 同步与端侧加密。数据就是你自己 git 仓库里的普通文件。

> 状态:MVP 开发中(macOS)。

## 两步跑起来(macOS)

需要 Node 22+、Rust stable、Xcode 命令行工具。

```bash
npm install                    # 1. 安装依赖(同时启用提交前钩子)
npm run tauri dev              # 2. 启动开发版
```

打包正式版:`npm run tauri build`,产物在 `target/release/bundle/macos/Baner.app`。

## 检查与测试

```bash
scripts/check.sh               # 全部:格式、lint、类型、Rust 测试、Vitest、Playwright
scripts/check.sh --fast        # 只做格式、lint、类型(提交前钩子用)
```

## 目录

| 目录 | 内容 |
|---|---|
| `src/` | 界面层(React + TypeScript + CodeMirror 6) |
| `crates/baner-core/` | 核心逻辑(纯 Rust):存储、加密、git 同步、本机密钥文件 |
| `src-tauri/` | Tauri 外壳,只注册命令 |
| `tests/e2e/` | 浏览器内的界面冒烟测试(核心层命令被模拟) |
| `scripts/` | 检查脚本 |

## 许可证

MIT
