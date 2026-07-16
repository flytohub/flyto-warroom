from typing import Any, Literal, TypedDict

FlytoRunnerStatus = Literal["queued", "running", "succeeded", "failed", "canceled"]


class FlytoArtifactRef(TypedDict, total=False):
    kind: str
    path: str
    uri: str
    digest: str


class FlytoRunnerCallback(TypedDict, total=False):
    run_id: str
    scanner_id: str
    status: FlytoRunnerStatus
    artifacts: list[FlytoArtifactRef]
    started_at: str
    finished_at: str
    signature: dict[str, Any]


class FlytoEvidenceEvent(TypedDict, total=False):
    event_id: str
    org_id: str
    project_id: str
    surface: str
    source: str
    severity: str
    artifacts: list[FlytoArtifactRef]
    signature: dict[str, Any]


class FlytoRunLedgerEvent(TypedDict, total=False):
    run_id: str
    org_id: str
    workspace_id: str
    surface: str
    scanner_id: str
    status: str
    trigger: str
    occurred_at: str
    artifacts: list[FlytoArtifactRef]
    signature: dict[str, Any]


class FlytoArtifactSignature(TypedDict, total=False):
    artifact_id: str
    kind: str
    path: str
    digest: str
    algorithm: str
    key_id: str
    signed_at: str
    signature: str


class FlytoLivefixPlan(TypedDict, total=False):
    surface: str
    provider: str
    mode: str
    status: str
    provider_execution: Literal["none", "live"]
    blocked_reason: str
    approval_required: bool
    apply_supported: bool
    verify_supported: bool
    rollback_supported: bool
    evidence_requirements: list[str]
