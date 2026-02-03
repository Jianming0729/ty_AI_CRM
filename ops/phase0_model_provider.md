# Phase 0: OpenClaw 模型 Provider 配置指南

为了让 OpenClaw Gateway 使用本地的 Mock 服务，需要对配置文件进行闭环配置。

## 1. 修改 OpenClaw 配置
在 `gateway/config/openclaw.json` 中，确保 `providers` 列表包含以下内容：

```json
{
  "providers": [
    {
      "id": "local-mock",
      "name": "Local Mock Provider",
      "type": "openai",
      "baseUrl": "http://localhost:8000/v1",
      "apiKey": "any-string-will-do"
    }
  ]
}
```

## 2. 环境变量 (可选)
如果 OpenClaw 支持通过环境变量覆盖，可以设置：
```bash
export OPENCLAW_DEFAULT_PROVIDER=local-mock
```

## 3. 验证步骤
1. 确保 `python local-llm/mock_provider.py` 正在运行。
2. 确保 `openclaw gateway` 已加载上述配置启动。
3. 使用 `ops/scripts/phase0_model_smoketest.sh` 进行自动化验证。
