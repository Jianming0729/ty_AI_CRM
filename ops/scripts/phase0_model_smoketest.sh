#!/bin/bash
# OpenClaw Phase 0 Model Smoketest
# Verified for OpenClaw v2026.1.30

export OPENCLAW_GATEWAY_TOKEN=9cb28ba9a404b65e797b21e5de95e88807709491dabba8c6

echo "--- STEP 1: Testing Mock Provider directly ---"
curl -s -X POST http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "input": [{"role": "user", "content": "hello"}], "stream": false}' | grep "Mock"

if [ $? -eq 0 ]; then
    echo "✅ Mock Provider is ALIVE"
else
    echo "❌ Mock Provider is DOWN"
    exit 1
fi

echo "--- STEP 2: Testing via OpenClaw Agent ---"
# Using the default model configured in openclaw.json
RESPONSE=$(openclaw agent --message "ping" --session-id "smoketest-$(date +%s)" 2>&1)
echo "$RESPONSE" | grep "【Mock】"

if [ $? -eq 0 ]; then
    echo "✅ OpenClaw E2E Connection SUCCESS"
else
    echo "❌ OpenClaw E2E Connection FAILED"
    echo "Check logs at /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log"
    exit 1
fi

echo "--- PHASE 0 VERIFIED ---"
