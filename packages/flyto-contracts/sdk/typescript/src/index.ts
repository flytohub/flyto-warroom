export type FlytoRunnerStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface FlytoArtifactRef {
  kind: string;
  path?: string;
  uri?: string;
  digest?: string;
}

export interface FlytoRunnerCallback {
  run_id: string;
  scanner_id: string;
  status: FlytoRunnerStatus;
  artifacts: FlytoArtifactRef[];
  started_at?: string;
  finished_at?: string;
  signature?: Record<string, unknown>;
}

export interface FlytoEvidenceEvent {
  event_id: string;
  org_id: string;
  project_id?: string;
  surface: string;
  source: string;
  severity?: string;
  artifacts: FlytoArtifactRef[];
  signature?: Record<string, unknown>;
}

export interface FlytoRunLedgerEvent {
  run_id: string;
  org_id: string;
  workspace_id?: string;
  surface: string;
  scanner_id: string;
  status: string;
  trigger?: string;
  occurred_at: string;
  artifacts?: FlytoArtifactRef[];
  signature?: Record<string, unknown>;
}

export interface FlytoArtifactSignature {
  artifact_id: string;
  kind?: string;
  path?: string;
  digest: string;
  algorithm: string;
  key_id?: string;
  signed_at: string;
  signature?: string;
}

export interface FlytoLivefixPlan {
  surface: string;
  provider?: string;
  mode: string;
  status: string;
  provider_execution: "none" | "live";
  blocked_reason?: string;
  approval_required?: boolean;
  apply_supported?: boolean;
  verify_supported?: boolean;
  rollback_supported?: boolean;
  evidence_requirements: string[];
}
