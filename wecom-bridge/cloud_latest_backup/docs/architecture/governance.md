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
- **Fail-Safe**: If AI processing fails, the system must default to a "System Busy" notification and switch to `HUMAN_MODE` to avoid silent failures.

## 4. Development Standards
- **Environment Isolation**: Production environment variables must be managed via Docker Compose or System Env, never from local `.env` files (enforced in `server.js`).
- **Audit Trails**: Every interaction (Intent, User, AI Response, Latency) must be logged to the `user_events` audit table in PostgreSQL.
