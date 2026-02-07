# 🦞 Tongye WeCom Bridge: System Mirror Report (Atomic Snapshot V3.0)
**Generation Date**: 2026-02-05
**Architecture Version**: 3.0.0 (Distributed Intelligence)
**Status**: Production Verified & SRE Hardened

---

## 1. 核心架构使命 (Core Mission V3)
WeCom Bridge 演进为 **「分布式流量中枢」**。它不再仅仅连接微信与 CRM，而是协同 7 大卫星模块（External Satellites）构建一个具备自愈能力和工程治理约束的智能客服生态。

### 核心演进点：
*   **从单体到分布式**：智能体大脑、记忆、性格分属于不同模块（Local-LLM, KB, Intent-Processor）。
*   **架构物理熔断**：引入 `bootstrap.js` 对 PostgreSQL (ty_identity) 和 SQLite 的版本进行强一致性校验。
*   **全域身份主权 (SSOT)**：所有用户行为均锚定于全局唯一的 `ty_uid` 及 `Handle`（如 U-000001）。

---

## 2. 工程宪法 (Architecture Constitution V3)

| 原则 | 详细定义 | 物理实现 |
| :--- | :--- | :--- |
| **启动熔断** | `schema_version` 不匹配严禁启动。 | `bootstrap.js` |
| **业务红线** | 禁止 AI 操作取消订单/退款。 | `server.js` (L133 Deny-List) |
| **模式锁存** | 人工介入后 AI 必须“闭嘴”。 | `state_store.js` + SQLite |
| **身份一致性** | 界面强制显示 Handle 前缀。 | `chatwoot_client.js`: `Handle | Nickname` |

---

## 3. 卫星子系统矩阵 (Satellite Subsystems)

| 模块 | 职责 | 当前状态 |
| :--- | :--- | :--- |
| **gateway/** | OpenClaw 网关，负责 AI 路由与技能调度。 | **ACTIVE** |
| **local-llm/** | 本地推理大脑 (`mock_provider.py`)，支持流式输出。 | **ACTIVE** |
| **kb/** | 存放原始业务政策 Markdown (RAG 源头)。 | **STRUCTURED** |
| **eval/** | 100 条原子级测试用例，用于回归验证。 | **PLANNED** |
| **rag-service/** | 向量化检索服务 (pgvector / FAISS)。 | **PLANNED** |
| **rental-tools/** | 租车业务 API 适配器 (库存/价格/订单)。 | **ADAPTERS** |
| **skills/** | 智能体技能插件 (发票生成/保险推荐)。 | **MODULAR** |

---

## 4. 存储布局 (The Dual-Engine Persistence)

### A. 全局身份库 (PostgreSQL: ty_identity)
*   **system_meta**: 版本锁关键表。
*   **users/identities**: 身份映射与角色分配。
*   **chatwoot_links**: 缓存联系人与会话映射。

### B. 本地状态库 (SQLite: wecom_bridge.db)
*   **conversation_state**: 锁定 `AI_MODE` 或 `HUMAN_MODE`。
*   **msg_dedup**: 确保 100% 幂等。
*   **audit_log**: 录入每一步 Q&A，用于 `eval` 回归。

---

## 5. 消息生命周期 (Atomic Flow Stages)
1.  **Decrypt**: 企微 XML 消息解密。
2.  **Identity**: 解析 `ty_uid`，同步 CRM 联系人。
3.  **Intent**: 多级意图分类（FAQ/Order/Human）。
4.  **Policy Check**: 触发业务阻断器 (退款拦截)。
5.  **State Logic**: 检核会话模式锁定。
6.  **AI completion**: 经 OpenClaw 路由至本地 Mock-LLM 检索知识。
7.  **Final Push**: 同步私有便笺至 CRM，加密回复发至企微。
