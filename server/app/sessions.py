import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from uuid import uuid4

from app.ledger import ApprovalRecord, change_hash, issue_approval, verify_approval
from app.models import (
    ApprovalResponse,
    ApprovedChange,
    ApprovedChangeReference,
    DraftRequest,
    DraftState,
    RepositoryBinding,
    SelectedComponent,
    SessionCreatedResponse,
    SessionStatusResponse,
)


class SessionNotFound(Exception):
    pass


class InvalidSessionToken(Exception):
    pass


class SessionConflict(Exception):
    pass


@dataclass(slots=True)
class SessionState:
    session_id: str
    token: str
    selection: SelectedComponent | None = None
    draft: DraftState | None = None
    approved_changes: list[ApprovedChange] = field(default_factory=list)
    repository: RepositoryBinding | None = None
    approval: ApprovalRecord | None = None


class SessionStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._sessions: dict[str, SessionState] = {}

    def create(self) -> SessionCreatedResponse:
        with self._lock:
            session_id = str(uuid4())
            token = secrets.token_urlsafe(32)
            self._sessions[session_id] = SessionState(session_id=session_id, token=token)
            return SessionCreatedResponse(session_id=session_id, session_token=token)

    def authenticate(self, session_id: str, token: str) -> None:
        with self._lock:
            self._authenticated(session_id, token)

    def get_status(self, session_id: str, token: str) -> SessionStatusResponse:
        with self._lock:
            state = self._authenticated(session_id, token)
            return SessionStatusResponse(
                session_id=state.session_id,
                selection=self._copy(state.selection),
                draft=self._copy(state.draft),
                repository=self._copy(state.repository),
                approved_change_count=len(state.approved_changes),
            )

    def set_selection(
        self,
        session_id: str,
        token: str,
        selection: SelectedComponent,
    ) -> SelectedComponent:
        with self._lock:
            state = self._authenticated(session_id, token)
            state.selection = selection.model_copy(deep=True)
            state.draft = None
            return state.selection.model_copy(deep=True)

    def set_draft(self, session_id: str, token: str, draft: DraftRequest) -> DraftState:
        with self._lock:
            state = self._authenticated(session_id, token)
            if state.selection is None:
                raise SessionConflict("Select a component before storing a draft")
            if draft.patch.selection_id != state.selection.selection_id:
                raise SessionConflict("Draft patch does not match the current selection")

            state.draft = DraftState(
                selection_id=state.selection.selection_id,
                **draft.model_dump(),
            )
            return state.draft.model_copy(deep=True)

    def approve_draft(self, session_id: str, token: str) -> ApprovalResponse:
        with self._lock:
            state = self._authenticated(session_id, token)
            if state.selection is None or state.draft is None:
                raise SessionConflict("There is no current draft to approve")
            if not state.draft.qa.passed:
                raise SessionConflict("Draft QA must pass before approval")

            change = ApprovedChange(
                change_id=str(uuid4()),
                change_hash="",
                selection=state.selection,
                request=state.draft.request,
                preview_patch=state.draft.patch,
                before_screenshot=state.draft.before_screenshot,
                after_screenshot=state.draft.after_screenshot,
                qa=state.draft.qa,
                approved_at=datetime.now(timezone.utc),
            )
            change = change.model_copy(update={"change_hash": change_hash(change)}, deep=True)
            state.approved_changes.append(change)
            state.approval = issue_approval(state.approved_changes)
            state.draft = None

            return ApprovalResponse(
                change=change.model_copy(deep=True),
                approval_token=state.approval.token,
                ledger_hash=state.approval.ledger_hash,
            )

    def get_changes(self, session_id: str, token: str) -> list[ApprovedChange]:
        with self._lock:
            state = self._authenticated(session_id, token)
            return [change.model_copy(deep=True) for change in state.approved_changes]

    def clear_draft(self, session_id: str, token: str) -> None:
        with self._lock:
            state = self._authenticated(session_id, token)
            state.draft = None

    def set_repository(
        self,
        session_id: str,
        token: str,
        repository: RepositoryBinding | None,
    ) -> None:
        with self._lock:
            state = self._authenticated(session_id, token)
            state.repository = self._copy(repository)

    def verify_release(
        self,
        session_id: str,
        session_token: str,
        approval_token: str,
        references: list[ApprovedChangeReference],
    ) -> str:
        with self._lock:
            state = self._authenticated(session_id, session_token)
            return verify_approval(
                state.approval,
                approval_token,
                references,
                state.approved_changes,
            )

    def _authenticated(self, session_id: str, token: str) -> SessionState:
        state = self._sessions.get(session_id)
        if state is None:
            raise SessionNotFound
        if not token or not secrets.compare_digest(state.token, token):
            raise InvalidSessionToken
        return state

    @staticmethod
    def _copy(model: SelectedComponent | DraftState | RepositoryBinding | None):
        return model.model_copy(deep=True) if model is not None else None