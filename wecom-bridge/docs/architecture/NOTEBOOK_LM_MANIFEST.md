# NotebookLM 员工培训素材包清单 (Manifest)

您可以将以下文件上传至 NotebookLM，它将能够基于这些“原子级”的事实，生成高度准确的培训手册、问答对和操作指南。

### 1. 核心系统文档 (必传)
- `docs/architecture/SYSTEM_MIRROR_REPORT.md` (刚才生成的全景镜像报告)
- `docs/architecture/spec.md` (系统架构规范与“工程宪法”)
- `docs/architecture/governance.md` (治理原则与身份主权定义)

### 2. 数据库与技术细节 (供深度培训使用)
- `docs/api/identity_api_v1.md` (身份 API 接口定义)
- `wecom-bridge/package.json` (项目依赖与技术栈清单)

### 3. NotebookLM 引导指令 (Pro-Tip)
在上传完上述文件后，您可以尝试对 NotebookLM 说：
> “请基于上传的《System Mirror Report》，为公司新入职的客服人员编写一份《身份治理基础知识手册》。重点解释为什么 Handle (如 U-000001) 对业务如此重要，以及在哪两个位置可以看到它们。”

> “请为运维工程师生成一份《系统启动自检排查清单》，解释如果系统因为 schema_version 不匹配而挂起，应该如何修复。”

---
**为什么这份资料是“原子级”的？**
因为它包含了数据库真实的字段名、系统锁定的版本号、以及物理代码实现的逻辑。NotebookLM 不会“幻觉”虚假的功能，而是基于真实的架构逻辑进行学习。
