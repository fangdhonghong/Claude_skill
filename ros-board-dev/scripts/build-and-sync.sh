#!/usr/bin/env bash
# 板端编译 + 导出 compile_commands.json + 拉回 PC + 路径重写 + 拉回头文件
# path-agnostic：从 ~/.rosdev/rosdev.conf 读配置，不写死任何值。
# 流②（确定性哑脚本）：每次 F5 跑同样的活，AI 不掺和。
set -euo pipefail
source ~/.rosdev/rosdev.conf

# 1. 板子编译，顺手导 compile_commands.json
#    非交互 SSH 不加载 .bashrc：必须手动 source ROS 运行时，否则 find_package(rclcpp/ament_cmake) 失败。
ssh "$BOARD_ADDR" "source /opt/ros/$ROS_DISTRO/setup.bash && cd ~/$PROJ && \
    colcon build --cmake-args -DCMAKE_EXPORT_COMPILE_COMMANDS=ON -DCMAKE_BUILD_TYPE=Debug"

# 2. 拉回 compile_commands.json（绝对路径，新版 scp 不展开 ~）
TMP=$(mktemp)
scp "$BOARD_ADDR:$BOARD_HOME/$PROJ/build/compile_commands.json" "$TMP"

# 3. 路径重写：板子路径 → 本地路径（变量，无写死 IP/用户名）
sed -e "s#/opt/ros/$ROS_DISTRO#$SYSROOT/opt/ros/$ROS_DISTRO#g" \
    -e "s#$BOARD_HOME#$HOME#g" \
    "$TMP" > "$HOME/$PROJ/compile_commands.json"
rm -f "$TMP"

# 4. 拉回板子编译生成的头文件（.h/.hpp，含 .msg 生成的），喂 PC 上 clangd
#    build/install 是板子产物，PC 本地没有；不拉则自定义消息类型报红。
rsync -aL --include='*/' --include='*.hpp' --include='*.h' --exclude='*' \
    "$BOARD_ADDR:$BOARD_HOME/$PROJ/build/"   "$HOME/$PROJ/build/"
rsync -aL --include='*/' --include='*.hpp' --include='*.h' --exclude='*' \
    "$BOARD_ADDR:$BOARD_HOME/$PROJ/install/" "$HOME/$PROJ/install/"
