import { defineConfig, devices } from "@playwright/test";

// 界面冒烟测试:浏览器里运行前端,核心层命令由 src/ipc/mock.ts 模拟。
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://localhost:5174" },
  webServer: {
    command: "npx vite --mode e2e --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
