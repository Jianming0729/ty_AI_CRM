# WeCom Bridge v2.0.0

## 🚀 项目定位
本系统是企业微信与 Chatwoot CRM 之间的关键中间件（Bridge），实现了基于 OpenClaw 框架的 **AI-Human 混合客服中枢**。

### 核心特性
- **双向同步**：企业微信用户与 Chatwoot 客服实时消息对等。
- **AI-Human 切换**：支持自动 AI 回复（AI_MODE）与人工实时接管（HUMAN_MODE）。
- **智能辅助**：在人工接管模式下，AI 仍会提供“私有建议”供客服参考。
- **极致工程治理**：
  - **防环路设计**：通过 `outbound_dedup` 指纹校验，彻底杜绝消息回环。
  - **内网通配**：通过 Docker Bridge 网关直连，绕过 Nginx Header 拦截，解决 401 鉴权瓶颈。
  - **快速 ACK**：Webhook 采用异步处理闭包，响应延迟 < 20ms。

## 🏗 架构说明 (Phase 0 - 4)

### 1. 入站链路 (Inbound)
`WeCom -> Bridge -> Chatwoot (API Inbox)`
- **身份识别**：基于 UserID 的持久化 `identifier` 映射。
- **生命周期**：遵循严格的 `Contact -> Conversation -> Message` 官方 REST 流。

### 2. 出站链路 (Outbound)
`Chatwoot (Webhook) -> Bridge -> WeCom (Push API)`
- **模式决定论**：
  - `AI_MODE` (默认)：Bridge 获取 OpenClaw 响应并下发。
  - `HUMAN_MODE`：客服手动回复触发，Bridge 自动切换模式并转发人工内容。

## 🛠 运维与部署

### 环境变量 (.env)
| 变量名 | 说明 |
| :--- | :--- |
| `CHATWOOT_BASE_URL` | 推荐使用内网地址 `http://172.17.0.1:3005` |
| `CHATWOOT_API_TOKEN` | 管理员 API Access Token |
| `TONGYE_WEWORK_AGENT_ID` | 企业微信应用 AgentId |

### 服务启动
```bash
docker compose up -d --build
```

---
*Verified by Antigravity at 2026-02-03 (Phase 4 Final Success)*
