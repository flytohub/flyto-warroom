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
