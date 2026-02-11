协议文件：.agent/protocols/customer_360_implementation.md
1. 任务上下文 (Task Context)
目标：构建 Customer 360 嵌入式服务，聚合租车业务 API 数据。

核心主键：必须强制使用 ty_uid 作为所有查询的唯一锚点。

权限等级：Level 4 (Full Read/Write/Shell)，允许使用 evolver 技能进行代码自演化。

2. 物理资产边界 (Physical Boundaries)
OpenClaw 仅允许在以下目录进行写操作：

wecom-bridge/src/services/customer360/ (新设)

wecom-bridge/src/adapters/ (API 适配层)

wecom-bridge/test/ (自动化测试用例)

3. 技术栈约束 (Tech Stack Constraints)
语言：Node.js / TypeScript。

API 交互：使用 axios 或 fetch 对接环境变量 RENTAL_API_URL。

身份映射：必须调用 wecom-bridge/src/identity_service.js 来解析 external_userid 与 ty_uid 的映射。

4. 执行逻辑流 (Execution Logic Flow)
探测阶段 (Probe)：读取 identity_governance_standard.md，理解 Layer 1 (Machine Identity) 的 ULID 格式。

脚手架阶段 (Scaffold)：在 src/services/customer360/ 下创建核心逻辑文件。

自愈开发阶段 (Evolve)：

编写 API 联调代码。

若遇到 API 结构变更或网络错误，启动 evolver 分析日志并修正 CarRentalApiAdapter.ts。

对齐阶段 (Alignment)：确保输出结果中包含 handle 前缀（如 U-000456），符合 Layer 3 展示规范。