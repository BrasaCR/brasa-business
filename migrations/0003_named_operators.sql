CREATE TABLE IF NOT EXISTS marketplace_operators (
  display_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('reviewer','verifier','administrator')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS marketplace_operator_access_index ON marketplace_operators(display_id, status, role);

