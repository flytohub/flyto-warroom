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
