CREATE TABLE IF NOT EXISTS provider_audit_events (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create','verify','renew','suspend','expire','reject','report_reviewed','report_dismissed')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS provider_audit_provider_index ON provider_audit_events(provider_id, created_at);

