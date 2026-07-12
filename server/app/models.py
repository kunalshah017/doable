from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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


class PreviewPatch(APIModel):
    patch_id: str
    selection_id: str
    text: str | None = None
    attributes: dict[str, str | None] | None = None
    styles: dict[str, str | None] | None = None
    parent_styles: dict[str, str | None] | None = None
    rationale: str


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


class RepositoryBinding(APIModel):
    repository_id: int | None = None
    installation_id: int | None = None
    owner: str | None = None
    name: str | None = None
    default_branch: str | None = None


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