CREATE TABLE IF NOT EXISTS members(id text PRIMARY KEY CHECK(id IN ('member1','member2')), name text NOT NULL, password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS devices(id uuid PRIMARY KEY, member_id text NOT NULL REFERENCES members(id), name text NOT NULL, token_hash text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days', revoked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS events(seq bigserial PRIMARY KEY, id uuid UNIQUE NOT NULL, envelope jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS backups(id uuid PRIMARY KEY, device_id uuid REFERENCES devices(id), envelope jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS transfers(id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), token_hash text UNIQUE NOT NULL, envelope jsonb, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, receipt_hash text, claim_until timestamptz, completed_at timestamptz, revoked_at timestamptz);
CREATE INDEX IF NOT EXISTS transfers_expiry ON transfers(expires_at);
