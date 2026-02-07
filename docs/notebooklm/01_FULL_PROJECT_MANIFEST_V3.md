# 📄 Tongye AI CRM: Full Project Manifest (Atomic Level V3.0)

This document is the "Master Directory" for the entire project. It maps every physical directory and file to its functional role in the ecosystem. 

## 1. Top-Level Project Structure

| Directory | Functional Role | Architectural Importance | Component Owner |
| :--- | :--- | :--- | :--- |
| `wecom-bridge/` | **Middleware Hub** | Connection point between WeCom and Chatwoot. | Node.js / Express |
| `gateway/` | **OpenClaw Control Plane** | Manages AI Agents, Skills, and message routing. | OpenClaw Core |
| `local-llm/` | **Local Inference Layer** | Runs the Python-based Mock LLM and RAG logic. | Python / Flask |
| `chatwoot-local/` | **CRM Sandbox** | Contains local deployment configs for Chatwoot testing. | Docker Compose |
| `ops/` | **Operational Scripts** | Setup, smoke tests, and deployment automation. | Shell Scripts |
| `docs/` | **Central Knowledge Repository** | Project DNA, specifications, and governance rules. | Documentation |
| `eval/` | **Model Evaluation** | Dataset for testing AI response accuracy. | QA / Testing |
| `kb/` | **Source Knowledge Base**| Raw Markdown documents for RAG. | Content / Ops |
| `rental-tools/` | **Business Logic Connectors**| Wrappers for existing car rental system APIs. | Integration |
| `skills/` | **Agentic Extensions** | Modular capabilities for the AI Agent. | OpenClaw Skills |

## 2. WeCom Bridge: Deep File Mapping (`wecom-bridge/src/`)

| File | Functional Responsibility | Interaction Chain |
| :--- | :--- | :--- |
| `server.js` | **Main Dispatcher** | Entry point for HTTP calls from WeCom and Chatwoot. |
| `bootstrap.js` | **Architecture Guard** | Runs version checks on PG and SQLite before startup. |
| `identity_service.js`| **Identity Sovereign** | Maps `UserID` -> `ty_uid`. Generates `Handle` (U-000001). |
| `identity_router.js` | **Public ID API** | Exposes `/v1/identity` for cross-system ID lookup. |
| `intent_processor.js`| **Intent Classifier** | Categorizes inputs into FAQ, Order, Transfer, Chitchat. |
| `state_store.js` | **State Manager** | Persistent session mode lock (`AI_MODE` vs `HUMAN_MODE`). |
| `dedup_store.js` | **Deduplication & Audit**| Prevents loops; logs every interaction to `audit_log`. |
| `chatwoot_client.js` | **CRM Sync Engine** | Pushes messages to Chatwoot; syncs AI notes. |
| `wecom_client.js` | **Message Sender** | Wraps WeCom API for outbound push. |
| `wecom_crypto.js` | **Security Layer** | Handles XML encryption/decryption and URL verification. |
| `openclaw_client.js` | **AI Proxy** | Calls the OpenClaw Gateway/Mock LLM. |
| `pg_client.js` | **Postgres Connector** | Interface for global identity database (ty_identity). |
| `logger.js` | **Contextual Logging** | Standardized Winston-based logging with levels. |

## 3. Storage Definitions

### A. Global Identity (PostgreSQL: `ty_identity`)
*   **users**: Core records of `ty_uid` and `handle`.
*   **identities**: Channel-specific mappings (WeCom, Phone).
*   **chatwoot_links**: Connection mapping to Chatwoot contacts.
*   **system_meta**: The ultimate architecture version lock (`schema_version`).

### B. Local State (SQLite: `wecom_bridge.db`)
*   **conversation_state**: Tracks user session modes.
*   **msg_dedup / outbound_dedup**: Prevents duplicate message processing.
*   **audit_log**: Full history of user queries and AI responses.

## 4. Operational Assets
*   `knowledge_base.json`: The source of truth for the Mock RAG.
*   `wecom-bridge/config/profiles/`: Environment-specific parameter injection (e.g., `prod_cn_vpn.env`).
*   `ops/scripts/`: Automation for infrastructure setup and smoke testing.
