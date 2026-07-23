package ceplatform

const schemaSQL = `
CREATE TABLE IF NOT EXISTS ce_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ce_users_email_lower_idx ON ce_users (lower(email));

CREATE TABLE IF NOT EXISTS ce_projects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES ce_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  project_type TEXT NOT NULL DEFAULT 'all',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, slug)
);

CREATE TABLE IF NOT EXISTS ce_repositories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ce_projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'git',
  provider_id TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  repo_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '',
  is_private BOOLEAN NOT NULL DEFAULT false,
  html_url TEXT NOT NULL,
  clone_url TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  auto_scan BOOLEAN NOT NULL DEFAULT true,
  scan_mode TEXT NOT NULL DEFAULT 'cloud',
  last_scanned_at TIMESTAMPTZ,
  last_scan_status TEXT NOT NULL DEFAULT '',
  last_scan_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, full_name)
);

CREATE TABLE IF NOT EXISTS ce_scans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ce_projects(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES ce_repositories(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued','running','complete','failed','cancelled')),
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  error TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ce_scans_queue_idx ON ce_scans(status, created_at);
CREATE INDEX IF NOT EXISTS ce_scans_repo_idx ON ce_scans(repo_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ce_scans_one_active_per_repo_idx
  ON ce_scans(repo_id) WHERE status IN ('queued','running');

CREATE TABLE IF NOT EXISTS ce_findings (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES ce_scans(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES ce_projects(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES ce_repositories(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_no INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scan_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS ce_findings_repo_idx ON ce_findings(repo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ce_findings_project_idx ON ce_findings(project_id, severity);
`
