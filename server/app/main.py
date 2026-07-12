from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from app.github_app import (
    GitHubAPIError,
    GitHubApp,
    GitHubConfigurationError,
    InvalidGitHubState,
)
from app.github_client import GitHubClient
from app.hermes_service import HermesInvalidResponse, HermesService, HermesUnavailable
from app.ledger import InvalidApprovalToken, LedgerMismatch
from app.models import (
    ApprovalResponse,
    ChangesResponse,
    DraftRequest,
    DraftResponse,
    GitHubInstallation,
    GitHubInstallStartResponse,
    GitHubRepositoriesResponse,
    GitHubStatusResponse,
    HermesStatusResponse,
    PreviewRequest,
    PreviewResponse,
    QAResult,
    ReleaseRequest,
    ReleaseResponse,
    ReleaseVerificationRequest,
    ReleaseVerificationResponse,
    RepositoryBindRequest,
    RepositoryBinding,
    SelectedComponent,
    SelectionResponse,
    SessionCreatedResponse,
    SessionStatusResponse,
)
from app.release_service import ReleaseBlocked, ReleaseService
from app.sessions import InvalidSessionToken, SessionConflict, SessionNotFound, SessionStore

app = FastAPI(title="Doable Server")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.+|https?://(localhost|127\.0\.0\.1)(:\d+)?)$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
store = SessionStore()
hermes_service = HermesService()
github_app = GitHubApp()
release_service = ReleaseService()


def require_token(
    x_doable_session_token: Annotated[str | None, Header(
        alias="X-Doable-Session-Token")] = None,
) -> str:
    if not x_doable_session_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid session token")
    return x_doable_session_token


SessionToken = Annotated[str, Depends(require_token)]


@app.exception_handler(SessionNotFound)
async def session_not_found_handler(*_) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "Session not found"})


@app.exception_handler(InvalidSessionToken)
@app.exception_handler(InvalidApprovalToken)
async def invalid_token_handler(*_) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"detail": "Invalid token"})


@app.exception_handler(SessionConflict)
@app.exception_handler(LedgerMismatch)
async def conflict_handler(_, exception: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": str(exception) or "Approval ledger mismatch"},
    )


@app.exception_handler(HermesUnavailable)
async def hermes_unavailable_handler(_, exception: HermesUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": str(exception)},
    )


@app.exception_handler(HermesInvalidResponse)
async def hermes_invalid_response_handler(_, exception: HermesInvalidResponse) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": str(exception)},
    )


@app.exception_handler(GitHubConfigurationError)
async def github_configuration_handler(
    _, exception: GitHubConfigurationError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": str(exception)},
    )


@app.exception_handler(InvalidGitHubState)
async def invalid_github_state_handler(*_) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Invalid or expired GitHub installation state"},
    )


@app.exception_handler(GitHubAPIError)
async def github_api_handler(_, exception: GitHubAPIError) -> JSONResponse:
    return JSONResponse(
        status_code=exception.status_code,
        content={"detail": str(exception)},
    )


