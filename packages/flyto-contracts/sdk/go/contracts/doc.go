// Package contracts contains lightweight public Flyto protocol types.
package contracts

type ArtifactRef struct {
	Kind   string `json:"kind"`
	Path   string `json:"path,omitempty"`
	URI    string `json:"uri,omitempty"`
	Digest string `json:"digest,omitempty"`
}

type RunnerCallback struct {
	RunID      string        `json:"run_id"`
	ScannerID  string        `json:"scanner_id"`
	Status     string        `json:"status"`
	Artifacts  []ArtifactRef `json:"artifacts"`
	StartedAt  string        `json:"started_at,omitempty"`
	FinishedAt string        `json:"finished_at,omitempty"`
}

type EvidenceEvent struct {
	EventID   string        `json:"event_id"`
	OrgID     string        `json:"org_id"`
	ProjectID string        `json:"project_id,omitempty"`
	Surface   string        `json:"surface"`
	Source    string        `json:"source"`
	Severity  string        `json:"severity,omitempty"`
	Artifacts []ArtifactRef `json:"artifacts"`
}
