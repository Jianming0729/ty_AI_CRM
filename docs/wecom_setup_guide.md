# 企业微信 API 配置指南 (WeCom API Setup Guide)

为了让你的 WeCom Bridge 在真机环境下正常工作，你需要完成以下配置。

---

## 1. 获取公网地址 (Public URL)

企业微信的回调必须通过公网访问。

### 选项 A: 使用 ngrok (推荐)
1. 下载并安装 [ngrok](https://ngrok.com/)。
2. 在终端运行：
   ```bash
   ngrok http 3001
   ```
3. 复制生成的 `https://xxxx.ngrok-free.app` 地址。

### 选项 B: 使用其他穿透工具
可以使用 `frp`、`cpolar` 或 `Cloudflare Tunnel`，确保目标端口指向 `3001`。

---

## 2. 企业微信后台配置步骤

1. **登录后台**: 访问 [企业微信管理后台](https://work.weixin.qq.com/)。
2. **创建/选择应用**:
   - 点击 **应用管理** -> **应用** -> **自建**。
   - 创建一个新的应用（如“AI 助手”）。
3. **设置 API 接收**:
   - 在应用详情页，找到 **接收消息** 部分，点击 **设置 API 接收**。
   - **URL**: 填写你的公网地址 + `/wechat`（例如：`https://xxxx.ngrok-free.app/wechat`）。
   - **Token**: 点击“随机获取”或自己填一个字符串（必须与 `.env` 中的 `WECOM_TOKEN` 一致）。
   - **EncodingAESKey**: 点击“随机获取”（必须与 `.env` 中的 `WECOM_AES_KEY` 一致）。
4. **保存验证**:
   - 确保你的 Bridge 服务已启动（`node src/server.js`）。
   - 点击“保存”。企业微信会发送一个 GET 请求到你的 URL 进行验证。如果返回 `success` 或 `echostr`，则配置成功。

---

## 3. 更新环境变量 (.env)

确保 `wecom-bridge/.env` 中的值与企微后台一致：

```env
# 企业微信配置
WECOM_TOKEN=你在企微后台设置的Token
WECOM_AES_KEY=你在企微后台设置的EncodingAESKey
WECOM_CORP_ID=你的企业ID (在“我的企业” -> “企业信息”底部查看)

# OpenClaw 配置
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=9cb28ba9a404b65e797b21e5de95e88807709491dabba8c6

# 服务配置
PORT=3001
```

---

## 4. 故障排查

- **验证失败 (405 Method Not Allowed)**: 
  - 确保你的 Bridge 服务正在运行且端口正确。
  - 检查 URL 是否填写了正确的协议 (https) 和路径 (/wechat)。
- **签名验证失败 (Invalid Signature)**:
  - 检查 Token 和 EncodingAESKey 是否完全一致。
  - 检查 CorpID 是否填写正确。
- **消息收不到**:
  - 确保你的应用有权限接收消息。
  - 检查“可接收消息的人员范围”。

---

## 5. 高级配置 (已自动完成)

我们已将消息去重升级为 **SQLite 持久化存储**。
- 数据库文件位置: `wecom-bridge/wecom_bridge.db`
- 此配置可确保服务重启后，1 小时内的消息 ID 不会被重复处理，有效防止企业微信的 5s 重试机制导致的重复回复。
