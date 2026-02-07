# 📂 NotebookLM Upload Strategy: V3.0 (Atomic Coverage)

To ensure NotebookLM provides the most accurate architectural and operational advice, please upload the following files in this order:

## 1. Core Architecture (The "Brains")
*   `docs/notebooklm/01_FULL_PROJECT_MANIFEST_V3.md`: Maps every file to its role.
*   `docs/notebooklm/02_ARCHITECTURE_BLUEPRINT_V3.md`: Explains the flow of data.
*   `docs/notebooklm/03_COMPONENT_GLOSSARY_V3.md`: Defines terms and safety logic.

## 2. Technical Evidence (The "Ground Truth")
*   `wecom-bridge/src/server.js`: The central dispatch logic.
*   `wecom-bridge/src/bootstrap.js`: The system's self-preservation/validation logic.
*   `wecom-bridge/src/identity_service.js`: The source of truth for user IDs.
*   `wecom-bridge/package.json`: Detailed tech-stack and dependencies.

## 3. Operational Data (The "Content")
*   `wecom-bridge/knowledge_base.json`: Current AI wisdom/training set.
*   `wecom-bridge/deploy/nginx.conf`: Production routing logic.

---

### Pro-Tip: Suggested Queries for NotebookLM
After uploading, you can verify the intelligence of the assistant with these prompts:

1.  *"Which file is responsible for ensuring the AI doesn't accidentally cancel a user's car booking?"*
    *   (Answer: `wecom-bridge/src/server.js` within the Deny-List logic).
2.  *"Explain the relationship between ty_uid and the Chatwoot contact identifier."*
    *   (Answer: See Identity Resolution in the Architecture Blueprint).
3.  *"What happens if the system starts up and detects an old Postgres schema?"*
    *   (Answer: The `bootstrapCheck` function in `bootstrap.js` will exit the process).
4.  *"Where is the physical location of the knowledge base that the Mock LLM uses?"*
    *   (Answer: `wecom-bridge/knowledge_base.json`).
