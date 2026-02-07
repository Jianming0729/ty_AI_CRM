# 📔 Tongye AI CRM: Component Glossary & Business Logic (V3.0)

## 1. Key Terminology

| Term | Definition | Context |
| :--- | :--- | :--- |
| **ty_uid** | The global unique identifier for any actor in the Tongye ecosystem. | SSOT Identity |
| **Handle** | User-friendly ID format (e.g., `U-000001` for users, `A-000001` for agents). | UI Display |
| **Identity Service**| The logic layer that maps external IDs (Phone, WeCom) to `ty_uid`. | wecom-bridge/src |
| **Mock Provider** | A simulated AI backend using `knowledge_base.json` to respond to FAQs. | local-llm/ |
| **Sync Sync** | The internal process of ensuring WeCom, Bridge, and Chatwoot are aligned. | Workflow |
| **AI_MODE** | System automatically replies to user queries. | Session State |
| **HUMAN_MODE** | System pauses AI replies; human agent takes over. | Session State |

## 2. Business Logic Modules

### 2.1 Intent Categories (`intent_processor.js`)
*   **INTENT_FAQ**: General questions about car rental rules (Insurance, Deposit). -> Directed to RAG.
*   **INTENT_ORDER**: Queries about specific bookings or prices. -> Directed to Rental Tools API.
*   **INTENT_TRANSFER**: User requesting help or complaining. -> Direct Escalation to Human.
*   **INTENT_CHITCHAT**: Basic greetings (Hello, Who are you). -> Preset friendly responses.

### 2.2 Safety Deny-List
The system **hard-codes** a block for the following operations for AI:
*   Order Cancellations
*   Refund Requests
*   Manual Payment Processing
*   *Rationale*: These require legal/financial validation that an LLM could hallucinate.

### 2.3 Identity Generation Logic
*   **Sequences**: Handles are generated using DB sequences (`seq_handle_customer`, etc.).
*   **Mapping**: Identities are stored with a `is_verified` flag. Phone numbers linked to WeCom accounts are prioritized as primary trust anchors.

## 3. Knowledge Base Structure
The `knowledge_base.json` follows a structured chunking pattern:
1.  **Tagging**: Each chunk has relevant tags for retrieval.
2.  **Content**: Atomic rental policies (e.g., "Full fuel pickup, full fuel return").
3.  **Governance**: Policies linked to `docs/kb/` source files.
