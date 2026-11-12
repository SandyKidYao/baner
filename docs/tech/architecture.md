# 系统架构

Baner 是一个本地应用,没有服务器、没有自己的账号体系。同步交给用户自己的 GitHub 仓库,登录用 GitHub App 的 Device Flow(ADR-0009)。

已实现的平台是 macOS。整体设计以 Mac + Android 为目标(之后是 Windows、iOS),所以核心逻辑与界面都按跨端来组织。

## 架构驱动

按重要性排序,ADR 里的取舍都以它们为标准。

| # | 驱动 | 具体要求 |
|---|---|---|
| D1 | 轻快 | 冷启动时间和空闲内存不差于 HeyNote(Electron 应用);Android 上打开即可写 |
| D2 | 一套代码跨端 | Mac、Android,之后 Windows、iOS;一个人开发,代码主要由 AI 写 |
| D3 | 应用内 git 同步 | 不依赖命令行 git,应用内部完成 fetch、merge、commit、push;通过 HTTPS,token 来自 GitHub 登录 |
| D4 | 数据即文件 | 一个 tab 一个文件夹,一个块一组文件;明文 tab 在 git 里人能直接读 |
| D5 | 端侧加密可信 | 加密 tab 的内容和 tab 名在仓库里都是密文;主密钥和 token 不出设备 |
| D6 | 编辑手感 | `⌘↵` 新建块、`⌘A` 选中当前块与 HeyNote 一致;图块编辑接近 Excalidraw |
| D7 | 零费用、AI 协作友好 | 不使用任何付费服务;技术主流、文档完善 |

## 系统上下文

- **GitHub**:唯一的外部系统。用户用 GitHub App「baner-notes」登录(Device Flow),只授权存笔记的仓库;应用通过 HTTPS 和这个 token 列出仓库、fetch 与 push(ADR-0009)。
- **本机密钥文件** `secrets.json`:保存 token 和解开的文件钥匙,权限 0600,必须在数据目录之外(ADR-0008)。
- **本机配置** `config.json`:远端地址、登录的 GitHub 账号、本机不同步的 tab。不进仓库。

macOS 上三者都在 `~/Library/Application Support/dev.baner.app/` 下,数据目录是其中的 `data/`。

## 分层

每台设备上只有一个可部署单元:Baner 应用。

| 层 | 职责 | 技术 | 位置 |
|---|---|---|---|
| 界面层 | tab 条、分块文本编辑、图块编辑、同步与加密配置、同步状态 | 系统 WebView + React(ADR-0007)+ CodeMirror 6;图块编辑器是按需加载的 Excalidraw(ADR-0002) | `src/` |
| 命令层 | 注册 IPC 命令,把调用转交给核心层 | Tauri 2(ADR-0001) | `src-tauri/` |
| 核心层 | 读写块文件、加解密、git 同步与冲突处理、本机密钥与配置 | 纯 Rust,不依赖 Tauri;git2(ADR-0003);age(ADR-0004) | `crates/baner-core/` |
| 数据目录 | 所有 tab 和块的文件,同时是 git 工作区 | 文件系统(ADR-0005) | 只由核心层读写 |

界面层只通过 `src/ipc/` 调用命令;`src/ipc/mock.ts` 是同一套命令的浏览器内模拟实现,供 Playwright 测试使用。

## 核心旅程的数据流

**书写与保存**
1. 用户在某个块里输入。停止输入 300ms 后,界面层发出 `save_block`。
2. 核心层写入块文件;加密 tab 先加密再写。

**自动同步**(启动时,以及停止编辑 10 秒后;也可以手动触发)
1. 把不同步的 tab 写进 `.git/info/exclude`,提交本地改动。
2. fetch 远端并合并:
   - `.md` 文本块做三方合并;同一行冲突时,把冲突标记写进块文件并提交,同步符号显示 ⚠。
   - 其他文件(`tab.json`、`.age` 密文、图块文件等)无法按行合并,保留提交时间较新的一边。
   - 一边修改、一边删除时,保留修改的一边,不丢内容。
   - `.baner/identity.age`(包裹文件钥匙)两边不同时**绝不覆盖仓库里的**:本机还没用自己的钥匙加密过内容,就改用仓库里的,并清掉本机钥匙、提示重新输入主密钥;否则停止同步,报「这台设备的主密钥和仓库里的不一致」。
3. 只检出有变化的文件,再 push。同步符号随状态变化:转动、✓、⚠、✕。

**另一台设备**:同步后界面层重新读取有变化的块。

**设置主密钥**:已选仓库而本机还没有 `identity.age` 时,先从仓库取来再用它;只有确认仓库里没有,才生成新的文件钥匙。连不上仓库时拒绝设置,避免新设备生成第二把钥匙。解不开的加密 tab 显示为锁定,不影响其他 tab。

## 数据模型

```
<数据目录>/                       git 仓库根目录
  .baner/format.json              格式版本;改布局要升级它
  .baner/identity.age             文件钥匙(age 身份),用主密钥加密后随仓库同步(ADR-0004)
  tabs/<tab-id>/                  tab-id 是随机短 id,不暴露 tab 名
    tab.json                      名称、单字、排序键;加密 tab 存为 tab.json.age
    <排序键>~<块id>.md            文本块(Markdown)
    <排序键>~<块id>.excalidraw    图块:Excalidraw 场景,事实来源
    <排序键>~<块id>.svg           图块:预览图,保存时生成
                                  加密 tab 中以上文件名都加 .age 后缀
```

- **块的顺序**由文件名开头的分数排序键决定:在两个块之间插入只需新建一个文件,两台设备同时插入块时 git 不会冲突。
- **不同步的 tab** 写进 `.git/info/exclude`,只对本机生效。
- **同步开关**只保存在本机;**加密状态**由 `.age` 后缀表示,随仓库同步。
- **逃生通道**:不用 Baner 也能用标准 `age` 工具取回加密内容(见 `crates/baner-core/src/crypto/mod.rs` 开头的注释)。

## 部署

- 只在本地运行,没有服务端。
- macOS:本机构建 `.app`,使用 ad-hoc 签名,不公证(Apple 开发者账号要年费,与 D7 冲突)。安装脚本是 `scripts/install-app.sh`。

## 为什么是这个形态

- **单体应用,没有服务器**:同步交给用户已有的 git 仓库(D3、D7)。
- **WebView 界面加 Rust 核心**:界面一套代码覆盖各平台(D2);编辑器用 CodeMirror 6,手感有保障(D6);git 和加密放在 Rust 里,不依赖 WebView 和命令行 git(D3、D5)。
- **核心层单独成 crate**:不启动应用也能测试存储、加密和同步;以后换外壳或移植 Android 可以原样复用。
- **不选 Electron**:没有 Android 版本。**不按平台写原生应用**:界面和图块编辑器要写多遍(D2)。详见 ADR-0001。

## 已知限制

- 加密文件每次加密的密文都不同,所以只在明文变化时才重新加密,避免仓库膨胀。
- 加密 tab 的文件名(排序键、块 id)是明文,会暴露块的数量,不暴露内容和 tab 名。
- 两台设备同时改同一张图时,保留较新的一边,另一边的改动会丢失。
- git2 在 Android 上的交叉编译尚未验证(ADR-0003 因此仍是 proposed)。

## 决策记录

见 [adr/](adr/README.md)。
