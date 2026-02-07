# NotebookLM 员工培训素材包清单 (Manifest V3.0)

您可以将以下 **V3 版文件** 上传至 NotebookLM，它将能够基于最新的分布式智能架构，生成高度准确的培训手册、问答对和操作指南。

### 1. 核心架构与事实 (必传)
*   **`docs/SYSTEM_MIRROR_REPORT.md`** (V3.0 原子级镜像报告)
*   **`docs/system_architecture_v2.md`** (已升级至 V3.0 的技术架构规范)
*   **`wecom-bridge/knowledge_base.json`** (当前 AI 的真实“记忆库”内容)

### 2. 治理与深度参考
*   **`docs/identity_governance_standard.md`** (身份主权原则)
*   **`docs/notebooklm/` 目录下的全套深度解析文件**：
    *   `01_FULL_PROJECT_MANIFEST_V3.md` (全量文件映射)
    *   `04_SATELLITE_SUBSYSTEMS_V3.md` (7 大卫星模块深度参考)
    *   `05_CROSS_MODULE_DATA_FLOW_V3.md` (跨模块交互流程)

### 3. NotebookLM 引导指令 (Pro-Tip)
在上传完上述文件后，建议针对新加入的 **“卫星模块”** 和 **“分布式智能”** 进行提问：

> “请基于《Satellite Subsystems Reference》，解释 `local-llm` 与 `gateway` 的关系，以及为什么智能体不能直接连接到微信？”

> “如果一个用户在聊天中提到了‘退款’，系统会如何在 `server.js` 中拦截这个动作？请描述相关的治理原则。”

---
**核心差异 (V2 vs V3)：**
V3 版本不再是孤立的 Bridge 文档，它将系统的每一个外部齿轮（eval, rental-tools, skills 等）都纳入了逻辑版图，确保 NotebookLM 理解系统的 **“横向扩展能力”**。
