#!/bin/bash

# =================================================================
# OpenClaw Phase 0 Setup Script (macOS Apple Silicon)
# =================================================================

PROJECT_ROOT="/Users/jianmingwang/Desktop/ty_AI_CRM"
GATEWAY_DIR="$PROJECT_ROOT/gateway"
LOG_DIR="$GATEWAY_DIR/logs"
CONF_FILE="$GATEWAY_DIR/config/openclaw.json"

echo "🚀 Starting Phase 0 Setup for Tongye AI CRM..."

# 1. 基础环境检查
echo "🔍 Checking dependencies..."
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js >= 22."
    exit 1
fi

# 2. 端口冲突检查
DEFAULT_PORT=18789
echo "🛰️ Checking port $DEFAULT_PORT..."
PORT_OWNER=$(lsof -t -i :$DEFAULT_PORT)
if [ ! -z "$PORT_OWNER" ]; then
    echo "⚠️ Warning: Port $DEFAULT_PORT is already in use by PID $PORT_OWNER."
    echo "建议杀掉进程或修改配置后的端口。"
fi

# 3. 配置令牌 (不写入 Git)
if [ -z "$CLAWDBOT_GATEWAY_TOKEN" ]; then
    export CLAWDBOT_GATEWAY_TOKEN=$(openssl rand -hex 16)
    echo "🔑 Generated temp GATEWAY_TOKEN: $CLAWDBOT_GATEWAY_TOKEN"
    echo "请将其添加到您的 .env 文件或终端会话中。"
fi

# 4. 生成或核对配置
if [ ! -f "$CONF_FILE" ]; then
    echo "📄 Creating default config at $CONF_FILE..."
    cat <<EOF > "$CONF_FILE"
{
  "gateway": {
    "port": $DEFAULT_PORT,
    "address": "127.0.0.1",
    "token": "$CLAWDBOT_GATEWAY_TOKEN"
  },
  "debug": true
}
EOF
fi

# 5. 安装命令检查 (如果尚未全局安装)
if ! command -v openclaw &> /dev/null; then
    echo "📦 Installing OpenClaw CLI globally..."
    npm install -g openclaw@latest
fi

# 6. 冒烟测试指引
echo "---------------------------------------------------"
echo "✅ Setup Base Complete."
echo ""
echo "👉 Step 1: 启动 Mock 模型 (在另一个窗口):"
echo "   python $PROJECT_ROOT/local-llm/mock_provider.py"
echo ""
echo "👉 Step 2: 启动 OpenClaw Gateway:"
echo "   openclaw onboard --config $CONF_FILE"
echo ""
echo "👉 Step 3: 进行对话验收:"
echo "   openclaw agent --message \"hello\""
echo "---------------------------------------------------"

# 7. 退出状态
exit 0
