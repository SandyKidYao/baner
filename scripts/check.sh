#!/usr/bin/env bash
# 一条命令跑全部检查。--fast:只做格式、lint、类型检查(提交前钩子用)。
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf "\n▸ %s\n" "$1"; }

step "Biome(格式 + lint)";      npx biome check .
step "TypeScript 类型检查";      npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json
step "cargo fmt";                cargo fmt --all -- --check
step "cargo clippy";             cargo clippy --workspace --all-targets -q -- -D warnings

if [[ "${1:-}" == "--fast" ]]; then echo; echo "✓ 快速检查通过"; exit 0; fi

step "Rust 测试";                cargo test --workspace -q
step "Vitest 单元测试";          npx vitest run
step "Playwright 界面冒烟测试";  npx playwright test
echo; echo "✓ 全部检查通过"
