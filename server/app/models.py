from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.title() for part in rest)


class APIModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        populate_by_name=True,
        serialize_by_alias=True,
    )


class Viewport(APIModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class SelectedComponent(APIModel):
    selection_id: str
    tab_id: int
    page_url: str
    doable_id: str | None = None
    selector: str
    outer_html: str
    parent_html: str
    computed_styles: dict[str, str]
    viewport: Viewport
    screenshot_data_url: str


StaticFilePath = Literal["index.html", "styles.css", "script.js"]


class StaticSourceWorkspace(APIModel):
    base_commit_sha: str = Field(min_length=7, max_length=64)
    files: dict[StaticFilePath, str]

    @field_validator("files")
    @classmethod
    def require_index_html(
        cls,
        files: dict[StaticFilePath, str],
    ) -> dict[StaticFilePath, str]:
        if "index.html" not in files:
            raise ValueError("Static workspace requires index.html")
        return files


class WorkspacePatch(APIModel):
    patch_id: str
    selection_id: str | None = None
    base_commit_sha: str = Field(min_length=7, max_length=64)
    files: dict[StaticFilePath, str] = Field(min_length=1)
    summary: list[str] = Field(min_length=1, max_length=12)
    rationale: str = Field(min_length=1, max_length=2_000)


class PreviewPatch(APIModel):
    patch_id: str
    selection_id: str
    text: str | None = None
    attributes: dict[str, str | None] | None = None
    styles: dict[str, str | None] | None = None
    parent_styles: dict[str, str | None] | None = None
    rationale: str

    @field_validator("attributes")
    @classmethod
    def reject_unsafe_attributes(
        cls,
        attributes: dict[str, str | None] | None,
    ) -> dict[str, str | None] | None:
        for name, value in (attributes or {}).items():
            normalized_name = name.strip().lower()
            if normalized_name.startswith("on") or normalized_name in {"srcdoc", "style"}:
                raise ValueError(f"Unsafe preview attribute: {name}")
            if value is not None and "javascript:" in value.lower():
                raise ValueError(f"Unsafe preview attribute value: {name}")
        return attributes

    @field_validator("styles", "parent_styles")
    @classmethod
    def reject_unsafe_styles(
        cls,
        styles: dict[str, str | None] | None,
    ) -> dict[str, str | None] | None:
        for name, value in (styles or {}).items():
            normalized_name = name.strip().lower()
            if normalized_name in {"behavior", "-moz-binding"}:
                raise ValueError(f"Unsafe preview style: {name}")
            normalized_value = (value or "").lower()
            if any(token in normalized_value for token in ("javascript:", "expression(", "@import", "</script")):
                raise ValueError(f"Unsafe preview style value: {name}")
        return styles


class PreviewRequest(APIModel):
    request: str = Field(min_length=1, max_length=4_000)


class PreviewResponse(APIModel):
    patch: PreviewPatch
    response_id: str | None = None


class HermesStatusResponse(APIModel):
    status: str
    detail: str | None = None


class QAResult(APIModel):
    passed: bool = True
    checks: list[str] = Field(default_factory=lambda: ["prototype_default"])


class DraftRequest(APIModel):
    request: str
    patch: PreviewPatch
    before_screenshot: str
    after_screenshot: str
    qa: QAResult = Field(default_factory=QAResult)


class DraftState(DraftRequest):
    selection_id: str


class ApprovedChange(APIModel):
    change_id: str
    change_hash: str
    selection: SelectedComponent
    request: str
    preview_patch: PreviewPatch
    before_screenshot: str
    after_screenshot: str
    qa: QAResult
    approved_at: datetime


class GitHubInstallation(APIModel):
    installation_id: int
    account: str


class RepositorySummary(APIModel):
    repository_id: int
    full_name: str
    default_branch: str
    private: bool
    html_url: str


class RepositoryBinding(RepositorySummary):
    installation_id: int
    account: str


class GitHubStatusResponse(APIModel):
    configured: bool
    detail: str | None = None
    connected: bool = False
    account: str | None = None
    pending_account: str | None = None
    repository: RepositoryBinding | None = None


class GitHubInstallStartResponse(APIModel):
    install_url: str


class GitHubRepositoriesResponse(APIModel):
    repositories: list[RepositorySummary]


class RepositoryBindRequest(APIModel):
    repository_id: int


class ReleaseRequest(APIModel):
    approval_token: str
    changes: list[str] = Field(min_length=1)


class ReleaseResponse(APIModel):
    pull_request_url: str
    pull_request_number: int
    branch: str
    commit_shas: list[str]
    ledger_hash: str


class SessionCreatedResponse(APIModel):
    session_id: str
    session_token: str


class SessionStatusResponse(APIModel):
    session_id: str
    selection: SelectedComponent | None
    draft: DraftState | None
    repository: RepositoryBinding | None
    approved_change_count: int


class SelectionResponse(APIModel):
    selection: SelectedComponent


class DraftResponse(APIModel):
    draft: DraftState


class ApprovalResponse(APIModel):
    change: ApprovedChange
    approval_token: str
    ledger_hash: str


class ChangesResponse(APIModel):
    changes: list[ApprovedChange]


class ApprovedChangeReference(APIModel):
    change_id: str
    change_hash: str


class ReleaseVerificationRequest(APIModel):
    changes: list[ApprovedChangeReference]
    approval_token: str


class ReleaseVerificationResponse(APIModel):
    verified: bool
    ledger_hash: str


class WebSocketMessage(APIModel):
    type: str
    payload: dict[str, Any] | list[Any] | str | int | float | bool | None = None
