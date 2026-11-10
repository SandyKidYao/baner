# Baner

xiaobai 项目初始化产物目录: .xiaobai/project-init/（不进版本控制）
xiaobai 开发循环: 不启用（用户 2026-11-10 选择：按 backlog 直接实现，每项完成后交付给用户看结果）

## 给 AI 协作者的约定

- 产品与技术决策记录在 `.xiaobai/project-init/`：`product/mvp.md`（范围，U 编号）、`product/backlog.md`（构建顺序）、`design/design.md` + `design/tokens.css`（视觉以此为准）、`tech/architecture.md`、`tech/adr/`、`tech/conventions.md`。动手前先读相关部分。
- 常用命令：`scripts/check.sh`（全部检查）、`scripts/check.sh --fast`、`npm run tauri dev`、`npm run tauri build`、`cargo test -p baner-core`。
- 分层：逻辑写在 `crates/baner-core`（可单测）；`src-tauri` 只注册命令；界面只通过 `src/ipc/` 调用命令，不要在别处直接 `invoke`。新增命令时同步更新 `src/ipc/mock.ts`。
- 数据布局遵循 ADR-0005：`tabs/<tab-id>/<排序键>~<块id>.<ext>[.age]`；改布局要升级 `.baner/format.json` 的版本。
- 禁区：不要把 token、主密钥或解开的文件钥匙写进日志、错误信息或任何文件；只存系统安全存储。不要提交 `.env`。
- 隐藏窗口里的 WebView 不执行 `requestAnimationFrame`，「内容就绪再显示窗口」用 `setTimeout`。
- 提交使用 Conventional Commits；提交前钩子会跑 `scripts/check.sh --fast`。
- 真实应用的手动验证可用 agent-desktop：CodeMirror 编辑区用 `set-value` 输入（`type` 无效）。
