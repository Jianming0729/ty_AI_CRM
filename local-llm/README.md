# Phase 0: 本地模型 Provider (Mock)

本模块提供一个轻量级的 OpenAI 兼容接口服务，用于 Phase 0 链路验证，确保 OpenClaw Gateway 能够成功调用模型。

## 1. 环境准备
- Python 3.9+
- 安装依赖：
  ```bash
  pip install flask
  ```

## 2. 启动服务
在控制台执行：
```bash
python mock_provider.py
```
服务将运行在 `http://localhost:8000`，接口地址为 `http://localhost:8000/v1/chat/completions`。

## 3. 功能说明
- **响应模式**：对于任何输入，均返回固定格式的 OpenAI 响应。
- **验证目的**：检测 OpenClaw 的 `providers` 配置是否正确，以及 Gateway 是否能成功转发请求。

## 4. Docker 运行 (可选)
```bash
docker-compose up -d
```
