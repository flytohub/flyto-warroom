export type ThemeMode = "light" | "dark" | "system";
export type View =
  | "overview"
  | "repositories"
  | "evidence"
  | "remediation"
  | "reports"
  | "architecture";

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  repoCount: number;
  projectType: string;
}

export interface Repository {
  id: string;
  orgId: string;
  provider: string;
  fullName: string;
  ownerName: string;
  repoName: string;
  language?: string;
  htmlUrl: string;
  defaultBranch?: string;
  autoScan: boolean;
  scanMode: string;
  lastScannedAt?: string;
  lastScanStatus?: string;
  lastScanError?: string;
}

export interface Scan {
  id: string;
  repoId: string;
  orgId?: string;
  repoName?: string;
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  triggerType: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface Finding {
  id: string;
  scan_id?: string;
  org_id?: string;
  repo_id?: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  rule?: string;
  name: string;
  file: string;
  line?: number;
  detail?: string;
  fingerprint: string;
}

export interface AttackPath {
  id: string;
  scan_id: string;
  project_id: string;
  repo_id: string;
  title: string;
  severity: string;
  finding_ids: string[];
  summary: string;
  confidence: "hypothesis";
  created_at: string;
}

export interface Evidence {
  id: string;
  scan_id: string;
  project_id: string;
  repo_id: string;
  finding_id?: string;
  kind: string;
  digest: string;
  summary: string;
  created_at: string;
}

export interface Remediation {
  id: string;
  project_id: string;
  repo_id: string;
  finding_id: string;
  recommendation: string;
  status: "proposed" | "accepted" | "resolved" | "dismissed";
  verification_status:
    | "not_run"
    | "queued"
    | "verified_fixed"
    | "still_present";
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  scan_id: string;
  project_id: string;
  format: "html";
  finding_count: number;
  evidence_count: number;
  created_at: string;
}

export interface WorkflowSummary {
  attack_paths: AttackPath[];
  evidence: Evidence[];
  remediations: Remediation[];
  reports: Report[];
}

export interface FindingGroups {
  dead_code: Finding[];
  complex_functions: Finding[];
  sast_findings: Finding[];
  secrets: Finding[];
  taint_flows: Finding[];
  dead_code_count: number;
  complex_count: number;
  sast_count: number;
  secret_count: number;
  taint_count: number;
}

export interface BootstrapStatus {
  enabled: boolean;
  required: boolean;
  registrationOpen: boolean;
}

export interface Session {
  accessToken: string;
  user: User;
  org?: Project;
}

export interface ServiceBoundary {
  name: string;
  port: number;
  source: string;
  responsibility: string;
}
