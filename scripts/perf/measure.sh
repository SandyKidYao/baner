#!/usr/bin/env bash
# 冷启动与空闲内存实测(mvp 成功标准 D1)。方法与 Spike perf-baseline 相同:
# - 启动:从 `open -a` 到应用出现第一个屏幕上的窗口(Baner 在内容就绪后才显示窗口)。
# - 内存:启动后静置 IDLE 秒,把 .app 里的进程和启动后新出现的 com.apple.WebKit.* 进程的 footprint 相加。
#
# 用法:scripts/perf/measure.sh [-n 次数=8] [-i 静置秒数=10] <App 路径>=<窗口所属的应用名> ...
#   例:scripts/perf/measure.sh /Applications/Baner.app=Baner /Applications/Heynote.app=Heynote
# 多个应用逐次交替启动,让它们承受相同的机器负载(负载对启动时间影响很大)。
# 每次测完用 AppleScript 正常退出应用。每个应用的第一次启动含系统校验,不计入中位数。
set -euo pipefail
RUNS=8; IDLE=10
while getopts "n:i:" o; do case $o in n) RUNS=$OPTARG ;; i) IDLE=$OPTARG ;; *) exit 2 ;; esac; done
shift $((OPTIND - 1))
[[ $# -gt 0 ]] || { sed -n '2,9p' "$0"; exit 2; }
# VS Code 等环境里的这个变量会让 Electron 应用(HeyNote)以 Node 方式运行并立刻退出
unset ELECTRON_RUN_AS_NODE

HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${TMPDIR:-/tmp}/baner-winwait"
[[ "$BIN" -nt "$HERE/winwait.swift" ]] || swiftc -O -o "$BIN" "$HERE/winwait.swift" 2>/dev/null

running() { pgrep -f "$1/Contents/MacOS/" >/dev/null; }
kb() { # 进程的 footprint(KB)
  footprint -p "$1" 2>/dev/null | awk '/Footprint:/ {
    for (i = 1; i <= NF; i++) if ($i == "Footprint:") { v = $(i+1); u = $(i+2) }
    if (u == "MB") v *= 1024; else if (u == "GB") v *= 1048576; else if (u == "B") v /= 1024
    printf "%d\n", v; exit }'
}
median() { printf '%s\n' "$@" | sort -n | awk '{a[NR]=$1} END { print (NR%2 ? a[(NR+1)/2] : (a[NR/2]+a[NR/2+1])/2) }'; }

apps=(); owners=()
for spec in "$@"; do
  apps+=("${spec%%=*}"); owners+=("${spec#*=}")
  if running "${spec%%=*}"; then echo "${spec#*=} 正在运行,先退出再测" >&2; exit 1; fi
done

starts=(); mems=()
echo "负载:$(uptime | sed 's/.*load averages*: //')"
for n in $(seq 1 "$RUNS"); do
  for k in "${!apps[@]}"; do
    app=${apps[$k]}; owner=${owners[$k]}
    before=$(pgrep -f 'com.apple.WebKit' | sort || true)
    ms=$("$BIN" "$app" "$owner") || { echo "$owner:窗口没有出现($ms)" >&2; exit 1; }
    sleep "$IDLE"
    after=$(pgrep -f 'com.apple.WebKit' | sort || true)
    pids="$(pgrep -f "$app/Contents/" || true) $(comm -13 <(echo "$before") <(echo "$after"))"
    total=0
    for p in $pids; do total=$((total + $(kb "$p" || echo 0))); done
    mb=$(awk "BEGIN { printf \"%.1f\", $total / 1024 }")
    printf '第 %d 次 %-8s 启动 %5sms  空闲内存 %6sMB\n' "$n" "$owner" "$ms" "$mb"
    if [[ $n -gt 1 ]]; then starts[k]="${starts[k]:-} $ms"; fi
    mems[k]="${mems[k]:-} $mb"
    osascript -e "quit app \"$app\"" >/dev/null 2>&1 || true
    for _ in $(seq 1 50); do running "$app" || break; sleep 0.2; done
    sleep 2
  done
done
echo "负载:$(uptime | sed 's/.*load averages*: //')"
for k in "${!apps[@]}"; do
  # shellcheck disable=SC2086
  echo "${owners[$k]}:启动中位数 $(median ${starts[k]})ms(第 2~$RUNS 次);空闲内存中位数 $(median ${mems[k]})MB"
done
