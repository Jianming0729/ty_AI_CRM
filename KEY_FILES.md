# 🔑 KEY FILES DASHBOARD (项目导航总表)

> **首席架构师指令**：本文件是开发者进入项目的“第一入口”。它定义了物理资产的权威等级，禁止在非指定文件内进行核心逻辑越权修改。

---

## 🧬 原子内核层 (The Nucleus - SSOT)
定义系统当前状态的终极真相源，是所有治理动作的基准。

*   **系统状态镜像 (System Snapshot)**: [`docs/SYSTEM_ATOM_SNAPSHOT.json`](docs/SYSTEM_ATOM_SNAPSHOT.json) —— **SSOT**, 记录全量元数据与配置。
*   **安全宪法 (Constitution)**: [`docs/governance_sync_v3.md`](docs/governance_sync_v3.md) —— **SSOT**, 定义全域保护区与代码修改的法律边界。
*   **权威字段手册 (Field Manual)**: [`docs/identity_governance_standard.md`](docs/identity_governance_standard.md) —— **SSOT**, 业务字段与口径的唯一标准。

---

## 🏗️ 核心基建层 (Architecture & Core)
支撑系统运转的骨干代码，非必要严禁变动。

*   **网关/入口 (Entry)**: [`wecom-bridge/src/server.js`](wecom-bridge/src/server.js) —— 全局请求分发与安全过滤中枢。
*   **适配/防腐层 (Adapter)**: [`wecom-bridge/src/chatwoot_client.js`](wecom-bridge/src/chatwoot_client.js) —— 隔离外部污染，由于对接 Chatwoot 并非中枢，此层至关重要。
*   **数据内核 (Kernel)**: [`wecom-bridge/src/state_store.js`](wecom-bridge/src/state_store.js) —— 统一数据获取逻辑、状态机与持久化中枢。

---

## 📜 治理与指令集 (Governance & Prompts)
定义人机协作的协议，确保 AI 与人类在同一逻辑频率工作。

*   **AI 更新协议 (AI Protocols)**: [`.agent/workflows/governance-sync.md`](.agent/workflows/governance-sync.md) —— **AI 必读**，规范 PR 行为。
*   **架构白皮书 (Whitepaper)**: [`docs/system_architecture_v3.md`](docs/system_architecture_v3.md) —— 描述系统拓扑、数据流向与设计哲学。
*   **标准化脚本 (Scripts)**: [`wecom-bridge/deploy_to_cloud.sh`](wecom-bridge/deploy_to_cloud.sh) —— 用于生产同步与治理的自动化工具。

---

## 📝 决策与追溯 (Decisions & Lineage)
记录系统进化的“思想轨迹”。

*   **架构决策记录 (ADR)**: [`docs/adr/README.md`](docs/adr/README.md) —— 记录重大设计方案的取舍原因。
*   **演进日志 (Changelog)**: [`ACTIVE_INDEX.md#演进志`](ACTIVE_INDEX.md#演进志) —— **[SSOT 引用]** 统一追溯点，记录项目治理的关键节点。

---

## 🛰️ 角色映射
- **开发者**: 侧重 **Architecture & Core**。
- **运维/SRE**: 侧重 **The Nucleus** 与 **Scripts**。
- **AI 助手**: 必须执行 **Governance & Rules**。

---
**核准签发**：项目首席架构师  
**状态**：ACTIVE / SSOT ALIGNED
