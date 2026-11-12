# 工程约定

## 目录结构

```
src/                       界面层(React + TypeScript)
  app/                     布局、响应式断点
  rail/                    tab 条、手机抽屉、tab 菜单与改名
  blocks/                  分块编辑(CodeMirror 6 扩展:分隔、Markdown、代码块、⌘↵、⌘A)
  draw/                    图块:SVG 预览与按需加载的 Excalidraw
  settings/                同步与加密配置面板
  sync/                    同步状态与触发
  crypto/                  本机主密钥输入
  ipc/                     核心层命令的类型化封装(唯一调用 invoke 的地方)与浏览器内模拟
  theme/                   设计 token 与基础样式
crates/baner-core/         核心逻辑(纯 Rust,不依赖 Tauri,可单独测试)
  src/storage/             布局、读写块文件
  src/crypto/              age 两层钥匙
  src/sync/                git2:commit、fetch、merge、push、冲突处理
  src/secrets/             本机私有密钥文件
  src/config.rs            本机配置
src-tauri/                 Tauri 外壳:只注册命令,转交给 baner-core
scripts/                   检查、安装、发版、性能测量
tests/e2e/                 浏览器内的界面冒烟测试(核心层命令被模拟)
```

遵循 Tauri 2 的目录约定(`src/` + `src-tauri/`),唯一的偏离是把核心逻辑拆成 `crates/baner-core`,理由见 [../tech/architecture.md](../tech/architecture.md)。

## 命名

- TypeScript:普通模块文件用 kebab-case(`code-blocks.ts`),React 组件文件和组件用 PascalCase,变量和函数用 camelCase。
- Rust:遵循 rustfmt 和 clippy 的默认规则。
- IPC 命令:snake_case,以动词开头(`save_block`、`sync_now`)。
- 数据文件名:见 [ADR-0005](../tech/adr/0005-storage-layout.md)。

## 分支与提交

- 主干开发(`main`),短生命周期的功能分支命名为 `feat/<slug>`、`fix/<slug>`,squash 合并回 `main`。
- 提交信息使用 Conventional Commits(`feat:`、`fix:`、`docs:`…)。

## 发版

```bash
scripts/release.sh 0.2.0        # 改好各处版本号,提交 chore(release): v0.2.0 并打 tag
git push origin main v0.2.0     # 推送 tag 触发 .github/workflows/release.yml
```

- 版本号同时存在于 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`(和两个 lock 文件),只通过 `scripts/release.sh` 修改;CI 会校验 tag 与它们一致。
- CI 先跑 `scripts/check.sh` 全部检查,再在 macOS 上构建 universal(Apple 芯片 + Intel)的 `Baner_macOS_universal.dmg` 和 `.app.zip`,附 `SHA256SUMS.txt` 发布到 GitHub Release。文件名不带版本号,产品页和 README 用 `releases/latest/download/Baner_macOS_universal.dmg` 指向最新版,改名要同步改这两处。带 `-` 的版本(如 `0.2.0-beta.1`)发成 prerelease。
- 构建失败修好后,可以在 Actions 页手动运行 Release 并填入已有 tag 重新发布;已存在的 Release 会覆盖同名产物。
- 和本机构建一样是 ad-hoc 签名、不公证,下载的用户第一次打开需要手动放行(Release 说明里写了做法)。

## 代码风格与检查

- 前端用 Biome 同时负责格式化和 lint;Rust 用 `cargo fmt` 和 `cargo clippy -D warnings`。
- `npm install` 时会把 git 钩子目录设为 `.githooks/`,提交前运行 `scripts/check.sh --fast`(格式、lint、类型)。
- `scripts/check.sh` 一条命令跑全部检查:格式、lint、类型、Rust 测试、Vitest、Playwright。

## 测试

- **核心层**(`cargo test -p baner-core`):文件布局、age 加解密往返;用临时目录里的本地裸仓库充当远端,测完整的 commit → fetch → merge → push,包括冲突和「保留较新一边」的规则。
- **界面层单元测试**(Vitest):块模型、分隔符解析、防抖等。
- **界面冒烟测试**(Playwright):在浏览器里运行前端,核心层命令由 `src/ipc/mock.ts` 模拟,覆盖核心旅程和手机布局。新增命令时要同步更新 mock。
- Tauri 的 WebDriver 测试不支持 macOS,真实应用里的行为靠手动验证,或用 agent-desktop 操作真实窗口(CodeMirror 编辑区用 `set-value` 输入,`type` 无效)。
- 每个功能的验收标准至少有一个自动化测试覆盖;修 bug 先写复现测试。不设覆盖率百分比。

## 依赖

- 前端用 npm,`package-lock.json` 进库;`Cargo.lock` 进库。
- 引入新依赖前检查三件事:是否还在维护;许可证(只接受 MIT、Apache-2.0、BSD、ISC 这类宽松许可证);体积(界面层的新依赖要说明对启动路径的影响)。

## 配置与密钥

- `.env.example` 列出开发用的环境变量;真实值写进 `.env`,`.env` 不进库。
- token、主密钥、解开的文件钥匙只存在本机密钥文件 `secrets.json` 里(ADR-0008),不写进日志、错误信息或任何其他文件。
- 构建使用 ad-hoc 签名,不需要代码签名证书。
