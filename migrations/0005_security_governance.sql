CREATE TABLE IF NOT EXISTS marketplace_admin_role_requests (
  id TEXT PRIMARY KEY,
  target_display_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','expired','cancelled')),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS marketplace_admin_request_lookup
  ON marketplace_admin_role_requests(status, target_display_id, expires_at);

CREATE TABLE IF NOT EXISTS marketplace_security_governance (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  audit_retention_days INTEGER CHECK(audit_retention_days BETWEEN 365 AND 2555),
  emergency_primary_display_id TEXT,
  emergency_backup_display_id TEXT,
  policy_reason TEXT,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(emergency_primary_display_id IS NULL OR emergency_backup_display_id IS NULL OR emergency_primary_display_id <> emergency_backup_display_id)
);

INSERT OR IGNORE INTO marketplace_security_governance(id) VALUES (1);

CREATE TABLE IF NOT EXISTS marketplace_security_audit_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK(action IN ('admin_requested','admin_approved','governance_updated')),
  subject_id TEXT NOT NULL,
  actor_display_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS marketplace_security_audit_lookup
  ON marketplace_security_audit_events(subject_id, created_at DESC);
