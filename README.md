# 桐叶租车智能客服系统 (ty_AI_CRM)

基于 OpenClaw 框架的下一代租车智能客服与销售 Agent 系统。

## 🚀 项目进度 (Phase 6.2 - 2026.02)
目前系统已进入 **生产级身份对齐与双库稳态** 阶段。

## 🏗 项目结构
- **`/wecom-bridge`**: 本项目的核心中枢。实现了 **企业微信 <-> Chatwoot** 的高可靠闭包。
  - **双数据库架构**：PostgreSQL (全局身份 `ty_identity`) + SQLite (本地去重与状态)。
- **`/gateway`**: OpenClaw 运行与控制平面。
- **`/docs`**: 包含全局架构设计、[身份服务规范](wecom-bridge/docs/api/identity_api_v1.md)及[工程治理规则](wecom-bridge/docs/architecture/governance.md)。

## 🛠 技术栈
- **后端**: Node.js v22 (Bridge), Python 3.12 (Mock Provider)
- **数据库**: PostgreSQL 16+, SQLite 3
- **CRM**: Chatwoot (生产环境部署)
- **底层框架**: OpenClaw Gateway

## 📖 核心文档
- [WeCom Bridge 架构说明书](wecom-bridge/docs/architecture/spec.md)
- [WeCom Bridge 工程治理体系](wecom-bridge/docs/architecture/governance.md)

---
*Verified by Antigravity at 2026-02-04 08:08 (Phase 6.2 Dual-DB Release)*
