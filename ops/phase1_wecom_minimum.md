# Phase 1: 企业微信最小链路验证

## 1. 配置 WeCom Bridge
填写 `.env` 中的企业微信参数。

## 2. 运行 Bridge
```bash
cd wecom-bridge
node src/server.js
```

## 3. 验收标准
- 在企业微信后台配置回调 URL 指向 Bridge 端口。
- 发送文本消息，Bridge 日志显示接收成功。
