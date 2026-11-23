# Baner

超轻量的分块记事板:Tauri 2 + React + CodeMirror 6 的界面,纯 Rust 的核心层负责存储、加密和 git 同步。已实现的平台是 macOS、Windows(x64),以及只供自用、经 USB 部署的 iOS。

## 命令

```bash
npm install                  # 安装依赖,并启用提交前钩子
npm run tauri dev            # 开发版
scripts/check.sh             # 全部检查:格式、lint、类型、Rust 测试、Vitest、Playwright
scripts/check.sh --fast      # 只做格式、lint、类型(提交前钩子会跑)
cargo test -p baner-core     # 只跑核心层测试
scripts/install-app.sh       # release 构建并装到 /Applications
scripts/ios-deploy.sh        # release 构建 iOS 版,经 USB 装到连着的 iPhone(免费 Apple ID 签名,7 天后重跑续期)
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
- 数据仓库不能做换行符转换:用户全局的 `core.autocrlf` 会被 libgit2 采用,把 `.md` 改成 CRLF、改坏短密文。`sync::open_or_init` 每次都在本仓库关掉它,别绕过这个函数打开仓库去提交或检出。
- 改名覆盖文件用 `fsutil::replace`(Windows 上文件被占用时会重试),不要直接 `fs::rename`。
- Windows 上 npm 经 cmd.exe 转发参数,`--config '{...}'` 这类 JSON 参数会被拆坏,改用配置文件。
- 界面判断手机、移动系统用 `src/app/platform.ts`;布局仍按宽度(`useNarrow`),手机横屏也算窄屏。手机上没有应用内更新,updater 只在桌面编译(`#[cfg(desktop)]`)。
- iOS 工程在 `src-tauri/gen/apple/`,改了 `project.yml` 要在该目录跑 `xcodegen generate`。libgit2 需要链接系统的 `libz`、`libiconv`(已写在 `project.yml`)。
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
