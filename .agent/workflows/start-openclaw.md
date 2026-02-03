---
description: how to start OpenClaw and the Mock Provider for local development
---

Follow these steps to start the local OpenClaw environment:

1. **Start the Mock LLM Provider**:
   // turbo
   ```bash
   nohup python3 /Users/jianmingwang/Desktop/ty_AI_CRM/local-llm/mock_provider.py > /tmp/mock_provider.out 2>&1 &
   ```

2. **Start the OpenClaw Gateway**:
   // turbo
   ```bash
   export OPENCLAW_GATEWAY_TOKEN=9cb28ba9a404b65e797b21e5de95e88807709491dabba8c6
   nohup openclaw gateway --port 18789 --allow-unconfigured > /tmp/openclaw_gw.log 2>&1 &
   ```

3. **Verify the Services**:
   // turbo
   ```bash
   bash /Users/jianmingwang/Desktop/ty_AI_CRM/ops/scripts/phase0_model_smoketest.sh
   ```

4. **Interact with the Agent**:
   ```bash
   export OPENCLAW_GATEWAY_TOKEN=9cb28ba9a404b65e797b21e5de95e88807709491dabba8c6
   openclaw agent --message "Your message here"
   ```
