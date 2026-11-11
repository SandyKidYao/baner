/// <reference types="vitest/config" />
import { cpSync, createReadStream, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Excalidraw 默认从 CDN 下载字体。Baner 离线可用、不向外发请求:开发时直接从 node_modules 提供,
// 构建时拷进产物。图块编辑器里设置 EXCALIDRAW_ASSET_PATH 指向这里(src/draw/DrawBlock.tsx)。
const FONTS = path.resolve("node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const FONTS_URL = "/excalidraw-assets/fonts";

function excalidrawFonts(): Plugin {
  let outDir = "dist";
  return {
    name: "baner-excalidraw-fonts",
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(FONTS_URL, (req, res, next) => {
        const file = path.join(FONTS, decodeURIComponent((req.url ?? "/").split("?")[0]));
        if (!file.startsWith(FONTS + path.sep) || !statSync(file, { throwIfNoEntry: false })?.isFile())
          return next();
        res.setHeader("Content-Type", "font/woff2");
        createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      cpSync(FONTS, path.join(outDir, FONTS_URL), { recursive: true });
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig(() => ({
  plugins: [react(), excalidrawFonts()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/crates/**", "**/target/**"] },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
}));
