---
id: 0007
title: 界面层使用 React
status: accepted
date: 2026-11-10
supersedes:
superseded_by:
---

# ADR-0007:界面层使用 React

## 背景

界面层包括侧边轨道、分块页面、配置面板;CodeMirror 6 本身不依赖框架;Excalidraw 依赖 React(ADR-0002)。相关驱动:D1 轻快、D7 AI 协作友好。

## 选项

### 选项 A:Svelte 5
- 优点:编译产物小,运行时极小,对启动最友好。
- 缺点:项目里会同时存在两种框架(图块编辑器那个模块用 React)。

### 选项 B:React
- 优点:全项目只有一种框架;生态最大,AI 最熟,方案最稳妥。
- 缺点:React 运行时会进入启动路径,增加体积和内存(D1)。

### 选项 C:原生 TypeScript,不用框架
- 优点:最小。
- 缺点:状态管理全靠手写,维护成本最高。

## 决定

采用 B(用户 2026-11-10 决定:「先选一个比较稳妥的方案」)。Spike perf-baseline 用的就是这个组合,内存证实。用户 2026-11-10 确认改为 accepted。

## 理由

用户优先考虑稳妥:统一一个框架,降低 AI 开发和后续维护的不确定性。D1 方面的代价由 Spike 量化。

## 后果

- 正面:统一技术栈;Excalidraw 可以直接作为 React 组件接入。
- 负面与代价:启动路径上多了 React 运行时。CodeMirror 6 的编辑器实例由 React 组件包装,但编辑状态交给 CodeMirror 自己管理,避免每次按键都触发 React 重新渲染。
- 什么情况下应该重新审视:Spike 显示 React 是导致启动或内存不达标的主要原因,届时可换成 Preact 兼容层,或改用 A。

## 依据

- Excalidraw 的 React peer 依赖:https://www.npmjs.com/package/@excalidraw/excalidraw

