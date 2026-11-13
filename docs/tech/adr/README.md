# 架构决策记录(ADR)

记录难以回头的技术决定及其理由。ADR 只追加:决定被推翻时,旧的标为 `superseded` 并指向新的,不删除。

文中的 D1~D7 是架构驱动,定义见 [../architecture.md](../architecture.md#架构驱动);「用户」指项目作者。

| ADR | 主题 | 状态 |
|---|---|---|
| [0001](0001-app-shell-tauri.md) | 应用外壳:Tauri 2(Rust 核心 + 系统 WebView) | accepted |
| [0002](0002-diagram-editor-excalidraw.md) | 图块编辑器:嵌入 Excalidraw,数据用 Excalidraw 格式 | accepted |
| [0003](0003-git-library-git2.md) | git 库:git2(libgit2),isomorphic-git 作退路 | proposed(Android 构建待验证) |
| [0004](0004-encryption-age-two-layer.md) | 加密格式:age,主密钥包裹文件钥匙 | accepted |
| [0005](0005-storage-layout.md) | 存储布局:随机 id 文件夹,文件名带分数排序键 | accepted |
| [0006](0006-secret-storage-os-keystore.md) | 密钥存系统钥匙串 | superseded(被 0008 取代) |
| [0007](0007-ui-framework-react.md) | 界面框架:React | accepted |
| [0008](0008-secrets-local-file.md) | 密钥存成本机私有文件(0600,在数据目录之外) | accepted |
| [0009](0009-github-app-device-flow.md) | 用 GitHub App 的 Device Flow 登录,取代手动填写 token | accepted |
| [0010](0010-auto-update-tauri-updater.md) | 自动更新:Tauri updater 插件,从 GitHub Release 取签名的更新包 | accepted |
