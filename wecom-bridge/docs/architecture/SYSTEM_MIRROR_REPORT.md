# 🦞 Tongye WeCom Bridge: System Mirror Report (Atomic Snapshot)
**Generation Date**: 2026-02-04
**Architecture Version**: 2.1.0 (Solidified)
**Status**: Production Verified

---

## 1. 核心架构使命 (Core Mission)
WeCom Bridge 是桐叶租车 AI 客户服务体系的中枢神经系统。它不仅是一个消息转发器，更是整个生态系统的 **「全局身份锚点」**。其核心目标是：
- **身份主权归一化**：确保无论用户通过什么渠道进来，在系统中都有唯一的 `ty_uid`。
- **架构反漂移**：通过物理锁死和自检机制，防止系统在维护过程中退化。

---

## 2. 工程宪法 (Architecture Constitution)
本系统遵循以下最高原则，任何改动不得违反：

| 原则 | 详细定义 |
| :--- | :--- |
| **身份主权 (SSOT)** | 身份真相仅存在于 `ty_identity` (Postgres)。Chatwoot 仅作为 UI。 |
| **启动熔断** | `schema_version` 不匹配或 `PROFILE` 缺失，系统严禁启动。 |
| **零硬编码** | 禁止在代码中写死域名，所有 URL 必须通过 Profile 注入。 |
| **测试红线** | `governance.test.js` 必须 100% 通过，确保身份不变量。 |

---

## 3. 双引擎存储布局 (Dual-Engine Storage)

### A. 全局身份库 (PostgreSQL: ty_identity)
**地位**：全局真相源 (Single Source of Truth)
- **system_meta**: 存储 `schema_version` (2.1.0), 锁定系统架构版本。
- **users**: 存储 `ty_uid`, `handle` (如 U-000001), `actor_type` (customer, agent)。
- **identities**: 映射第三方 ID (WeCom openid) 到 `ty_uid`。
- **chatwoot_links**: 记录此身份在 CRM 侧的对应 ID。
- **user_events**: 存储身份创建、合并等审计日志。

### B. 本地状态库 (SQLite: wecom_bridge.db)
**地位**：高性能本地缓存与状态机
- **local_meta**: 本地架构版本同步。
- **conversation_state**: 存储当前会话模式 (`AI_MODE` 或 `HUMAN_MODE`)。
- **msg_dedup / outbound_dedup**: 消息去重，防止无限环路。
- **audit_log**: 记录每一条 AI 交互的输入输出。

---

## 4. 身份生成的“五条铁律” (Governance Invariants)
为了让员工理解身份管理，必须掌握以下逻辑：
1. **输入隔离**：同一 WeCom ID 多次进入，对应的 `ty_uid` 永不改变。
2. **属性无关**：用户在微信改名、换标签，系统内的 `ty_uid` 绝不刷新。
3. **格式标准**：对外展示 Handle 始终为 `角色代码-序号` (例：U-000001)。
4. **UI 对齐**：Chatwoot 表头姓名必须显示为 `Handle | 昵称`，让客服一眼看清。
5. **不可为空**：业务流转中 `ty_uid` 是必填项，空值即为架构故障。

---

## 5. 运行环境隔离 (Profile System)
系统严禁使用单一 `.env` 控制所有环境，必须指定 `PROFILE`：
- **prod_global**: 云端标准生产环境。
- **prod_cn_direct**: 中国区直连优化。
- **prod_cn_vpn**: 企业内部 VPN 隧道环境。
- **dev_local**: 开发者本地沙箱。

---

## 6. 消息生命周期 (The 7 Stages)
1. **安全接收**: WeCom 签名校验与解密。
2. **身份解析**: 将 openid 通过 `identities` 表解析为 `ty_uid`。
3. **状态判定**: 从 SQLite 读取会话模式。
4. **意图分类**: AI 判定是 FAQ、查单还是转人工。
5. **CRM 同步**: 按 `ty:ty_uid` 格式将消息推送到 Chatwoot。
6. **AI 调用**: OpenClaw (LLM) 生成建议或自动回复。
7. **最终下发**: 消息安全回复给微信用户。
