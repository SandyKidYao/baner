---
id: 0002
title: 图块编辑器嵌入 Excalidraw,数据格式直接用 Excalidraw 的格式
status: accepted
date: 2026-11-10
supersedes:
superseded_by:
---

# ADR-0002:图块编辑器嵌入 Excalidraw

## 背景

用户希望图块的编辑体验尽量接近 Excalidraw(D6)。原始需求中的存储方式是「mermaid + 辅助数据」(D4)。需要在手感、体积(D1)和数据格式之间做取舍。

## 选项

### 选项 A:嵌入 Excalidraw,只在编辑时加载
- 优点:直接得到 Excalidraw 的手感;MIT 协议。
- 缺点:约 353KB gzip,依赖 React;没有官方的 Excalidraw → mermaid 转换。

### 选项 B:自己写轻量的结构图编辑器
- 优点:体积最小;和 mermaid 可以完全互转。
- 缺点:手感细节全部要自己做,工作量最大,也难以达到 Excalidraw 的水平。

### 选项 C:基于 React Flow 一类的流程图组件
- 优点:约 60KB;天生是「节点 + 连线」结构,转 mermaid 很自然。
- 缺点:手感像流程图工具,不像白板。

## 决定

采用 A,并且**数据格式直接用 Excalidraw 的格式,不再强制要求 mermaid**(用户 2026-11-10 决定:数据靠 git 同步,人工直接编辑文件的场景很少)。

每个图块存成两个文件:
- `<排序键>~<块id>.excalidraw`:Excalidraw 场景 JSON,是唯一的事实来源。
- `<排序键>~<块id>.svg`:每次在桌面上保存时生成的预览图。页面平时直接显示这张 SVG,不需要加载 Excalidraw;Android 端的只读显示也用它;在 git 网页上也能直接看到图。

加密 tab 中,两个文件都加上 `.age` 后缀,加密存储。

## 理由

- 用户最看重的是手感(D6),A 是唯一能直接拿到 Excalidraw 手感的方案。
- 不再要求 mermaid 之后,就省掉了自研转换器和由此带来的信息丢失(手绘、样式等无法用 mermaid 表达)。
- 预览图用 SVG,保留了 D4 的精神:不打开应用,也能在 git 里看到图。
- 由于只在编辑时加载 Excalidraw,启动速度不受影响(D1)。

## 后果

- 正面:手感不用自己做;手绘也随之免费可用。
- 负面与代价:
  - 图块的源文件是 Excalidraw 的 JSON,人读起来不如 mermaid 直观。
  - 两台设备同时改同一张图时,JSON 文件的 git 合并可能产生冲突,只能人工处理,或者整块保留一边。
  - 编辑图块期间会多占内存。项目里会引入 React,但只在图块编辑器这一个按需加载的模块里使用。
- 什么情况下应该重新审视:性能 Spike 显示编辑图块时内存占用不可接受;或者以后真的需要 mermaid,那时再加一个导出功能即可。

## 依据

- @excalidraw/excalidraw 0.18.1,MIT,peer 依赖 React 17/18/19:https://www.npmjs.com/package/@excalidraw/excalidraw
- 体积:https://bundlephobia.com/package/@excalidraw/excalidraw@0.18.1
- mermaid → Excalidraw 只有单向转换:https://github.com/excalidraw/mermaid-to-excalidraw/issues/66

