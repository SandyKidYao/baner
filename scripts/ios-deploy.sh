#!/usr/bin/env bash
# 打出 release 版 iOS 应用,经 USB 装到连着的 iPhone 并启动。
# 用免费 Apple ID 签名:先在 Xcode → Settings → Apple Accounts 登录;签名 7 天后过期,重跑本脚本续期(覆盖安装,数据保留)。
# --skip-build:直接安装上一次的构建产物。
set -euo pipefail
cd "$(dirname "$0")/.."
IPA=src-tauri/gen/apple/build/arm64/Baner.ipa
BUNDLE_ID=dev.baner.app

if [[ "${1:-}" != "--skip-build" ]]; then
  npx tauri ios build --target aarch64 --export-method debugging
fi

# 第一台用 USB 或网络连着的真机
DEVICE=$(xcrun devicectl list devices 2>/dev/null | awk '/connected/ && /physical/ {for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/) {print $i; exit}}')
if [[ -z "$DEVICE" ]]; then
  echo "没有找到连着的 iPhone:用数据线连上,解锁并点「信任」" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
unzip -q "$IPA" -d "$TMP"
xcrun devicectl device install app --device "$DEVICE" "$TMP/Payload/Baner.app" >/dev/null
xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE_ID" >/dev/null
echo "✓ 已装到 $DEVICE 并启动"
