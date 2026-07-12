import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any
from uuid import uuid4

from app.convex_client import ConvexClient, ConvexUnavailable
from app.ledger import (
    ApprovalRecord,
    change_hash,
    issue_approval,
    stable_hash,
    verify_approval,
)
from app.models import (
    ApprovalResponse,
    ApprovedChange,
    ApprovedChangeReference,
    ApprovedWorkspaceChange,
    DraftRequest,
    DraftState,
    GitHubInstallation,
    RepositoryBinding,
    RepositorySummary,
    SelectedComponent,
    SessionCreatedResponse,
    SessionStatusResponse,
    StaticSourceWorkspace,
    WorkspaceApprovalResponse,
    WorkspaceDraftRequest,
    WorkspaceDraftState,
)
from app.workspace_preview import apply_workspace_patch


class SessionNotFound(Exception):
    pass


class InvalidSessionToken(Exception):
    pass


class SessionConflict(Exception):
    pass


@dataclass(frozen=True, slots=True)
class ReleaseSnapshot:
    ledger_hash: str
    changes: tuple[ApprovedChange, ...]
    repository: RepositoryBinding


@dataclass(slots=True)
class GitHubInstallAttempt:
    nonce: str
    expires_at: datetime
    consumed: bool = False
    candidate: GitHubInstallation | None = None


@dataclass(slots=True)
class SessionState:
    session_id: str
    token: str
    selection: SelectedComponent | None = None
    draft: DraftState | None = None
    approved_changes: list[ApprovedChange] = field(default_factory=list)
    github_installation: GitHubInstallation | None = None
    github_install_attempt: GitHubInstallAttempt | None = None
    repository: RepositoryBinding | None = None
    approval: ApprovalRecord | None = None
    workspace_source: StaticSourceWorkspace | None = None
    workspace_draft: WorkspaceDraftState | None = None
    approved_workspace_changes: list[ApprovedWorkspaceChange] = field(
        default_factory=list
    )
    workspace_approval: ApprovalRecord | None = None


