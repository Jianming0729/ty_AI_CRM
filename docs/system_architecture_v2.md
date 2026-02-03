# System Architecture v2.0.0 (Unified Hybrid Service)

## 1. Interaction Flow Diagram

```mermaid
sequenceDiagram
    participant User as WeCom User (QiXi)
    participant Bridge as WeCom Bridge
    participant AI as OpenClaw LLM
    participant CW as Chatwoot CRM
    participant Agent as Human Agent

    Note over User, Agent: Normal AI Mode
    User->>Bridge: Encrypted Message
    Bridge->>CW: syncMessage (Inbound)
    CW-->>Bridge: OK
    Bridge->>AI: generateResponse
    AI-->>Bridge: AI Content
    Bridge->>User: Encrypted Response (Passive)
    Bridge->>CW: syncResponse (Outbound AI)

    Note over User, Agent: Transition to Human Mode
    Agent->>CW: Manual Reply (message_created)
    CW->>Bridge: Webhook Event
    Bridge->>Bridge: Detect Outgoing & !Private
    Bridge->>Bridge: Outbound Dedup Check (Skip if AI)
    Bridge->>User: wecom.sendTextMessage (Push API)
    Bridge->>Bridge: stateStore.setMode(HUMAN)

    Note over User, Agent: Post-Handover State
    User->>Bridge: New Message
    Bridge->>CW: syncMessage (Inbound)
    Bridge->>AI: generateResponse (Background)
    AI-->>Bridge: Suggestion
    Bridge->>CW: syncPrivateNote (AI Suggestion)
    Note right of Bridge: AI is now silent for User
```

## 2. Engineering Standards (V2)

### 2.1 Identity Persistence
- **Rule**: Never use `msgId` for mapping.
- **Implementation**: The `fromUser` (UserID) must be used as the `identifier` in Chatwoot Contacts and the `source_id` in Conversations.

### 2.2 Loop Prevention (Governance)
- **Problem**: Chatwoot Webhooks trigger on ALL messages, including those synced BY the Bridge.
- **Solution**: 
  1. Bridge captures the `message_id` from Chatwoot after successful `syncMessage`/`syncResponse`.
  2. Bridge stores this ID in a SQLite table `outbound_dedup`.
  3. Webhook handler queries `outbound_dedup` before acting.

### 2.3 Network Reliability
- **Standard**: Always use Docker Bridge Gateway (`172.17.0.1`) for cross-container communication to bypass Nginx `proxy_set_header` conflicts and Hairpin NAT issues.

### 2.4 Mode Logic
- **AI_MODE**: Bridge passively replies to WeCom XML requests.
- **HUMAN_MODE**: Bridge returns `success` to WeCom immediately (silent) and puts the RAG output into Chatwoot `private_note`.
