CREATE TABLE IF NOT EXISTS marketplace_operator_audit_events (
  id TEXT PRIMARY KEY,
  display_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create','invite','role_change','suspend','resume')),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  actor TEXT NOT NULL DEFAULT 'cloudflare-cli',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS marketplace_operator_audit_lookup
  ON marketplace_operator_audit_events(display_id, created_at DESC);
