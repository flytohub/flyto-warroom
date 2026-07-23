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
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending','running','complete','failed')),
  report_status TEXT NOT NULL DEFAULT 'pending' CHECK (report_status IN ('pending','running','complete','failed')),
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  error TEXT NOT NULL DEFAULT '',
  analysis_error TEXT NOT NULL DEFAULT '',
  report_error TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ce_scans ADD COLUMN IF NOT EXISTS analysis_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (analysis_status IN ('pending','running','complete','failed'));
ALTER TABLE ce_scans ADD COLUMN IF NOT EXISTS report_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (report_status IN ('pending','running','complete','failed'));
ALTER TABLE ce_scans ADD COLUMN IF NOT EXISTS analysis_error TEXT NOT NULL DEFAULT '';
ALTER TABLE ce_scans ADD COLUMN IF NOT EXISTS report_error TEXT NOT NULL DEFAULT '';
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

CREATE TABLE IF NOT EXISTS ce_attack_paths (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES ce_scans(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES ce_projects(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES ce_repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  finding_ids TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'hypothesis',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scan_id, title)
);
CREATE INDEX IF NOT EXISTS ce_attack_paths_project_idx
  ON ce_attack_paths(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ce_evidence (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES ce_scans(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES ce_projects(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES ce_repositories(id) ON DELETE CASCADE,
  finding_id TEXT REFERENCES ce_findings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  digest TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scan_id, digest)
);
CREATE INDEX IF NOT EXISTS ce_evidence_project_idx
  ON ce_evidence(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ce_remediations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ce_projects(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES ce_repositories(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL REFERENCES ce_findings(id) ON DELETE CASCADE,
  recommendation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted','resolved','dismissed')),
  verification_status TEXT NOT NULL DEFAULT 'not_run'
    CHECK (verification_status IN ('not_run','queued','verified_fixed','still_present')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(finding_id)
);
CREATE INDEX IF NOT EXISTS ce_remediations_project_idx
  ON ce_remediations(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ce_reports (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES ce_scans(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES ce_projects(id) ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT 'html',
  body TEXT NOT NULL,
  finding_count INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scan_id, format)
);
CREATE INDEX IF NOT EXISTS ce_reports_project_idx
  ON ce_reports(project_id, created_at DESC);
`
