CREATE TABLE IF NOT EXISTS provider_records (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json)),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  region TEXT,
  website_url TEXT NOT NULL,
  provenance_url TEXT NOT NULL,
  source_label TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('pending', 'verified', 'suspended', 'expired', 'rejected')),
  verified_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS provider_public_index ON provider_records(verification_status, expires_at, country_code, category);

CREATE TABLE IF NOT EXISTS provider_reports (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES provider_records(id),
  category TEXT NOT NULL CHECK (category IN ('inaccurate', 'closed', 'unsafe', 'misleading', 'expired', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS provider_report_review_index ON provider_reports(status, created_at);
