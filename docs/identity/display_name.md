# 🆔 Tongye Identity: Contact Display Name Governance

**Version**: 1.0.0 (Solidified)
**Status**: Mandatory Architectural Guardrail
**Last Updated**: 2026-02-05

## 1. Overview
In the Tongye AI CRM ecosystem, the Chatwoot Contact `display_name` serves as the primary visual link between the business system (using `ty_uid`/`handle`) and the social communication layer (WeCom). To ensure professional indexing and identity sovereignty, all Contact names must follow a strict atomic format.

---

## 2. The Standard Format
All Chatwoot Contact `name` fields must be constructed as follows:

```text
{handle} | {display_label}
```

*   **Handle**: The business-hub assigned ID (e.g., `U-000003`, `A-000001`). This is the **immutable primary prefix**.
*   **Separator**: A space-padded pipe ` | `.
*   **Display Label**: The descriptive nickname or role of the user.

---

## 3. Display Label Generation Rules
The `display_label` part must be generated using the following cascade of priorities to prevent "Contact" bloat while maintaining business context.

| Priority | Source | Condition |
| :--- | :--- | :--- |
| **P1 (Highest)** | **WeCom Nickname** | Extracted from the incoming webhook payload (`sender.name` or `Alias`). |
| **P2 (Persistent)** | **Existing Label** | The portion of the current Chatwoot `name` following the ` | ` separator. |
| **P3 (Fallback)** | **"Contact"** | Used only if no previous data is available. |

### 3.1 Idempotent Update Logic
*   **Creation**: When a new Contact is created, the system must immediately apply the P1-P3 logic.
*   **Update**: If a Contact exists with a fallback label (e.g., `U-000003 | Contact`) and a new message arrives with a P1 nickname, the system **MUST** update the name to reflect the nickname.
*   **Protection**: The `handle` prefix must **NEVER** be modified or recalculated during an update.

---

## 4. Engineering Constraints (Red Lines)

1.  **No Handle Overwrite**: Never allow a social nickname to become the sole name of a contact.
2.  **No Bare IDs**: Never display only the `ty_uid` or Database Primary Key in the UI.
3.  **Governance Checksum**: The `bootstrap.js` check ensures that the mapping table (`chatwoot_links`) is aligned with the source `users` table handles.
4.  **Metadata Parity**: The `handle`, `ty_uid`, and `actor_type` must still be mirrored in the Chatwoot Contact's `custom_attributes` for technical auditing.

---

## 5. Implementation Reference (Logic Flow)
```javascript
const handle = identity.handle; // From Tongye DB
const wecomName = payload.nickname; // From Inbound Msg

// Parse existing label from Chatwoot if available
const existingLabel = contact.name.includes('|') 
    ? contact.name.split('|')[1].trim() 
    : null;

const displayLabel = wecomName || existingLabel || "Contact";

// Final Atomic Write
contact.name = `${handle} | ${displayLabel}`;
```

---

## 6. Audit & Compliance
Any code modification to the `chatwoot_client.js` sync logic must be validated against this standard. Non-compliant names (e.g., names missing the handle prefix) are considered **Architectural Drift** and must be corrected via the `identity_repair_script.`
