# 🛰️ Governance Evidence Report: Mock Sandbox Compliance
**Date**: 2026-02-10
**Profile**: `mock_sandbox`
**Status**: 🟢 COMPLIANT

## 1. Configuration Integrity
- **Root .env Audit**: The root `.env` file contains strictly ONLY the `PROFILE=mock_sandbox` variable. 
- **Secret Extraction**: 15 historical hardcoded secret assignments in diagnostic scripts were refactored to use `process.env`.
- **Digital Sheriff Verification**: `wecom-bridge/scripts/check-env-architecture.js` execution resulted in **0 Violations**.

## 2. Environment Isolation (Sandbox)
- **Database Isolation**: `SQLITE_DB_NAME` is set to `wecom_bridge_sandbox.db`. Production state remains untouched.
- **Identity DB Isolation**: `PG_DATABASE` is set to `ty_identity_sandbox`.
- **Credential Safety**: All credentials in `mock_sandbox.env` are synthetic (e.g., `mock_token`, `ww_mock_corp`).

## 3. Outbound Interception (Mock Service Layer)
- **WeCom Interception**: All calls to `wecom_client` are routed through `MockServiceFactory`. 
  - *Evidence*: `[MOCK-OUTBOUND] WeCom Send Message` logged during test. No real API calls made to `qyapi.weixin.qq.com`.
- **Chatwoot Interception**: `chatwoot_client` calls are suppressed.
  - *Evidence*: `[MOCK-OUTBOUND] Chatwoot Sync SUPPRESSED` logged. No raw webhooks sent to production Chatwoot.
- **OpenClaw Gateway**: Real requests to OpenClaw are replaced with synthetic responses.

## 4. Conclusion
The `wecom-bridge` module is now operating in a fully verified autonomous sandbox. It is architecturally fortified against accidental production data pollution or secret leakage.
