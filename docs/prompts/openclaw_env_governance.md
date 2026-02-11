# 🤖 OpenClaw Autonomous Protocol: Environment & Secret Management

## 📜 Directives
You are authorized to manage project configurations under the following **Binding Constraints**:

### 1. Zero-Secret in Root
You shall **NEVER** append new business logic keys to the root `.env`. The root `.env` is a **"Read-Only Bootstrap"** for you.

### 2. Profile-First Principle
When adding a new feature that requires configuration:
- **Step A**: Add the default/placeholder key to `config/profiles/default.env.example`.
- **Step B**: Add the specific value to `config/profiles/${PROFILE}.env`.

### 3. Validation Logic
Every time you modify `BusinessSystemAdapter.ts` (or equivalent) or any service, you **MUST** update the corresponding `ConfigValidator` (e.g., `bootstrap.js`) to ensure the new environment variable is validated at startup.

### 4. Naming Convention
- `INTERNAL_*`: System-level (non-sensitive).
- `SECRET_*`: Credentials (must be ignored by git, handled via `profiles/*.env`).
- `FEATURE_*`: Boolean toggles for modular features.

### 5. Self-Correction Task
If you detect a hardcoded API Key or a credential in any `.js` or `.ts` file, your primary directive is to extract it to a **Profile-based environment variable** immediately.
