---
id: 0005
title: 存储布局:tab 随机 id 文件夹,文件名带分数排序键
status: accepted
date: 2026-11-10
supersedes:
superseded_by:
---

# ADR-0005:存储布局

## 背景

一个 tab 一个文件夹,一个块一组文件(D4);两台设备同时编辑时,git 合并要尽量干净(D3);加密 tab 不能暴露 tab 名(D5)。数据积累之后,改布局要做迁移,所以属于单向门。

## 选项

### 选项 A:随机 id 文件夹,文件名 = 分数排序键 ~ 块 id(采用)
```
<数据目录>/                 git 仓库根
  .baner/format.json        格式版本
  .baner/identity.age       文件钥匙(ADR-0004)
  tabs/<tab-id>/
    tab.json[.age]          名称、单字、排序键
    <排序键>~<块id>.md[.age]
    <排序键>~<块id>.excalidraw[.age]
    <排序键>~<块id>.svg[.age]
```

### 选项 B:每个 tab 一个顺序索引文件(index.json 列出块的顺序)
- 缺点:两台设备都在同一个 tab 里加块时,index.json 必然产生冲突。

### 选项 C:用 tab 名作为文件夹名
- 缺点:加密 tab 会暴露 tab 名;改名就要移动整个文件夹。

## 决定

采用 A(用户 2026-11-10 确认),并附带以下约定:

- 排序键使用分数排序键(fractional index)。插入新块只新建一个文件;调整顺序就重命名文件,git 能识别为重命名。
- 不同步的 tab 写进 `.git/info/exclude`,只在本机生效。
- 每个 tab 的同步开关保存在本机的应用配置里;加密状态由 `.age` 后缀表示,随仓库同步。
- `.baner/format.json` 记录格式版本,为以后迁移做准备。

## 理由

在常见的并发编辑场景(两台设备在同一个 tab 加块)下,A 不会产生冲突。随机 id 加上加密的 tab.json,保证不泄露 tab 名。

## 后果

- 正面:合并干净;tab 改名不用移动文件。
- 负面与代价:直接在文件管理器里看,文件夹名不可读,要打开 tab.json 才知道是哪个 tab;排序键要实现生成和偶尔的重新平衡。
- 什么情况下应该重新审视:单个 tab 的块数量远超几百个,导致文件系统或 git 变慢。

## 依据

- 架构文档的数据模型节:`../architecture.md`

