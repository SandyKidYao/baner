import { useCallback } from "react";
import { TabEditor } from "../blocks/TabEditor";
import { appReady } from "../ipc";

const TAB = "default"; // 多 tab 在 backlog 第 2 项加入

export default function App() {
  // 隐藏窗口里不执行 requestAnimationFrame,所以用 setTimeout 触发显示(见 Spike perf-baseline)
  const onReady = useCallback(() => setTimeout(() => appReady().catch(() => {}), 0), []);
  return (
    <div className="app">
      <main className="page">
        <TabEditor tab={TAB} onReady={onReady} />
      </main>
      <footer className="keys">
        <span>
          <kbd>⌘↵</kbd> 新块
        </span>
        <span>
          <kbd>⌘A</kbd> 选块
        </span>
      </footer>
    </div>
  );
}
