# WeCom Bridge v2.0.0

## 🚀 项目定位
本系统是企业微信与 Chatwoot CRM 之间的关键中间件（Bridge），实现了基于 OpenClaw 框架的 **AI-Human 混合客服中枢**。

## 🛠 技术栈 (Technology Stack)
- **Runtime**: Node.js v22+ (Alpine based Docker)
- **Framework**: Express.js
- **Databases**:
  - **PostgreSQL**: 全局身份管理 (`ty_identity`) 与 审计留痕。
  - **SQLite**: 本地会话状态 (`AI/Human`) 与 消息去重。
- **AI Core**: OpenClaw Gateway + Mock LLM Provider
- **Infrastructure**: Docker Compose, Nginx Proxy, Cloudflare Tunnel (Optional)

## 🏗 系统架构
本项目采用**双数据库耦合架构**，平衡全局一致性与本地性能。

### 1. 存储设计
- **身份层 (Postgres)**: 负责 `ty_uid` 映射，确保跨渠道（企微、App、Web）身份唯一。
- **状态层 (SQLite)**: 负责毫秒级去重（Dedup）与会话生命周期管理。

### 2. 链路概览
- **入站**: `WeCom -> Bridge (Decrypt -> Resolve Identity -> Dedup) -> Chatwoot`
- **出站**: `Chatwoot (Webhook) -> Bridge (Dedup -> AI/Human Logic) -> WeCom`

> 详细文档请参考：
> - [系统架构说明书 (Architecture Spec)](docs/architecture/spec.md)
> - [工程治理体系规则 (Governance Rules)](docs/architecture/governance.md)

## 🔧 快速启动

### 环境变量配置
参考 `.env.example` 配置环境变量：
- `PG_HOST`: 建议指向 Docker 容器名或内网 IP。
- `CHATWOOT_BASE_URL`: 内部通讯推荐使用 `http://chatwoot-chatwoot-1:3000`。

### 部署
```bash
docker compose up -d --build
```

---
*Verified by Antigravity at 2026-02-04 (Phase 6.2 - Dual-DB Stability Release)*
