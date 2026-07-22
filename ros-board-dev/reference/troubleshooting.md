# 排查表

> 按症状找。板端操作标「板端：」，PC 端标「PC：」。先跑 `~/.rosdev/probe-board.sh` 看全貌，按 `[MISS]`/`[STALE]` 补。

| 症状 | 怎么办 |
|------|--------|
| `probe-board.sh` 报 `[ERR] conf 不存在` | 先跑 onboarding（SKILL.md §3）填 `~/.rosdev/rosdev.conf` |
| ping 不通板子 | 确认 PC 跟板子同路由器；查 `rosdev.conf` 的 `BOARD_HOST`；查网线；跨局域网用 Tailscale（`BOARD_HOST` 填 Tailscale IP） |
| SSH 连不上 | 板端：`sudo systemctl status ssh` 看 active；确认 `BOARD_USER@BOARD_HOST` 对 |
| 免密未通（probe `[MISS]`） | PC：`ssh-copy-id "$BOARD_ADDR"` |
| rsync 同步失败 | 两边都装 rsync 了吗？`$HOME/$PROJ` 和板子 `~/$PROJ` 都在吗？ |
| lsyncd 不触发 | 把 `~/.rosdev/lsyncd.conf.lua` 的 `nodaemon` 改 `true` 前台跑，看日志输出 |
| lsyncd 没在跑（probe `[MISS]`） | `hzhy` 启动；或 `lsyncd ~/.rosdev/lsyncd.conf.lua` |
| VS Code 报 JSON 解析错误 | `.vscode/` 下 JSON 不支持 `--` 注释，只能 `//` 或 `/* */`（本 skill 生成的不含 `--`；若手动改过注意） |
| clangd 对 ROS API 报红 | sysroot 拉了吗（probe 报 `[OK]`）？build-and-sync 跑过吗（生成 compile_commands.json）？`rosdev.conf` 路径重写值对吗？ |
| 找不到 `build/compile_commands.json` | colcon 有时合并到 `build/compile_commands.json`，有时按包分散。AI 应 `ssh "$BOARD_ADDR" 'find ~/$PROJ/build -name compile_commands.json'` 自动发现真实路径 |
| 调试器连不上 | 板端 `/usr/bin/gdb` 在吗？`launch.json` 的 `pipeArgs` 里 `$BOARD_ADDR` 生成对吗？`gdb-ros.sh` 推到板子且 +x 了吗（probe 查）？ |
| 调试时节点在 `rclcpp::init` 崩 | 缺 ROS 运行时环境。确认 `gdb-ros.sh` 先 source 了 `install/setup.bash`，且 `debuggerPath` 指向它 |
| VS Code 不认非标准 `debuggerPath` | 退回 `"/usr/bin/gdb"`，改用 `ros2 run --prefix='gdb' <包> <节点>` 调试 |
| sysroot 反复报 `[STALE]` | 跑 `pull-sysroot.sh` 重拉 + 刷新指纹基线 |
| 非 ROS2 项目误用本 skill | 本 skill ROS2 专属。非 ROS 项目把 build-and-sync 的 `colcon build` 换成你的编译命令，用 `bear -- <编译>` 或 `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON` 生成 compile_commands |
