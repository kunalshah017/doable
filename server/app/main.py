from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Response, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.hermes_service import HermesInvalidResponse, HermesService, HermesUnavailable
from app.ledger import InvalidApprovalToken, LedgerMismatch
from app.models import (
    ApprovalResponse,
    ChangesResponse,
    DraftRequest,
    DraftResponse,
    HermesStatusResponse,
    PreviewRequest,
    PreviewResponse,
    QAResult,
    ReleaseVerificationRequest,
    ReleaseVerificationResponse,
    SelectedComponent,
    SelectionResponse,
    SessionCreatedResponse,
    SessionStatusResponse,
)
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


def require_token(
    x_doable_session_token: Annotated[str | None, Header(alias="X-Doable-Session-Token")] = None,
) -> str:
    if not x_doable_session_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid session token")
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


@app.post("/v1/sessions", response_model=SessionCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_session() -> SessionCreatedResponse:
    return store.create()


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
