import json
import re
from typing import Any
from uuid import uuid4

from pydantic import ValidationError

from app.hermes_service import HermesInvalidResponse, HermesService
from app.models import SelectedComponent, StaticSourceWorkspace, WorkspacePatch

WORKSPACE_INSTRUCTIONS = """You are the Doable static-site source editor. Return ONLY one JSON object with camelCase fields files, summary, and rationale. files may contain only index.html, styles.css, and script.js, and must contain complete replacement contents only for changed files. You may add, remove, or reorder HTML; add complete CSS including media queries and animations; and add browser JavaScript interactions. Preserve behavior unrelated to the request. Do not add remote scripts, network calls, storage or cookie access, service workers, top-window access, inline event-handler attributes, javascript: URLs, or unsupported files. Do not wrap the JSON in prose or markdown."""


class WorkspaceHermesService(HermesService):
    async def preview(
        self,
        manager_request: str,
        workspace: StaticSourceWorkspace,
        selection: SelectedComponent | None,
        session_id: str,
    ) -> tuple[WorkspacePatch, str | None]:
        response = await self._request(
            "POST",
            "/v1/responses",
            json={
                "model": "hermes-agent",
                "store": True,
                "conversation": f"doable-{session_id}",
                "instructions": WORKSPACE_INSTRUCTIONS,
                "input": self._prompt_workspace(
                    manager_request,
                    workspace,
                    selection,
                ),
            },
        )
        try:
            body = response.json()
        except ValueError as exception:
            raise HermesInvalidResponse(
                "Hermes returned a non-JSON API response. Retry the preview request."
            ) from exception

        text = self._extract_output_text(body)
        patch = self._parse_workspace_patch(text, workspace, selection)
        response_id = (
            body.get("id")
            if isinstance(body, dict) and isinstance(body.get("id"), str)
            else None
        )
        return patch, response_id

    @staticmethod
    def _prompt_workspace(
        manager_request: str,
        workspace: StaticSourceWorkspace,
        selection: SelectedComponent | None,
    ) -> str:
        context: dict[str, Any] = {
            "request": manager_request,
            "workspace": workspace.model_dump(mode="json", by_alias=True),
        }
        if selection is not None:
            context["selection"] = {
                "selectionId": selection.selection_id,
                "selector": selection.selector[:1_000],
                "outerHtml": selection.outer_html[:8_000],
                "parentHtml": selection.parent_html[:6_000],
                "computedStyles": selection.computed_styles,
                "viewport": selection.viewport.model_dump(by_alias=True),
                "pageUrl": selection.page_url[:2_000],
            }
        return "Create the smallest complete-file workspace patch for this context:\n" + json.dumps(
            context,
            ensure_ascii=True,
            separators=(",", ":"),
        )

    @staticmethod
    def _parse_workspace_patch(
        text: str,
        workspace: StaticSourceWorkspace,
        selection: SelectedComponent | None,
    ) -> WorkspacePatch:
        stripped = text.strip()
        fenced = re.fullmatch(
            r"```json\s*(\{.*\})\s*```",
            stripped,
            flags=re.DOTALL | re.IGNORECASE,
        )
        if fenced:
            stripped = fenced.group(1)
        elif stripped.startswith("```"):
            raise HermesInvalidResponse(
                "Hermes returned an invalid fenced response. Retry the preview request."
            )

        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError as exception:
            raise HermesInvalidResponse(
                "Hermes returned invalid workspace patch JSON. Retry the preview request."
            ) from exception
        if not isinstance(payload, dict):
            raise HermesInvalidResponse(
                "Hermes workspace patch JSON must be an object. Retry the preview request."
            )

        for field in (
            "patchId",
            "patch_id",
            "selectionId",
            "selection_id",
            "baseCommitSha",
            "base_commit_sha",
        ):
            payload.pop(field, None)
        payload["patchId"] = str(uuid4())
        payload["baseCommitSha"] = workspace.base_commit_sha
        if selection is not None:
            payload["selectionId"] = selection.selection_id
        if not isinstance(payload.get("rationale"), str) or not payload[
            "rationale"
        ].strip():
            payload["rationale"] = "Hermes generated this workspace preview."

        try:
            return WorkspacePatch.model_validate(payload)
        except ValidationError as exception:
            raise HermesInvalidResponse(
                "Hermes returned an invalid workspace patch. Refine the request and retry."
            ) from exception
