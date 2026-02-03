# 桐叶租车智能客服系统 (ty_AI_CRM)

基于 OpenClaw 框架的下一代租车智能客服与销售 Agent 系统。

## 项目结构 (Phase 0 / Phase 1)

- `gateway/`: OpenClaw 运行与配置（控制平面）
- `wecom-bridge/`: 企业微信桥接服务（渠道层）
- `local-llm/`: 阶段 0 本地模型 Provider（占位/Mock）
- `ops/`: 运维、启动与验收脚本
- `docs/`: 方案与开发文档
- `logs/`: 全局日志

## 核心目标
1. **Phase 0**: 链路跑通，实现 "Hello World" 闭环。
2. **Phase 1**: 企业微信基础消息双向打通。
