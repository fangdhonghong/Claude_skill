#!/usr/bin/env bash
# 从 ~/.rosdev/rosdev.conf 统一生成所有静态配置：
#   - lsyncd 配置（PC 端热同步）→ ~/.rosdev/lsyncd.conf.lua
#   - .vscode/{settings,tasks,launch}.json → $HOME/$PROJ/.vscode/
# path-agnostic：只读 conf 变量，不写死任何值。换板子/项目重跑本脚本即可。
set -euo pipefail
source ~/.rosdev/rosdev.conf

# ---- 1. lsyncd 配置（落 ~/.rosdev/）----
cat > ~/.rosdev/lsyncd.conf.lua <<EOF
settings {
    logfile    = "$HOME/.rosdev/lsyncd.log",
    statusFile = "$HOME/.rosdev/lsyncd.status",
    nodaemon   = false          -- 改 true 可前台观察同步日志
}
sync {
    default.rsync,
    source = "$HOME/$PROJ/",
    target = "$BOARD_ADDR:$BOARD_HOME/$PROJ/",
    delay = 1,
    rsync = {
        binary = "/usr/bin/rsync",
        archive = true, compress = true, verbose = true,
        _extra = {
            "--exclude=.git/", "--exclude=node_modules/",
            "--exclude=build/", "--exclude=install/",
            "--exclude=*.o", "--exclude=.vscode/"
        }
    }
}
EOF

# ---- 2. .vscode 配置（落项目里，VS Code 只认项目内的）----
VSCODE_DIR="$HOME/$PROJ/.vscode"
mkdir -p "$VSCODE_DIR"

# settings.json（无环境值，静态）
cat > "$VSCODE_DIR/settings.json" <<'EOF'
{
    "C_Cpp.intelliSenseEngine": "disabled",
    "C_Cpp.autocomplete": "disabled",
    "C_Cpp.errorSquigglies": "disabled",
    "C_Cpp.formatting": "disabled",
    "C_Cpp.enhancedColorization": "disabled",
    "C_Cpp.suggestSnippets": false,
    "[cpp]": { "editor.defaultFormatter": "llvm-vs-code-extensions.vscode-clangd", "editor.suggest.insertMode": "replace" },
    "[c]":   { "editor.defaultFormatter": "llvm-vs-code-extensions.vscode-clangd", "editor.suggest.insertMode": "replace" }
}
EOF

# tasks.json（用 $PROJ_NAME）
cat > "$VSCODE_DIR/tasks.json" <<EOF
{
    "version": "2.0.0",
    "tasks": [{
        "label": "板端编译: $PROJ_NAME",
        "type": "shell",
        "command": "bash ~/.rosdev/build-and-sync.sh",
        "group": { "kind": "build", "isDefault": true },
        "presentation": { "reveal": "always", "panel": "shared" }
    }]
}
EOF

# launch.json（用 $BOARD_HOME/$PROJ/$BINARY、$BOARD_ADDR；\${workspaceFolder} 转义保留给 VS Code）
cat > "$VSCODE_DIR/launch.json" <<EOF
{
    "version": "0.2.0",
    "configurations": [{
        "name": "板端 Debug: $PROJ_NAME",
        "type": "cppdbg",
        "request": "launch",
        "program": "$BOARD_HOME/$PROJ/$BINARY",
        "args": [],
        "stopAtEntry": false,
        "cwd": "$BOARD_HOME/$PROJ",
        "environment": [],
        "externalConsole": false,
        "MIMode": "gdb",
        "setupCommands": [
            { "description": "Enable pretty-printing for gdb", "text": "-enable-pretty-printing", "ignoreFailures": true }
        ],
        "pipeTransport": {
            "pipeCwd": "\${workspaceFolder}",
            "pipeProgram": "ssh",
            "pipeArgs": ["$BOARD_ADDR"],
            "debuggerPath": "$BOARD_HOME/$PROJ/.dev/gdb-ros.sh"
        },
        "sourceFileMap": { "$BOARD_HOME/$PROJ": "\${workspaceFolder}" },
        "preLaunchTask": "板端编译: $PROJ_NAME"
    }]
}
EOF

echo "已生成：~/.rosdev/lsyncd.conf.lua + $VSCODE_DIR/{settings,tasks,launch}.json"
if [ -z "$BINARY" ]; then
    echo "⚠️  BINARY 为空（还没节点）。launch.json 的 program 暂不完整——"
    echo "    首次 colcon build 后让 AI 补 BINARY 进 conf，再重跑 gen-configs.sh。"
fi
