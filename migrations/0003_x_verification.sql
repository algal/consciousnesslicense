-- Existing handles remain self-declared until a successful X sign-in.
ALTER TABLE licenses ADD COLUMN x_user_id TEXT;
ALTER TABLE licenses ADD COLUMN x_verified_at TEXT;
ALTER TABLE licenses ADD COLUMN x_auth_nonce TEXT;

-- Short-lived, single-use OAuth transactions; access tokens are never persisted.
CREATE TABLE x_oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL UNIQUE,
  license_id TEXT NOT NULL,
  verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX x_oauth_expiry ON x_oauth_states(expires_at);
