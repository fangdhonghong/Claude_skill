#!/usr/bin/env bash
# ros-board-dev 幂等探针：探测每个 setup 步骤的状态，供 AI「只补缺的」。
# PC 端运行：SSH 探板子 + 本地查 PC 状态。
# 故意不用 set -e —— 预期部分检查会 fail，那正是要找的缺口。
# 输出标签：[OK] 已做 / [MISS] 待做 / [STALE] 过期需更新
# AI 读 [MISS]/[STALE] 行，决定补哪步（板端写=打印给用户敲，PC 端=AI 自动跑）。

if [ ! -f ~/.rosdev/rosdev.conf ]; then
  echo "[ERR] ~/.rosdev/rosdev.conf 不存在 —— 先跑 onboarding 填配置。"
  exit 1
fi
source ~/.rosdev/rosdev.conf

sshb() { ssh "$BOARD_ADDR" "$@" 2>/dev/null; }

echo "=== ros-board-dev 幂等探测 ==="

echo "[板端]"
if sshb 'systemctl is-active ssh' | grep -q active; then
  echo "  [OK] ssh 服务运行"
else
  echo "  [MISS] openssh-server 未装/未起 → 板端：sudo apt install openssh-server && sudo systemctl enable --now ssh"
fi
if sshb 'command -v rsync' >/dev/null; then
  echo "  [OK] 板端 rsync"
else
  echo "  [MISS] 板端 rsync 未装 → 板端：sudo apt install rsync"
fi
if ssh -o BatchMode=yes -o ConnectTimeout=5 "$BOARD_ADDR" 'true' 2>/dev/null; then
  echo "  [OK] SSH 免密登录"
else
  echo "  [MISS] 免密未通 → PC：ssh-copy-id $BOARD_ADDR"
fi
if sshb "test -d \"\$HOME/$PROJ\"" 2>/dev/null; then
  echo "  [OK] 板上项目目录 ~/$PROJ"
else
  echo "  [MISS] 板上缺 ~/$PROJ → 板端：mkdir -p ~/$PROJ"
fi
if sshb "test -x \"\$HOME/$PROJ/.dev/gdb-ros.sh\"" 2>/dev/null; then
  echo "  [OK] 板端 gdb-ros.sh"
else
  echo "  [MISS] 板端缺 gdb-ros.sh → 需生成并推送（setup 步骤7）"
fi

echo "[PC 端]"
command -v lsyncd >/dev/null && echo "  [OK] lsyncd 已装" || echo "  [MISS] lsyncd 未装 → sudo apt install lsyncd"
[ -f ~/.rosdev/lsyncd.conf.lua ] && echo "  [OK] lsyncd 配置已生成" || echo "  [MISS] lsyncd 配置未生成 → 跑 gen-configs.sh"
pgrep -u "$USER" lsyncd >/dev/null && echo "  [OK] lsyncd 运行中" || echo "  [MISS] lsyncd 未运行 → hzhy"
command -v code >/dev/null && echo "  [OK] VS Code 已装" || echo "  [MISS] VS Code 未装"

# sysroot + 新鲜度（指纹法：板子 ros 包清单 hash vs 拉取时存的 ~/.rosdev/sysroot.fp）
SYSROOT_FP="$HOME/.rosdev/sysroot.fp"
if [ -d "$SYSROOT/opt/ros/$ROS_DISTRO" ]; then
  BOARD_FP=$(sshb 'apt list --installed 2>/dev/null | grep "^ros-" | sort | md5sum' | awk '{print $1}')
  if [ ! -f "$SYSROOT_FP" ]; then
    echo "  [STALE] sysroot 存在但无指纹（拉取时没记录）→ 跑 pull-sysroot.sh 建立基线"
  elif [ -n "$BOARD_FP" ] && [ "$BOARD_FP" = "$(cat "$SYSROOT_FP")" ]; then
    echo "  [OK] sysroot 新鲜（板子 ros 包指纹一致）"
  else
    echo "  [STALE] sysroot 过期（板子 ros 包清单变了）→ 跑 pull-sysroot.sh 重拉"
  fi
else
  echo "  [MISS] 本地 sysroot 不存在 → 跑 pull-sysroot.sh 从板子拉"
fi

[ -f "$HOME/$PROJ/compile_commands.json" ] && echo "  [OK] compile_commands.json 已生成" || echo "  [MISS] compile_commands.json 缺 → 跑 build-and-sync.sh"
for f in settings tasks launch; do
  [ -f "$HOME/$PROJ/.vscode/$f.json" ] && echo "  [OK] .vscode/$f.json" || echo "  [MISS] .vscode/$f.json 缺 → 跑 gen-configs.sh"
done

echo "=== 探测结束（[MISS]/[STALE] 项即待补步骤）==="
