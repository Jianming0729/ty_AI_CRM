#!/bin/bash
export OPENCLAW_GATEWAY_TOKEN=9cb28ba9a404b65e797b21e5de95e88807709491dabba8c6
export OPENAI_BASE_URL=http://localhost:8000/v1
export OPENAI_API_KEY=mock-key
nohup openclaw gateway --port 18789 --allow-unconfigured > /tmp/openclaw_gw.out 2>&1 &
sleep 5
lsof -i :18789
