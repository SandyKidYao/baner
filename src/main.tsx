import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./theme/tokens.css";
import "./theme/base.css";

async function boot() {
  if (import.meta.env.VITE_MOCK_IPC === "1") {
    const { installMockIpc } = await import("./ipc/mock");
    installMockIpc();
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
}
boot();
