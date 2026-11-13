# Baner

超轻量的分块记事板:Tauri 2 + React + CodeMirror 6 的界面,纯 Rust 的核心层负责存储、加密和 git 同步。已实现的平台是 macOS。

## 命令

```bash
npm install                  # 安装依赖,并启用提交前钩子
npm run tauri dev            # 开发版
scripts/check.sh             # 全部检查:格式、lint、类型、Rust 测试、Vitest、Playwright
scripts/check.sh --fast      # 只做格式、lint、类型(提交前钩子会跑)
cargo test -p baner-core     # 只跑核心层测试
scripts/install-app.sh       # release 构建并装到 /Applications
scripts/release.sh 0.2.0     # 发版:改版本号、提交、打 tag;推 tag 后 CI 构建并发布 Release
```

## 硬规则

- **分层**:逻辑写在 `crates/baner-core`(可单测);`src-tauri` 只注册命令;界面只通过 `src/ipc/` 调用命令,不要在别处直接 `invoke`。新增命令时同步更新 `src/ipc/mock.ts`(Playwright 测试靠它)。
- **数据布局**遵循 [ADR-0005](docs/tech/adr/0005-storage-layout.md):`tabs/<tab-id>/<排序键>~<块id>.<ext>[.age]`;改布局要升级 `.baner/format.json` 的版本。
- **密钥禁区**:token、主密钥、解开的文件钥匙不写进日志、错误信息,或 `secrets.json` 以外的任何文件([ADR-0008](docs/tech/adr/0008-secrets-local-file.md))。不要提交 `.env`。
- **视觉**以 [docs/design/design.md](docs/design/design.md) 和 `src/theme/tokens.css` 为准,不写死色值。
- 提交使用 Conventional Commits。

## 坑

- 隐藏窗口里的 WebView 不执行 `requestAnimationFrame`,「内容就绪再显示窗口」用 `setTimeout`。
- 真实应用的手动验证可用 agent-desktop:CodeMirror 编辑区用 `set-value` 输入(`type` 无效)。
- macOS 上关闭窗口要隐藏应用(`app.hide()`),不要 `window.hide()`:窗口隐藏再显示后,WebView 的辅助功能树失效,agent-desktop 和读屏都点不到控件。

## 什么时候读什么

| 要做的事 | 先读 |
|---|---|
| 改核心层、同步、加密、数据格式 | [docs/tech/architecture.md](docs/tech/architecture.md)、[docs/tech/adr/](docs/tech/adr/README.md) |
| 改界面、交互、配色 | [docs/design/design.md](docs/design/design.md) |
| 新建文件、加依赖、写测试 | [docs/dev/conventions.md](docs/dev/conventions.md) |
| 做难以回头的技术决定 | 在 `docs/tech/adr/` 新增一篇 ADR |

## xiaobai

xiaobai 项目初始化产物目录: .xiaobai/project-init/(不进版本控制,只在作者本机)
xiaobai 开发循环: 不启用(按 backlog 直接实现,每项完成后交付给用户看结果)
