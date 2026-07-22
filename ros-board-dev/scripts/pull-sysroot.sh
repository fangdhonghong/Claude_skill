#!/usr/bin/env bash
# 从板子拉 ROS sysroot 到本地（首次 + 板子 ROS 升级后重拉）。
# 拉完写包清单指纹 ~/.rosdev/sysroot.fp，作为新鲜度基线供 probe-board.sh 比对。
# path-agnostic：source ~/.rosdev/rosdev.conf
set -euo pipefail
if [ ! -f ~/.rosdev/rosdev.conf ]; then
  echo "[ERR] ~/.rosdev/rosdev.conf 不存在 —— 先跑 onboarding。"
  exit 1
fi
source ~/.rosdev/rosdev.conf

mkdir -p "$SYSROOT/opt/ros/$ROS_DISTRO"
echo "拉取 sysroot：$BOARD_ADDR:/opt/ros/$ROS_DISTRO → $SYSROOT/opt/ros/$ROS_DISTRO （约 1.5-2.5G，稍等）"
rsync -aL "$BOARD_ADDR":/opt/ros/"$ROS_DISTRO"/ "$SYSROOT/opt/ros/$ROS_DISTRO"/

# 写指纹（板子当前 ros 包清单 hash）作为新鲜度基线
ssh "$BOARD_ADDR" 'apt list --installed 2>/dev/null | grep "^ros-" | sort | md5sum' | awk '{print $1}' > ~/.rosdev/sysroot.fp
echo "完成。新鲜度指纹已写入 ~/.rosdev/sysroot.fp"
