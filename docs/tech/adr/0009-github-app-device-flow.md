---
artifact: adr
id: 0009
title: 用 GitHub App 的 Device Flow 登录,取代手动填写仓库地址和 token
status: accepted
date: 2026-11-12
supersedes:
superseded_by:
pending_spike:
---

# ADR-0009:用 GitHub App 的 Device Flow 登录

## 背景

原来的同步配置要求用户自己去 GitHub 生成 personal access token,再把仓库地址、用户名、token 填进三个输入框。用户反馈「配置 token 还是太麻烦了」,希望点一下按钮登录 GitHub,再选一个仓库就行。

约束:Baner 没有服务器(D7 零费用),桌面应用里放不住 client secret;代码和产品页已经公开,别人也会下载使用。

## 选项

### 选项 A:OAuth App + Device Flow
- 优点:流程最短(登录 → 选仓库);能直接调用接口新建仓库。
- 缺点:需要 `repo` 权限,token 能读写用户的**全部**仓库,包括其他私有项目和组织仓库,还能操作 issue、PR、webhook 等。

### 选项 B:GitHub App + Device Flow(采用)
- 优点:token 只能访问用户把 App 安装到的仓库,权限只有「仓库内容读写」;用户随时可以在 GitHub 上把某个仓库移出授权。同样不需要 client secret 和回调地址。
- 缺点:第一次使用要多一步「安装 App、勾选仓库」;在应用里新建仓库需要额外的 Administration 权限,所以改为在浏览器里新建,再勾选进授权。

### 选项 C:网页授权 + 本机回调端口
- 缺点:GitHub 交换 token 需要 client secret,桌面应用里藏不住。排除。

### 保留手动填写 token
- 用户决定整个删掉,只支持 GitHub(SSH 的 U12 也随之不再需要)。

## 决定

采用 B(用户 2026-11-12 确认)。

- App:`baner-notes`,Client ID `Iv23libAL2glEQN7Ntag`(公开信息,写在 `crates/baner-core/src/github/mod.rs`)。
- 权限:Repository permissions 只开 Contents: Read and write;关闭 webhook;开启 Device Flow;关闭 token 过期(续期用的 refresh token 也会存在同一个文件里,过期带来的保护有限,不值得多一套续期逻辑)。
- 流程:申请验证码 → 用户点「复制验证码并打开 GitHub」→ 应用按 GitHub 给的间隔轮询 → 拿到 token,读取账号 → 列出 `/user/installations` 下的仓库 → 用户选一个。没有授权仓库时引导去安装页;「新建私有仓库」打开预填好的 `github.com/new`。
- device code 只留在核心层;界面只拿到给用户看的验证码。应用能打开的网页由核心层拼出,界面不能指定任意网址。
- token 仍存在 `secrets.json`(ADR-0008);提交作者改为 GitHub 账号和它的 noreply 邮箱。
- 旧版手动填写的 token 继续可用,面板提示改用 GitHub 登录。

## 理由

代码已经公开,下载的人账号里很可能有别的私有代码。token 泄露时,B 只牵连笔记仓库,A 会牵连整个账号。多出来的安装步骤只在第一次发生,换设备时只需要登录。

## 后果

- 正面:配置从「生成 token + 填三个框」变成「登录 + 选仓库」;token 权限最小;提交在 GitHub 上显示用户头像。
- 负面与代价:只支持 GitHub;新增 HTTP 依赖 ureq(用系统 TLS 和证书库,macOS 上是 Security.framework);第一次使用要在浏览器里安装 App;新建仓库要跳转两次浏览器。
- 什么情况下应该重新审视:要支持 Gitee、GitLab 等其他托管服务;GitHub 改变 Device Flow 或 App 权限模型;Android 移植(U11)时验证同样的流程。

## 依据

- Device Flow(不需要 client secret,需在 App 设置里开启):https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
- GitHub App 的用户 token(只能访问 App 与用户都能访问的仓库;过期可关闭):https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- 新建仓库页面的预填参数(`name`、`visibility`):https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository
