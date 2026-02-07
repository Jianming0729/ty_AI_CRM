# 📉 Tongye AI CRM: Cross-Module Data Flow & Interactions (V3.0)

This document visualizes how the seven subsystems interact with the Bridge hub to form a cohesive Smart Agent.

## 1. The RAG Knowledge Loop
How a user's question about "Insurance" is processed.

```mermaid
sequenceDiagram
    participant U as User (WeCom)
    participant B as WeCom Bridge
    participant G as Gateway (OpenClaw)
    participant L as Local LLM (Brain)
    participant KB as Knowledge Base (JSON)

    U->>B: "What does the full insurance cover?"
    B->>B: Resolve ty_uid
    B->>G: Request completion (sessionId=ty_uid)
    G->>L: Proxy request to mock-model
    L->>KB: Keyword search for "Insurance"
    KB-->>L: Return Policy Chunk #10
    L->>L: Construct response string
    L-->>G: JSON Response
    G-->>B: Text completion
    B->>U: "Based on our policy, full insurance..."
```

## 2. Intended Tool/Skills Loop
How the system is designed to handle "Order Status" (Planned).

```mermaid
sequenceDiagram
    participant U as User
    participant B as WeCom Bridge
    participant G as Gateway
    participant T as Rental-Tools (Adapters)
    participant S as Skills (Logic)

    U->>B: "Check my order #12345"
    B->>G: Completion request
    G->>S: Match skill "OrderLookup"
    S->>T: Call get_order_api(12345)
    T-->>S: Data: {Status: "Confirmed", Car: "Tesla"}
    S-->>G: Formatted Outcome
    G-->>B: Final AI response with tool output
    B-->>U: "Your Tesla order #12345 is confirmed!"
```

## 3. The Quality Control Loop (Evaluation)
How the developers ensure the system stays accurate.

```mermaid
graph TD
    EV[eval/ - Test Questions] --> |Input| B[WeCom Bridge]
    B --> |Process| AI[AI Agent Cluster]
    AI --> |Response| EV
    EV --> |Compare with Gold Standard| Metrics[Accuracy / Hallucination Score]
    Metrics --> |Feedback| KB[Update knowledge_base.json]
```

## 4. Module Resource Responsibility Matrix

| Module | Filesystem Owner | Process Runtime | Shared Security Data |
| :--- | :--- | :--- | :--- |
| **Bridge** | `wecom-bridge/` | Node.js (3001) | `.env.profile` |
| **Brain** | `local-llm/` | Python/Flask (8000) | `knowledge_base.json` |
| **Router** | `gateway/` | OpenClaw (18789) | `openclaw.json` |
| **Logic** | `skills/` | N/A (Static Logic) | N/A |
| **Data** | `kb/` | N/A (Source Files) | Metadata Tags |