@app.exception_handler(ReleaseBlocked)
async def release_blocked_handler(_, exception: ReleaseBlocked) -> JSONResponse:
    return JSONResponse(
        status_code=exception.status_code,
        content={"code": exception.code, "detail": str(exception)},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get(
    "/v1/hermes/status",
    response_model=HermesStatusResponse,
    response_model_exclude_none=True,
)
async def hermes_status() -> HermesStatusResponse:
    try:
        await hermes_service.health()
    except HermesUnavailable as exception:
        return HermesStatusResponse(status="unavailable", detail=str(exception))
    return HermesStatusResponse(status="available")


@app.get(
    "/v1/github/status",
    response_model=GitHubStatusResponse,
    response_model_exclude_none=True,
)
def github_status(
    session_id: Annotated[str | None, Query(alias="sessionId")] = None,
    session_token: Annotated[
        str | None, Header(alias="X-Doable-Session-Token")
    ] = None,
) -> GitHubStatusResponse:
    configured, detail = github_app.status()
    if session_id is None:
        return GitHubStatusResponse(configured=configured, detail=detail)
    if not session_token:
        raise InvalidSessionToken
    installation, repository = store.get_github_connection(
        session_id, session_token)
    pending_installation = store.get_pending_installation(
        session_id, session_token)
    return GitHubStatusResponse(
        configured=configured,
        detail=detail,
        connected=installation is not None,
        account=installation.account if installation is not None else None,
        pending_account=(
            pending_installation.account if pending_installation is not None else None
        ),
        repository=repository,
    )


@app.post("/v1/sessions", response_model=SessionCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_session() -> SessionCreatedResponse:
    return store.create()


@app.post(
    "/v1/sessions/{session_id}/github/install/start",
    response_model=GitHubInstallStartResponse,
)
def start_github_install(
    session_id: str,
    token: SessionToken,
) -> GitHubInstallStartResponse:
    nonce = store.begin_github_install(session_id, token)
    return GitHubInstallStartResponse(
        install_url=github_app.installation_url(session_id, nonce)
    )


@app.get("/v1/github/callback", response_class=HTMLResponse)
async def github_callback(
    installation_id: int,
    setup_action: str,
    state: str,
) -> HTMLResponse:
    if installation_id <= 0 or setup_action not in {"install", "update"}:
        raise InvalidGitHubState
    session_id, nonce = github_app.verify_state(state)
    try:
        store.consume_github_install(session_id, nonce)
    except SessionConflict as exception:
        raise InvalidGitHubState from exception
    account = await github_app.installation_account(installation_id)
    try:
        store.set_pending_installation(
            session_id,
            nonce,
            GitHubInstallation(
                installation_id=installation_id, account=account),
        )
    except SessionConflict as exception:
        raise InvalidGitHubState from exception
    return HTMLResponse(
        "<!doctype html><html><head><title>GitHub installation ready</title></head>"
        "<body><main><h1>GitHub installation ready</h1>"
        "<p>Return to Doable to confirm this installation.</p></main></body></html>"
    )


@app.post(
    "/v1/sessions/{session_id}/github/install/confirm",
    response_model=GitHubInstallation,
)
def confirm_github_install(
    session_id: str,
    token: SessionToken,
) -> GitHubInstallation:
    return store.confirm_pending_installation(
        session_id,
        token,
    )


@app.get(
    "/v1/sessions/{session_id}/github/repositories",
    response_model=GitHubRepositoriesResponse,
)
async def list_github_repositories(
    session_id: str,
    token: SessionToken,
) -> GitHubRepositoriesResponse:
    installation = store.get_installation(session_id, token)
    client = GitHubClient(github_app, installation.installation_id)
    return GitHubRepositoriesResponse(repositories=await client.list_repositories())


@app.put(
    "/v1/sessions/{session_id}/github/repository",
    response_model=RepositoryBinding,
)
async def bind_github_repository(
    session_id: str,
    request: RepositoryBindRequest,
    token: SessionToken,
) -> RepositoryBinding:
    installation = store.get_installation(session_id, token)
    client = GitHubClient(github_app, installation.installation_id)
    repositories = await client.list_repositories()
    repository = next(
        (
            candidate
            for candidate in repositories
            if candidate.repository_id == request.repository_id
        ),
        None,
    )
    if repository is None:
        raise SessionConflict(
            "Repository is not accessible to this GitHub installation")
    return store.bind_repository(session_id, token, repository)


@app.delete(
    "/v1/sessions/{session_id}/github/repository",
    status_code=status.HTTP_204_NO_CONTENT,
)
def disconnect_github_repository(
    session_id: str,
    token: SessionToken,
) -> Response:
    store.disconnect_repository(session_id, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/v1/sessions/{session_id}", response_model=SessionStatusResponse)
def get_session(session_id: str, token: SessionToken) -> SessionStatusResponse:
    return store.get_status(session_id, token)


@app.put("/v1/sessions/{session_id}/selection", response_model=SelectionResponse)
def put_selection(
    session_id: str,
    selection: SelectedComponent,
    token: SessionToken,
) -> SelectionResponse:
    return SelectionResponse(selection=store.set_selection(session_id, token, selection))


@app.put("/v1/sessions/{session_id}/draft", response_model=DraftResponse)
def put_draft(
    session_id: str,
    draft: DraftRequest,
    token: SessionToken,
) -> DraftResponse:
    return DraftResponse(draft=store.set_draft(session_id, token, draft))


@app.post(
    "/v1/sessions/{session_id}/preview",
    response_model=PreviewResponse,
    response_model_exclude_none=True,
)
async def create_preview(
    session_id: str,
    request: PreviewRequest,
    token: SessionToken,
) -> PreviewResponse:
    selection = store.get_status(session_id, token).selection
    if selection is None:
        raise SessionConflict("Select a component before requesting a preview")

    patch, response_id = await hermes_service.preview(request.request, selection, session_id)
    store.set_draft(
        session_id,
        token,
        DraftRequest(
            request=request.request,
            patch=patch,
            before_screenshot=selection.screenshot_data_url,
            after_screenshot="",
            qa=QAResult(passed=False, checks=["prototype_qa_pending"]),
        ),
    )
    return PreviewResponse(patch=patch, response_id=response_id)


@app.post("/v1/sessions/{session_id}/changes/approve", response_model=ApprovalResponse)
def approve_change(
    session_id: str,
    token: SessionToken,
) -> ApprovalResponse:
    return store.approve_draft(session_id, token)


@app.get("/v1/sessions/{session_id}/changes", response_model=ChangesResponse)
def get_changes(
    session_id: str,
    token: SessionToken,
) -> ChangesResponse:
    return ChangesResponse(changes=store.get_changes(session_id, token))


@app.delete("/v1/sessions/{session_id}/draft", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(
    session_id: str,
    token: SessionToken,
) -> Response:
    store.clear_draft(session_id, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/v1/sessions/{session_id}/release/verify", response_model=ReleaseVerificationResponse)
def verify_release(
    session_id: str,
    request: ReleaseVerificationRequest,
    token: SessionToken,
) -> ReleaseVerificationResponse:
    current_hash = store.verify_release(
        session_id,
        token,
        request.approval_token,
        request.changes,
    )
    return ReleaseVerificationResponse(verified=True, ledger_hash=current_hash)


@app.post(
    "/v1/sessions/{session_id}/release",
    response_model=ReleaseResponse,
)
async def create_release(
    session_id: str,
    request: ReleaseRequest,
    token: SessionToken,
) -> ReleaseResponse:
    snapshot = store.prepare_release(
        session_id,
        token,
        request.approval_token,
        request.changes,
    )
    repository = snapshot.repository
    client = GitHubClient(
        github_app,
        repository.installation_id,
        repository.repository_id,
    )
    return await release_service.release(snapshot, client)


@app.websocket("/v1/extension/{session_id}")
async def extension_socket(websocket: WebSocket, session_id: str, token: str) -> None:
    try:
        store.authenticate(session_id, token)
    except SessionNotFound:
        await websocket.close(code=4404)
        return
    except InvalidSessionToken:
        await websocket.close(code=4403)
        return

    await websocket.accept()
    await websocket.send_json({"type": "ready", "sessionId": session_id})
    try:
        while True:
            message = await websocket.receive_json()
            await websocket.send_json({"type": "echo", "payload": message})
    except WebSocketDisconnect:
        pass
