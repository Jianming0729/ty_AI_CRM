-- =========================
-- Core: users
-- =========================
CREATE TABLE IF NOT EXISTS users (
  ty_uid           TEXT PRIMARY KEY,                 -- e.g. TYU_01J...
  tenant_id        TEXT NOT NULL DEFAULT 'default',  -- future multi-tenant
  status           TEXT NOT NULL DEFAULT 'active',   -- active|blocked|merged
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- =========================
-- Core: identities (external identity mapping)
-- =========================
CREATE TABLE IF NOT EXISTS identities (
  id               BIGSERIAL PRIMARY KEY,
  ty_uid           TEXT NOT NULL REFERENCES users(ty_uid),
  provider         TEXT NOT NULL,                    -- wecom|wechat|phone|email|chatwoot
  external_key     TEXT NOT NULL,                    -- e.g. external_userid / unionid / phone
  key_hash         TEXT,                             -- optional: hashed external_key
  is_verified      BOOLEAN NOT NULL DEFAULT FALSE,   -- strong anchor after verification
  verified_at      TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one external identity maps to only ONE ty_uid (unless merged via alias)
CREATE UNIQUE INDEX IF NOT EXISTS uq_identities_provider_key
  ON identities(provider, external_key);

CREATE INDEX IF NOT EXISTS idx_identities_ty_uid
  ON identities(ty_uid);

-- =========================
-- Chatwoot binding table
-- =========================
CREATE TABLE IF NOT EXISTS chatwoot_links (
  id                      BIGSERIAL PRIMARY KEY,
  ty_uid                  TEXT NOT NULL REFERENCES users(ty_uid),
  chatwoot_account_id     BIGINT NOT NULL,
  chatwoot_inbox_id       BIGINT NOT NULL,
  chatwoot_contact_id     BIGINT,
  chatwoot_contact_inbox_id BIGINT,
  last_conversation_id    BIGINT,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chatwoot_links_account_inbox_uid
  ON chatwoot_links(chatwoot_account_id, chatwoot_inbox_id, ty_uid);

CREATE INDEX IF NOT EXISTS idx_chatwoot_links_uid
  ON chatwoot_links(ty_uid);

-- =========================
-- Alias table: merged users redirection
-- =========================
CREATE TABLE IF NOT EXISTS user_alias (
  alias_uid        TEXT PRIMARY KEY,               -- old ty_uid
  primary_uid      TEXT NOT NULL REFERENCES users(ty_uid),
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_alias_primary
  ON user_alias(primary_uid);

-- =========================
-- Events table: user_events
-- =========================
CREATE TABLE IF NOT EXISTS user_events (
  event_id         TEXT PRIMARY KEY,                -- ULID/UUIDv7
  ty_uid           TEXT NOT NULL REFERENCES users(ty_uid),
  event_type       TEXT NOT NULL,                   -- message_in|message_out|handoff|...
  source           TEXT NOT NULL,                   -- wecom|chatwoot|openclaw|system
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_events_uid_time
  ON user_events(ty_uid, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_events_type_time
  ON user_events(event_type, occurred_at DESC);

-- =========================
-- Trigger: updated_at auto update
-- =========================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_chatwoot_links_updated_at ON chatwoot_links;
CREATE TRIGGER trg_chatwoot_links_updated_at
BEFORE UPDATE ON chatwoot_links
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
