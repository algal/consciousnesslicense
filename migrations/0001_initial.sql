-- Owner hashes authorize private access. The cookie capability itself is never stored.
CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  version TEXT NOT NULL,
  questions TEXT NOT NULL,
  result TEXT,
  created_at INTEGER NOT NULL,
  touched_at INTEGER NOT NULL
);
CREATE INDEX attempts_owner ON attempts(owner_hash, created_at DESC);
CREATE INDEX attempts_cleanup ON attempts(touched_at);
CREATE UNIQUE INDEX one_pending_attempt ON attempts(owner_hash) WHERE result IS NULL;

-- No FK to attempts: issued licenses survive deletion of temporary exam data.
CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE,
  owner_hash TEXT NOT NULL,
  handle TEXT CHECK(handle IS NULL OR (length(handle) BETWEEN 1 AND 15 AND handle NOT GLOB '*[^A-Za-z0-9_]*')),
  issued_at TEXT NOT NULL,
  version TEXT NOT NULL
);
CREATE INDEX licenses_owner ON licenses(owner_hash, issued_at DESC);

-- Fixed windows; hashes are rotated daily so raw client IPs are never persisted.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX rate_cleanup ON rate_limits(expires_at);
