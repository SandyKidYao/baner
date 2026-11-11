#!/usr/bin/env bash
# 打出 release 版 Baner.app(ad-hoc 签名,不公证),装进 /Applications。
# --skip-build:直接安装上一次的构建产物。
set -euo pipefail
cd "$(dirname "$0")/.."
APP=target/release/bundle/macos/Baner.app
DEST=/Applications/Baner.app

if [[ "${1:-}" != "--skip-build" ]]; then npm run tauri build; fi
codesign --verify --deep --strict "$APP"

if pgrep -xq baner; then
  echo "Baner 正在运行,先退出它再安装" >&2
  exit 1
fi
rm -rf "$DEST"
ditto "$APP" "$DEST"
echo "✓ 已安装 $DEST($(du -sh "$DEST" | cut -f1))"
