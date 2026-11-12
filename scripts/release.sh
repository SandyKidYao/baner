#!/usr/bin/env bash
# 发版:把版本号写进 package.json、tauri.conf.json、Cargo.toml(和两个 lock 文件),
# 提交并打 tag。推送 tag 后 .github/workflows/release.yml 会检查、构建并发布 GitHub Release。
#   scripts/release.sh 0.2.0          # 正式版
#   scripts/release.sh 0.2.0-beta.1   # 带 - 的版本发成 prerelease
set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "用法:scripts/release.sh <版本号>,例如 0.2.0" >&2
  exit 1
fi
tag="v$version"

[[ "$(git branch --show-current)" == main ]] || { echo "请在 main 分支上发版" >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "工作区有未提交的改动" >&2; exit 1; }
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && { echo "tag ${tag} 已存在" >&2; exit 1; }

npm version "$version" --no-git-tag-version --allow-same-version >/dev/null
node -e '
  const fs = require("fs"), f = "src-tauri/tauri.conf.json";
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  c.version = process.argv[1];
  fs.writeFileSync(f, JSON.stringify(c, null, 2) + "\n");
' "$version"
# 只改 [package] 里第一行 version(行首的 version = "...")
sed -i '' -E '1,/^version = /s/^version = ".*"/version = "'"$version"'"/' src-tauri/Cargo.toml
cargo update -p baner --offline -q

git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml Cargo.lock
# 版本号没变(例如首次发版)就不提交,直接给当前提交打 tag
git diff --cached --quiet || git commit -q -m "chore(release): $tag"
git tag -a "$tag" -m "Baner $tag"

echo "✓ 已提交并打好 tag ${tag}。确认无误后推送,CI 会构建并发布:"
echo "  git push origin main $tag"
