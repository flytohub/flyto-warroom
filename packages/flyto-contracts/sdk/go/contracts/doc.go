// Package contracts contains lightweight public Flyto2 protocol types.
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

type RunLedgerEvent struct {
	RunID      string        `json:"run_id"`
	OrgID      string        `json:"org_id"`
	WorkspaceID string      `json:"workspace_id,omitempty"`
	Surface    string       `json:"surface"`
	ScannerID  string       `json:"scanner_id"`
	Status     string       `json:"status"`
	Trigger    string       `json:"trigger,omitempty"`
	OccurredAt string       `json:"occurred_at"`
	Artifacts  []ArtifactRef `json:"artifacts,omitempty"`
}

type ArtifactSignature struct {
	ArtifactID string `json:"artifact_id"`
	Kind       string `json:"kind,omitempty"`
	Path       string `json:"path,omitempty"`
	Digest     string `json:"digest"`
	Algorithm  string `json:"algorithm"`
	KeyID      string `json:"key_id,omitempty"`
	SignedAt   string `json:"signed_at"`
	Signature  string `json:"signature,omitempty"`
}

type LivefixPlan struct {
	Surface              string   `json:"surface"`
	Provider             string   `json:"provider,omitempty"`
	Mode                 string   `json:"mode"`
	Status               string   `json:"status"`
	ProviderExecution    string   `json:"provider_execution"`
	BlockedReason        string   `json:"blocked_reason,omitempty"`
	ApprovalRequired     bool     `json:"approval_required,omitempty"`
	ApplySupported       bool     `json:"apply_supported,omitempty"`
	VerifySupported      bool     `json:"verify_supported,omitempty"`
	RollbackSupported    bool     `json:"rollback_supported,omitempty"`
	EvidenceRequirements []string `json:"evidence_requirements"`
}
