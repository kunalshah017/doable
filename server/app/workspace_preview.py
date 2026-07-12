import re
import subprocess
from html.parser import HTMLParser
from urllib.parse import urlparse

import tinycss2
from tinycss2.ast import ParseError

from app.models import StaticFilePath, StaticSourceWorkspace, WorkspacePatch

MAX_FILE_BYTES = 250_000
MAX_WORKSPACE_BYTES = 600_000
UNSAFE_CSS = re.compile(
    r"(?:@import\b|expression\s*\(|javascript\s*:|-moz-binding)",
    re.IGNORECASE,
)
UNSAFE_JS = re.compile(
    r"(?:navigator\.serviceWorker|document\.cookie|localStorage|sessionStorage|"
    r"window\.top|window\.opener|\bfetch\s*\(|XMLHttpRequest|WebSocket|"
    r"EventSource|sendBeacon)",
)
STYLESHEET_LINK = re.compile(
    r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])(?=[^>]*\bhref=["\']styles\.css["\'])[^>]*>',
    re.IGNORECASE,
)
SCRIPT_ELEMENT = re.compile(
    r'<script\b[^>]*\bsrc=["\'][^"\']+["\'][^>]*>\s*</script>',
    re.IGNORECASE,
)


class WorkspacePreviewInvalid(ValueError):
    pass


class _WorkspaceHTMLValidator(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.error: str | None = None

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        normalized = {name.lower(): value or "" for name, value in attrs}
        if tag.lower() in {"base", "object", "embed"}:
            self.error = f"HTML contains unsafe element: {tag}"
            return
        if any(name.startswith("on") for name in normalized):
            self.error = "HTML contains an inline event handler"
            return
        if any("javascript:" in value.lower() for value in normalized.values()):
            self.error = "HTML contains a javascript URL"
            return
        if tag.lower() == "form" and normalized.get("action"):
            action = urlparse(normalized["action"])
            if action.scheme or action.netloc:
                self.error = "HTML contains a cross-origin form action"
                return
        if tag.lower() == "script":
            src = normalized.get("src")
            if not src or src.split("?", 1)[0].lstrip("./") != "script.js":
                self.error = "HTML contains an unsupported executable script"

    handle_startendtag = handle_starttag


def validate_workspace(files: dict[StaticFilePath, str]) -> None:
    if "index.html" not in files:
        raise WorkspacePreviewInvalid("Static workspace requires index.html")

    sizes = [len(content.encode("utf-8")) for content in files.values()]
    if any(size > MAX_FILE_BYTES for size in sizes):
        raise WorkspacePreviewInvalid("Workspace file exceeds 250 KB")
    if sum(sizes) > MAX_WORKSPACE_BYTES:
        raise WorkspacePreviewInvalid("Workspace exceeds 600 KB")

    parser = _WorkspaceHTMLValidator()
    try:
        parser.feed(files["index.html"])
        parser.close()
    except Exception as exception:
        raise WorkspacePreviewInvalid(
            "index.html contains invalid HTML") from exception
    if parser.error:
        raise WorkspacePreviewInvalid(parser.error)

    css_source = files.get("styles.css", "")
    stylesheet = tinycss2.parse_stylesheet(
        css_source,
        skip_comments=False,
        skip_whitespace=False,
    )
    if UNSAFE_CSS.search(css_source) or any(
        isinstance(node, ParseError) for node in stylesheet
    ):
        raise WorkspacePreviewInvalid("Workspace contains unsafe CSS")

    javascript = files.get("script.js", "")
    if UNSAFE_JS.search(javascript):
        raise WorkspacePreviewInvalid(
            "JavaScript contains a denied network API")
    if javascript:
        try:
            result = subprocess.run(
                ["node", "--check", "-"],
                input=javascript,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exception:
            raise WorkspacePreviewInvalid(
                "JavaScript validation is unavailable"
            ) from exception
        if result.returncode != 0:
            raise WorkspacePreviewInvalid(
                "script.js contains invalid JavaScript")


def apply_workspace_patch(
    workspace: StaticSourceWorkspace,
    patch: WorkspacePatch,
) -> StaticSourceWorkspace:
    if patch.base_commit_sha != workspace.base_commit_sha:
        raise WorkspacePreviewInvalid(
            "Patch base commit does not match workspace")
    files = dict(workspace.files)
    files.update(patch.files)
    validate_workspace(files)
    return StaticSourceWorkspace(
        base_commit_sha=workspace.base_commit_sha,
        files=files,
    )


def _insert_before_closing(source: str, tag: str, insertion: str) -> str:
    marker = f"</{tag}>"
    index = source.lower().rfind(marker)
    if index == -1:
        return f"{source}{insertion}"
    return f"{source[:index]}{insertion}{source[index:]}"


def build_preview_document(workspace: StaticSourceWorkspace) -> str:
    source = STYLESHEET_LINK.sub("", workspace.files["index.html"])
    source = SCRIPT_ELEMENT.sub("", source)
    safe_css = workspace.files.get("styles.css", "").replace(
        "</style", "<\\/style"
    )
    safe_js = workspace.files.get("script.js", "").replace(
        "</script", "<\\/script"
    )
    source = _insert_before_closing(
        source,
        "head",
        f"<style data-doable-preview>{safe_css}</style>",
    )
    return _insert_before_closing(
        source,
        "body",
        f"<script data-doable-preview>{safe_js}</script>",
    )
