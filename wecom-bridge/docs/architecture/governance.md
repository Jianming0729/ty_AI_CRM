# Engineering Governance Rules

## 1. Message Integrity & Anti-Loop
To prevent infinite message loops between Bridge and CRM:
- **Fingerprinting**: Every message sent to WeCom/Chatwoot is cached in `dedup_store.js` (SQLite).
- **Outbound Check**: Webhooks from Chatwoot are ignored if the `msg_id` matches a message recently dispatched by the Bridge (`outbound_processed`).
- **Internal Loopback**: Direct container-to-container communication via Docker Bridge network is mandated to bypass slow public Nginx headers.

## 2. Global Identity (ty_uid) Protocol
- **Canonical Mapping**: No external ID should be used as a primary key. All modules must resolve to `ty_uid` before business processing.
- **Lazy Linking**: Chatwoot contacts are created on-demand using the `ty:${tyUid}` identifier to ensure cross-channel consistency.

## 3. Degradation & Safety Policies
- **High-Risk Interruption**: High-risk intents (e.g., cancellations, payments) triggered by AI are automatically blocked and escalated to human mode with a standard warning.
- **State-Based Routing**: 
    - `AI_MODE`: OpenClaw manages responses.
    - `HUMAN_MODE`: Automatic escalation on specific keywords or manual takeover; AI remains in "Suggestion only" (Private Note) mode.
## 5. WeCom Session & msg_code Governance (v2026-02)

To prevent "Zombie Session Injection" (e.g., Error 95018), the following rules are mandatory:

- **会话/消息解耦 (Decoupling)**: 严禁将 Chatwoot Conversation 的存在视为 WeCom 会话有效的依据。WeCom 会话由 `msg_code` 生命周期唯一定义。
- **错误级别定义 (Error Tiering)**: 任何 WeCom errcode ≥ 95000 的错误，必须视为“会话级错误（Fatal Session Error）”，而非单条消息发送失败。
- **不可复用原则 (Non-reusability)**: `msg_code` 一旦被 API 判定为失效（95018/95016），必须立即标记为 `INVALID` 状态并熔断重试逻辑。严禁复用已失效的 `msg_code`。
- **自愈触发机制 (Self-Healing)**: “新消息 ≠ 旧会话可继续”。系统必须通过捕获 WeCom 推送的全新 `msg_code` 事件来重置状态（`ACTIVE`），禁止尝试手动恢复失效会话。
- **前置熔断 (Circuit Breaking)**: 任何回复逻辑在投递前必须校验 `MsgCodeState`。若为 `INVALID`，必须执行 `abortSend` 并记录审计日志，禁止盲目补投。
- **Environment Isolation**: Production environment variables must be managed via Docker Compose or System Env, never from local `.env` files (enforced in `server.js`).
- **Audit Trails**: Every interaction (Intent, User, AI Response, Latency) must be logged to the `user_events` audit table in PostgreSQL.