class SessionStore:
    def __init__(self, convex: ConvexClient | None = None) -> None:
        self._lock = RLock()
        self._sessions: dict[str, SessionState] = {}
        self._convex = convex or ConvexClient()
        self._persistence = "convex" if self._convex.configured else "memory"

    @property
    def persistence(self) -> str:
        return self._persistence

    def create(self) -> SessionCreatedResponse:
        with self._lock:
            session_id = str(uuid4())
            token = secrets.token_urlsafe(32)
            state = SessionState(session_id=session_id, token=token)
            self._persist(state)
            self._append_event(session_id, "session_created", {})
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
                approved_change_count=(
                    len(state.approved_changes)
                    + len(state.approved_workspace_changes)
                ),
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
            self._persist(state)
            self._append_event(
                session_id,
                "selection_updated",
                {"selectionId": selection.selection_id},
            )
            return state.selection.model_copy(deep=True)

    def set_draft(self, session_id: str, token: str, draft: DraftRequest) -> DraftState:
        with self._lock:
            state = self._authenticated(session_id, token)
            if state.selection is None:
                raise SessionConflict(
                    "Select a component before storing a draft")
            if draft.patch.selection_id != state.selection.selection_id:
                raise SessionConflict(
                    "Draft patch does not match the current selection")

            state.draft = DraftState(
                selection_id=state.selection.selection_id,
                **draft.model_dump(),
            )
            self._persist(state)
            self._append_event(
                session_id,
                "draft_updated",
                {
                    "selectionId": state.draft.selection_id,
                    "patchId": state.draft.patch.patch_id,
                },
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
            change = change.model_copy(
                update={"change_hash": change_hash(change)}, deep=True)
            state.approved_changes.append(change)
            state.approval = issue_approval(state.approved_changes)
            state.draft = None
            self._persist(state)
            self._append_event(
                session_id,
                "change_approved",
                {"changeId": change.change_id,
                    "ledgerHash": state.approval.ledger_hash},
            )

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
            self._persist(state)
            self._append_event(session_id, "draft_cleared", {})

    def set_workspace_source(
        self,
        session_id: str,
        token: str,
        source: StaticSourceWorkspace,
    ) -> StaticSourceWorkspace:
        with self._lock:
            state = self._authenticated(session_id, token)
            if (
                state.workspace_source is not None
                and state.workspace_source.base_commit_sha
                != source.base_commit_sha
            ):
                state.workspace_draft = None
                state.approved_workspace_changes = []
                state.workspace_approval = None
            state.workspace_source = source.model_copy(deep=True)
            self._persist(state)
            self._append_event(
                session_id,
                "workspace_source_loaded",
                {
                    "baseCommitSha": source.base_commit_sha,
                    "files": sorted(source.files),
                },
            )
            return state.workspace_source.model_copy(deep=True)

    def get_workspace_source(
        self,
        session_id: str,
        token: str,
        *,
        composed: bool = False,
    ) -> StaticSourceWorkspace:
        with self._lock:
            state = self._authenticated(session_id, token)
            if state.workspace_source is None:
                raise SessionConflict("Load repository source before preview")
            source = (
                self._composed_workspace(state)
                if composed
                else state.workspace_source
            )
            return source.model_copy(deep=True)

    def set_workspace_draft(
        self,
        session_id: str,
        token: str,
        draft: WorkspaceDraftRequest,
    ) -> WorkspaceDraftState:
        with self._lock:
            state = self._authenticated(session_id, token)
            current = self._composed_workspace(state)
            apply_workspace_patch(current, draft.patch)
            state.workspace_draft = WorkspaceDraftState.model_validate(
                draft.model_dump(mode="json", by_alias=True)
            )
            self._persist(state)
            self._append_event(
                session_id,
                "workspace_draft_updated",
                {"patchId": state.workspace_draft.patch.patch_id},
            )
            return state.workspace_draft.model_copy(deep=True)

    def approve_workspace_draft(
        self,
        session_id: str,
        token: str,
    ) -> WorkspaceApprovalResponse:
        with self._lock:
            state = self._authenticated(session_id, token)
            if state.workspace_draft is None:
                raise SessionConflict("There is no workspace draft to approve")
            if not state.workspace_draft.qa.passed:
                raise SessionConflict("Workspace draft QA must pass before approval")

            before = self._composed_workspace(state)
            after = apply_workspace_patch(before, state.workspace_draft.patch)
            change = ApprovedWorkspaceChange(
                change_id=str(uuid4()),
                change_hash="",
                request=state.workspace_draft.request,
                workspace_patch=state.workspace_draft.patch,
                source_hashes_before={
                    path: stable_hash(content)
                    for path, content in before.files.items()
                },
                source_hashes_after={
                    path: stable_hash(content)
                    for path, content in after.files.items()
                },
                before_screenshot=state.workspace_draft.before_screenshot,
                after_screenshot=state.workspace_draft.after_screenshot,
                qa=state.workspace_draft.qa,
                approved_at=datetime.now(timezone.utc),
            )
            change = change.model_copy(
                update={"change_hash": change_hash(change)},
                deep=True,
            )
            state.approved_workspace_changes.append(change)
            state.workspace_approval = issue_approval(
                state.approved_workspace_changes
            )
            state.workspace_draft = None
            self._persist(state)
            self._append_event(
                session_id,
                "workspace_change_approved",
                {
                    "changeId": change.change_id,
                    "ledgerHash": state.workspace_approval.ledger_hash,
                },
            )
            return WorkspaceApprovalResponse(
                change=change.model_copy(deep=True),
                approval_token=state.workspace_approval.token,
                ledger_hash=state.workspace_approval.ledger_hash,
            )

    def get_workspace_changes(
        self,
        session_id: str,
        token: str,
    ) -> list[ApprovedWorkspaceChange]:
        with self._lock:
            state = self._authenticated(session_id, token)
            return [
                change.model_copy(deep=True)
                for change in state.approved_workspace_changes
            ]

    def clear_workspace_draft(self, session_id: str, token: str) -> None:
        with self._lock:
            state = self._authenticated(session_id, token)
            state.workspace_draft = None
            self._persist(state)
            self._append_event(session_id, "workspace_draft_cleared", {})

    def reset_workspace(self, session_id: str, token: str) -> None:
        with self._lock:
            state = self._authenticated(session_id, token)
            state.selection = None
            state.draft = None
            state.approved_changes = []
            state.approval = None
            state.workspace_source = None
            state.workspace_draft = None
            state.approved_workspace_changes = []
            state.workspace_approval = None
            self._persist(state)
            self._append_event(session_id, "workspace_reset", {})

    def bind_installation(
        self,
        session_id: str,
        installation: GitHubInstallation,
    ) -> GitHubInstallation:
        with self._lock:
            state = self._state(session_id)
            if state.github_installation != installation:
                state.repository = None
            state.github_installation = installation.model_copy(deep=True)
            self._persist(state)
            self._append_event(
                session_id,
                "github_bound",
                {"installationId": installation.installation_id,
                    "account": installation.account},
            )
            return state.github_installation.model_copy(deep=True)

    def begin_github_install(self, session_id: str, token: str) -> str:
        with self._lock:
            state = self._authenticated(session_id, token)
            nonce = secrets.token_urlsafe(32)
            state.github_install_attempt = GitHubInstallAttempt(
                nonce=nonce,
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
            self._persist(state)
            return nonce

    def consume_github_install(self, session_id: str, nonce: str) -> None:
        with self._lock:
            state = self._state(session_id)
            attempt = state.github_install_attempt
            if (
                attempt is None
                or attempt.consumed
                or datetime.now(timezone.utc) >= attempt.expires_at
                or not secrets.compare_digest(attempt.nonce, nonce)
            ):
                raise SessionConflict(
                    "Invalid or expired GitHub installation state")
            attempt.consumed = True
            self._persist(state)

    def set_pending_installation(
        self,
        session_id: str,
        nonce: str,
        installation: GitHubInstallation,
    ) -> GitHubInstallation:
        with self._lock:
            state = self._state(session_id)
            attempt = state.github_install_attempt
            if (
                attempt is None
                or not attempt.consumed
                or datetime.now(timezone.utc) >= attempt.expires_at
                or not secrets.compare_digest(attempt.nonce, nonce)
            ):
                raise SessionConflict(
                    "Invalid or expired GitHub installation state")
            attempt.candidate = installation.model_copy(deep=True)
            self._persist(state)
            return attempt.candidate.model_copy(deep=True)

    def get_pending_installation(
        self,
        session_id: str,
        token: str,
    ) -> GitHubInstallation | None:
        with self._lock:
            state = self._authenticated(session_id, token)
            attempt = state.github_install_attempt
            if attempt is None or datetime.now(timezone.utc) >= attempt.expires_at:
                state.github_install_attempt = None
                self._persist(state)
                return None
            return self._copy(attempt.candidate)

    def confirm_pending_installation(
        self,
        session_id: str,
        token: str,
    ) -> GitHubInstallation:
        with self._lock:
            state = self._authenticated(session_id, token)
            attempt = state.github_install_attempt
            if (
                attempt is None
                or not attempt.consumed
                or attempt.candidate is None
                or datetime.now(timezone.utc) >= attempt.expires_at
            ):
                state.github_install_attempt = None
                self._persist(state)
                raise SessionConflict(
                    "There is no pending GitHub installation to confirm")
            installation = attempt.candidate.model_copy(deep=True)
            if state.github_installation != installation:
                state.repository = None
            state.github_installation = installation
            state.github_install_attempt = None
            self._persist(state)
            self._append_event(
                session_id,
                "github_bound",
                {"installationId": installation.installation_id,
                    "account": installation.account},
            )
            return installation.model_copy(deep=True)

    def get_github_connection(
        self,
        session_id: str,
        token: str,
    ) -> tuple[GitHubInstallation | None, RepositoryBinding | None]:
        with self._lock:
            state = self._authenticated(session_id, token)
            return self._copy(state.github_installation), self._copy(state.repository)

    def get_installation(
        self,
        session_id: str,
        token: str,
    ) -> GitHubInstallation:
        with self._lock:
            state = self._authenticated(session_id, token)
            if state.github_installation is None:
                raise SessionConflict(
                    "Connect GitHub before selecting a repository")
            return state.github_installation.model_copy(deep=True)

    def bind_repository(
        self,
        session_id: str,
        token: str,
        repository: RepositorySummary,
    ) -> RepositoryBinding:
        with self._lock:
            state = self._authenticated(session_id, token)
            if state.github_installation is None:
                raise SessionConflict(
                    "Connect GitHub before selecting a repository")
            state.repository = RepositoryBinding(
                **repository.model_dump(),
                installation_id=state.github_installation.installation_id,
                account=state.github_installation.account,
            )
            self._persist(state)
            self._append_event(
                session_id,
                "repository_bound",
                {
                    "repositoryId": state.repository.repository_id,
                    "fullName": state.repository.full_name,
                },
            )
            return state.repository.model_copy(deep=True)

    def disconnect_repository(self, session_id: str, token: str) -> None:
        with self._lock:
            state = self._authenticated(session_id, token)
            state.repository = None
            self._persist(state)
            self._append_event(session_id, "repository_disconnected", {})

    def get_events(
        self,
        session_id: str,
        token: str,
    ) -> list[dict[str, Any]]:
        with self._lock:
            self._authenticated(session_id, token)
            if not self._convex.configured:
                return []
            try:
                events = self._convex.query(
                    "runEvents:list", {"sessionId": session_id})
            except ConvexUnavailable:
                self._persistence = "memory-fallback"
                return []
            self._persistence = "convex"
            return [
                {
                    "kind": event["kind"],
                    "payload": event["payload"],
                    "createdAt": event["createdAt"],
                }
                for event in events or []
            ]

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

    def prepare_release(
        self,
        session_id: str,
        session_token: str,
        approval_token: str,
        change_ids: list[str],
    ) -> ReleaseSnapshot:
        with self._lock:
            state = self._authenticated(session_id, session_token)
            if state.repository is None:
                raise SessionConflict(
                    "Select a GitHub repository before release")
            if change_ids != [change.change_id for change in state.approved_changes]:
                raise SessionConflict(
                    "Release changes must match the approved ledger in order")

            references = [
                ApprovedChangeReference(
                    change_id=change.change_id,
                    change_hash=change.change_hash,
                )
                for change in state.approved_changes
            ]
            current_hash = verify_approval(
                state.approval,
                approval_token,
                references,
                state.approved_changes,
            )
            return ReleaseSnapshot(
                ledger_hash=current_hash,
                changes=tuple(
                    change.model_copy(deep=True) for change in state.approved_changes
                ),
                repository=state.repository.model_copy(deep=True),
            )

    def _authenticated(self, session_id: str, token: str) -> SessionState:
        state = self._state(session_id)
        if not token or not secrets.compare_digest(state.token, token):
            raise InvalidSessionToken
        return state

    def _state(self, session_id: str) -> SessionState:
        state = self._sessions.get(session_id)
        if state is None:
            state = self._load(session_id)
        if state is None:
            raise SessionNotFound
        return state

    def _load(self, session_id: str) -> SessionState | None:
        if not self._convex.configured:
            return None
        try:
            record = self._convex.query(
                "sessions:get", {"sessionId": session_id})
            if record is None:
                self._persistence = "convex"
                return None
            state = self._deserialize_state(record)
        except (ConvexUnavailable, KeyError, TypeError, ValueError):
            self._persistence = "memory-fallback"
            return None
        self._sessions[session_id] = state
        self._persistence = "convex"
        return state

    def _persist(self, state: SessionState) -> None:
        self._sessions[state.session_id] = state
        if not self._convex.configured:
            return
        try:
            self._convex.mutation(
                "sessions:put",
                {
                    "sessionId": state.session_id,
                    "sessionToken": state.token,
                    "payload": self._serialize_state(state),
                },
            )
        except ConvexUnavailable:
            self._persistence = "memory-fallback"
        else:
            self._persistence = "convex"

    def _append_event(self, session_id: str, kind: str, payload: dict[str, Any]) -> None:
        if not self._convex.configured:
            return
        try:
            self._convex.mutation(
                "runEvents:append",
                {"sessionId": session_id, "kind": kind, "payload": payload},
            )
        except ConvexUnavailable:
            self._persistence = "memory-fallback"

    @staticmethod
    def _serialize_state(state: SessionState) -> dict[str, Any]:
        def dump(model):
            return model.model_dump(mode="json", by_alias=True) if model is not None else None

        attempt = state.github_install_attempt
        approval = state.approval
        workspace_approval = state.workspace_approval
        return {
            "sessionId": state.session_id,
            "token": state.token,
            "selection": dump(state.selection),
            "draft": dump(state.draft),
            "approvedChanges": [dump(change) for change in state.approved_changes],
            "githubInstallation": dump(state.github_installation),
            "githubInstallAttempt": (
                {
                    "nonce": attempt.nonce,
                    "expiresAt": attempt.expires_at.isoformat(),
                    "consumed": attempt.consumed,
                    "candidate": dump(attempt.candidate),
                }
                if attempt is not None
                else None
            ),
            "repository": dump(state.repository),
            "approval": (
                {
                    "token": approval.token,
                    "ledgerHash": approval.ledger_hash,
                    "references": [dump(reference) for reference in approval.references],
                }
                if approval is not None
                else None
            ),
            "workspaceSource": dump(state.workspace_source),
            "workspaceDraft": dump(state.workspace_draft),
            "approvedWorkspaceChanges": [
                dump(change) for change in state.approved_workspace_changes
            ],
            "workspaceApproval": (
                {
                    "token": workspace_approval.token,
                    "ledgerHash": workspace_approval.ledger_hash,
                    "references": [
                        dump(reference)
                        for reference in workspace_approval.references
                    ],
                }
                if workspace_approval is not None
                else None
            ),
        }

    @staticmethod
    def _deserialize_state(record: dict[str, Any]) -> SessionState:
        payload = record["payload"]
        attempt_data = payload.get("githubInstallAttempt")
        approval_data = payload.get("approval")
        workspace_approval_data = payload.get("workspaceApproval")
        attempt = None
        if attempt_data is not None:
            candidate = attempt_data.get("candidate")
            attempt = GitHubInstallAttempt(
                nonce=attempt_data["nonce"],
                expires_at=datetime.fromisoformat(attempt_data["expiresAt"]),
                consumed=attempt_data.get("consumed", False),
                candidate=(
                    GitHubInstallation.model_validate(candidate)
                    if candidate is not None
                    else None
                ),
            )
        approval = None
        if approval_data is not None:
            approval = ApprovalRecord(
                token=approval_data["token"],
                ledger_hash=approval_data["ledgerHash"],
                references=tuple(
                    ApprovedChangeReference.model_validate(reference)
                    for reference in approval_data["references"]
                ),
            )
        workspace_approval = None
        if workspace_approval_data is not None:
            workspace_approval = ApprovalRecord(
                token=workspace_approval_data["token"],
                ledger_hash=workspace_approval_data["ledgerHash"],
                references=tuple(
                    ApprovedChangeReference.model_validate(reference)
                    for reference in workspace_approval_data["references"]
                ),
            )
        return SessionState(
            session_id=record["sessionId"],
            token=record["sessionToken"],
            selection=(
                SelectedComponent.model_validate(payload["selection"])
                if payload.get("selection") is not None
                else None
            ),
            draft=(
                DraftState.model_validate(payload["draft"])
                if payload.get("draft") is not None
                else None
            ),
            approved_changes=[
                ApprovedChange.model_validate(change)
                for change in payload.get("approvedChanges", [])
            ],
            github_installation=(
                GitHubInstallation.model_validate(
                    payload["githubInstallation"])
                if payload.get("githubInstallation") is not None
                else None
            ),
            github_install_attempt=attempt,
            repository=(
                RepositoryBinding.model_validate(payload["repository"])
                if payload.get("repository") is not None
                else None
            ),
            approval=approval,
            workspace_source=(
                StaticSourceWorkspace.model_validate(payload["workspaceSource"])
                if payload.get("workspaceSource") is not None
                else None
            ),
            workspace_draft=(
                WorkspaceDraftState.model_validate(payload["workspaceDraft"])
                if payload.get("workspaceDraft") is not None
                else None
            ),
            approved_workspace_changes=[
                ApprovedWorkspaceChange.model_validate(change)
                for change in payload.get("approvedWorkspaceChanges", [])
            ],
            workspace_approval=workspace_approval,
        )

    @staticmethod
    def _composed_workspace(state: SessionState) -> StaticSourceWorkspace:
        if state.workspace_source is None:
            raise SessionConflict("Load repository source before preview")
        files = dict(state.workspace_source.files)
        for change in state.approved_workspace_changes:
            files.update(change.workspace_patch.files)
        return StaticSourceWorkspace(
            base_commit_sha=state.workspace_source.base_commit_sha,
            files=files,
        )

    @staticmethod
    def _copy(
        model: SelectedComponent
        | DraftState
        | GitHubInstallation
        | RepositoryBinding
        | None,
    ):
        return model.model_copy(deep=True) if model is not None else None
