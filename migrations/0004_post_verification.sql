-- Preserve all previously verified account identities and permanent license URLs.
ALTER TABLE licenses ADD COLUMN verification_post_id TEXT;
ALTER TABLE licenses DROP COLUMN x_auth_nonce;
DROP TABLE x_oauth_states;

CREATE TABLE post_challenges (
  license_id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  handle TEXT NOT NULL,
  record_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  checks INTEGER NOT NULL DEFAULT 0,
  claim_id TEXT,
  busy_until INTEGER NOT NULL DEFAULT 0,
  last_post_id TEXT,
  last_error TEXT
);
CREATE INDEX post_challenge_expiry ON post_challenges(expires_at);
