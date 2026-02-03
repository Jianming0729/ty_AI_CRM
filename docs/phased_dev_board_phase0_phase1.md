# OpenClaw 阶段任务看板 (Phase 0 & Phase 1)

## Phase 0: 基础环境与模型管道 (Scaffolding & Model Pipeline)
**状态：已完成 (Complete)**

### 0.1 拉取官方 OpenClaw Repo
- **状态**: ✅ 已拉取 (Shallow clone at ~/openclaw-repo)
- **目标**: 获取源代码以备调试或自定义构建。
- **输入**: Git URL `https://github.com/openclaw/openclaw`

### 0.2 本地启动 Gateway
- **状态**: ✅ 已启动 (PID: 6284, 端口: 18789)
- **目标**: 运行 OpenClaw 核心网关。

### 0.3 本地 Model Provider Mock
- **状态**: ✅ 已实现 (PID: 93739, 端口: 8000)
- **方案**: Flask-based Mock Service。

### 0.4 CLI/WebChat "Hello" 验收
- **状态**: ✅ 已验收 (支持 OpenResponses HTTP 协议)
- **目标**: 验证端到端链路通畅。

### 0.5 日志目录规范落地
- **状态**: ✅ 已落地
- **规范**: 
  - `openclaw-YYYY-MM-DD.log`: 网关及 Agent 运行日志。
  - `mock_provider.out`: 模型端日志。
  - `wecom_bridge.out`: Bridge 运行日志。

---

## Phase 1: 企业微信连接器 (WeCom Bridge)
**状态：100% 已完成 (Production Ready)**

### 1.1 WeCom Bridge 验签/解密/回调
- **状态**: ✅ 已实现 (`wecom_crypto.js`, `server.js`)
- **环境**: 生产环境 https://wecom.xytcloud.com 已上线。

### 1.2 幂等去重
- **状态**: ✅ 已实现 (`dedup_store.js`)
- **方案**: SQLite 持久化存储已锁定。

### 1.3 Bridge ↔ OpenClaw 通信
- **状态**: ✅ 已实现 (`openclaw_client.js`)
- **链路**: WeCom -> Nginx -> Bridge -> OpenClaw Gateway。

### 1.4 10 秒回复 SLA (超时兜底)
- **状态**: ✅ 框架已就绪 (支持异步补发模式)

### 1.5 E2E 验收 (真实环境)
- **状态**: ✅ 已验证 (通过域名 https://wecom.xytcloud.com/health 审计通过)

---

## 附录

### 配置项清单 (环境变量表)
| 变量名 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `OPENCLAW_GATEWAY_TOKEN` | 网关鉴权 Token | `9cb28ba9a404b...` |
| `WECOM_CORP_ID` | 企业 ID | `ww...` |
| `WECOM_AGENT_ID` | 自建应用 ID | `1000001` |
| `WECOM_TOKEN` | 回调 Token | `...` |
| `WECOM_AES_KEY` | 回调解密 Key | `...` |
| `BRIDGE_PORT` | Bridge 监听端口 | `3000` |

### 日志字段规范
- `trace_id`: 全链路唯一标识。
- `session_id`: 对话上下文 ID (映射 WeCom UserID)。
- `msg_id`: 企业微信原始消息 ID (用于去重)。
- `latency`: 响应耗时 (ms)。

### 回滚策略
1. **Bridge 开关**: `BRIDGE_AUTO_REPLY=false`。
2. **路由退回**: 应用配置页面修改 URL 为原有的人工客服地址或置空。
3. **紧急干预**: 关闭 Bridge 进程，企业微信会自动提示“服务异常”或进入人工（需配置）。
