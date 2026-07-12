import json
import os
import re
from typing import Any
from uuid import uuid4

import httpx
from pydantic import ValidationError

from app.models import PreviewPatch, SelectedComponent


class HermesUnavailable(RuntimeError):
    pass


class HermesInvalidResponse(ValueError):
    pass


COMPUTED_STYLE_ALLOWLIST = frozenset(
    {
        "align-items",
        "background-color",
        "border-color",
        "border-radius",
        "border-style",
        "border-width",
        "box-shadow",
        "color",
        "display",
        "flex-direction",
        "font-family",
        "font-size",
        "font-style",
        "font-weight",
        "gap",
        "height",
        "justify-content",
        "letter-spacing",
        "line-height",
        "margin",
        "margin-bottom",
        "margin-left",
        "margin-right",
        "margin-top",
        "max-width",
        "min-height",
        "opacity",
        "padding",
        "padding-bottom",
        "padding-left",
        "padding-right",
        "padding-top",
        "text-align",
        "text-decoration",
        "text-transform",
        "width",
    }
)

INSTRUCTIONS = """You are Hermes, the Doable Engineering Manager. Return ONLY one JSON object for a browser-only PreviewPatch. Use only these camelCase fields: text, attributes, styles, parentStyles, rationale. Keep rationale concise. Limit changes to text and non-event attributes on the selected element, CSS on the selected element, and CSS on its direct parent. Never emit scripts, event handlers, javascript: URLs, HTML replacement, selectors, or changes to any other element. Omit unchanged fields. Do not wrap the object in prose."""


class HermesService:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        client: httpx.AsyncClient | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._base_url = (base_url or os.getenv(
            "HERMES_API_URL", "http://127.0.0.1:8642")).rstrip("/")
        self._api_key = api_key if api_key is not None else os.getenv(
            "HERMES_API_KEY")
        self._client = client
        self._timeout = timeout

    @property
    def timeout(self) -> float:
        return self._timeout

    async def preview(
        self,
        manager_request: str,
        selection: SelectedComponent,
        session_id: str,
    ) -> tuple[PreviewPatch, str | None]:
        response = await self._request(
            "POST",
            "/v1/responses",
            json={
                "model": "hermes-agent",
                "store": True,
                "conversation": f"doable-{session_id}",
                "instructions": INSTRUCTIONS,
                "input": self._prompt(manager_request, selection),
            },
        )
        try:
            body = response.json()
        except ValueError as exception:
            raise HermesInvalidResponse(
                "Hermes returned a non-JSON API response. Retry the preview request.") from exception

        text = self._extract_output_text(body)
        patch = self._parse_patch(text, selection.selection_id)
        response_id = body.get("id") if isinstance(
            body, dict) and isinstance(body.get("id"), str) else None
        return patch, response_id

    async def health(self) -> None:
        await self._request("GET", "/health")

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        if not self._api_key:
            raise HermesUnavailable(
                "Hermes is not configured. Set HERMES_API_KEY and start `hermes gateway run`."
            )

        try:
            if self._client is not None:
                response = await self._client.request(
                    method,
                    f"{self._base_url}{path}",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    **kwargs,
                )
            else:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    response = await client.request(
                        method,
                        f"{self._base_url}{path}",
                        headers={"Authorization": f"Bearer {self._api_key}"},
                        **kwargs,
                    )
        except httpx.RequestError as exception:
            raise HermesUnavailable(
                "Hermes is unavailable. Start `hermes gateway run` and retry."
            ) from exception

        if response.status_code in {401, 403}:
            raise HermesUnavailable(
                "Hermes authentication failed. Check HERMES_API_KEY.")
        if response.is_error:
            raise HermesUnavailable(
                "Hermes rejected the request. Check the gateway logs and retry."
            )
        return response

    @staticmethod
    def _prompt(manager_request: str, selection: SelectedComponent) -> str:
        context = {
            "request": manager_request,
            "selection": {
                "selector": selection.selector[:1_000],
                "doableId": (selection.doable_id or "")[:200],
                "outerHtml": selection.outer_html[:8_000],
                "parentHtml": selection.parent_html[:6_000],
                "computedStyles": {
                    name: value[:500]
                    for name, value in selection.computed_styles.items()
                    if name in COMPUTED_STYLE_ALLOWLIST
                },
                "viewport": selection.viewport.model_dump(by_alias=True),
                "pageUrl": selection.page_url[:2_000],
            },
        }
        return "Create the smallest safe preview patch for this context:\n" + json.dumps(
            context,
            ensure_ascii=True,
            separators=(",", ":"),
        )

    @staticmethod
    def _extract_output_text(body: Any) -> str:
        if not isinstance(body, dict):
            raise HermesInvalidResponse(
                "Hermes returned an invalid API response. Retry the preview request.")

        if isinstance(body.get("output_text"), str) and body["output_text"].strip():
            return body["output_text"].strip()

        texts: list[str] = []
        for item in body.get("output", []):
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            content = item.get("content", [])
            if isinstance(content, str):
                texts.append(content)
                continue
            for part in content if isinstance(content, list) else []:
                if not isinstance(part, dict) or part.get("type") != "output_text":
                    continue
                text = part.get("text")
                if isinstance(text, str):
                    texts.append(text)
                elif isinstance(text, dict) and isinstance(text.get("value"), str):
                    texts.append(text["value"])

        final_text = "\n".join(text.strip() for text in texts if text.strip())
        if not final_text:
            raise HermesInvalidResponse(
                "Hermes returned no final response text. Retry the preview request.")
        return final_text

    @staticmethod
    def _parse_patch(text: str, selection_id: str) -> PreviewPatch:
        stripped = text.strip()
        fenced = re.fullmatch(
            r"```json\s*(\{.*\})\s*```", stripped, flags=re.DOTALL | re.IGNORECASE)
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
                "Hermes returned invalid patch JSON. Retry the preview request.") from exception
        if not isinstance(payload, dict):
            raise HermesInvalidResponse(
                "Hermes patch JSON must be an object. Retry the preview request.")

        payload.pop("patchId", None)
        payload.pop("patch_id", None)
        payload.pop("selectionId", None)
        payload.pop("selection_id", None)
        payload["patchId"] = str(uuid4())
        payload["selectionId"] = selection_id
        if not isinstance(payload.get("rationale"), str) or not payload["rationale"].strip():
            payload["rationale"] = "Hermes generated this preview."

        try:
            return PreviewPatch.model_validate(payload)
        except ValidationError as exception:
            raise HermesInvalidResponse(
                "Hermes returned an unsafe or invalid preview patch. Refine the request and retry."
            ) from exception
