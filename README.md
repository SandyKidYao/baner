# Baner

超轻量的分块记事板:同页、无限、分块书写,支持图块、tab、按 tab 的 git 同步与端侧加密。数据就是你自己 git 仓库里的普通文件。

> 状态:MVP 开发中(macOS)。

## 两步跑起来(macOS)

需要 Node 22+、Rust stable、Xcode 命令行工具。

```bash
npm install                    # 1. 安装依赖(同时启用提交前钩子)
npm run tauri dev              # 2. 启动开发版
```

安装正式版:`scripts/install-app.sh`(release 构建、ad-hoc 签名、不公证,装到 `/Applications/Baner.app`)。本机构建的应用不带隔离标记,可以直接打开。

数据在 `~/Library/Application Support/dev.baner.app/`:`data/` 是数据目录(可以作为 git 仓库同步),`secrets.json` 和 `config.json` 只留在本机。

## 性能对比

```bash
scripts/perf/measure.sh /Applications/Baner.app=Baner /Applications/Heynote.app=Heynote
```

两个应用交替冷启动,记录从 `open` 到窗口出现的时间,以及静置后所有相关进程的内存(footprint)。

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
| `scripts/` | 检查、安装、性能测量脚本 |

## 文档

- [架构](docs/tech/architecture.md)与[架构决策记录](docs/tech/adr/README.md)
- [体验设计规范](docs/design/design.md)
- [工程约定](docs/dev/conventions.md)
- 给 AI 协作者的说明:[AGENTS.md](AGENTS.md)

## 许可证

[MIT](LICENSE)
