CREATE TABLE IF NOT EXISTS marketplace_emergency_revocations (
  id TEXT PRIMARY KEY,
  target_display_id TEXT NOT NULL,
  initiated_by TEXT NOT NULL,
  confirmed_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','executed','expired','cancelled')),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
  confirmation_reason TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT
);

CREATE INDEX IF NOT EXISTS marketplace_emergency_revocation_lookup
  ON marketplace_emergency_revocations(status, target_display_id, expires_at);

CREATE TABLE IF NOT EXISTS marketplace_emergency_revocation_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  target_display_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('initiated','executed')),
  actor_display_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS marketplace_emergency_event_lookup
  ON marketplace_emergency_revocation_events(request_id, created_at);
