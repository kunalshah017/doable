import asyncio
import html
import re
from dataclasses import dataclass
from html.parser import HTMLParser

import tinycss2
from tinycss2.ast import Declaration, ParseError, QualifiedRule

from app.github_client import GitHubClient
from app.models import ApprovedChange, ReleaseResponse, RepositoryBinding
from app.sessions import ReleaseSnapshot


class ReleaseBlocked(Exception):
    def __init__(self, code: str, detail: str, status_code: int = 422) -> None:
        super().__init__(detail)
        self.code = code
        self.status_code = status_code


@dataclass(slots=True)
class _ElementSource:
    tag: str
    attrs: list[tuple[str, str | None]]
    start: int
    start_end: int
    end_start: int | None = None
    has_child: bool = False
    self_closing: bool = False


class _DoableHTMLParser(HTMLParser):
    def __init__(self, source: str, doable_id: str) -> None:
        super().__init__(convert_charrefs=False)
        self._source = source
        self._doable_id = doable_id
        self._line_offsets = [0]
        self.matches: list[_ElementSource] = []
        self._stack: list[tuple[str, _ElementSource | None]] = []
        for match in re.finditer("\n", source):
            self._line_offsets.append(match.end())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for _, active in self._stack:
            if active is not None:
                active.has_child = True
        element = self._element(tag, attrs, False)
        self._stack.append((tag, element))

    def handle_startendtag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        for _, active in self._stack:
            if active is not None:
                active.has_child = True
        self._element(tag, attrs, True)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self._stack) - 1, -1, -1):
            open_tag, element = self._stack[index]
            if open_tag != tag:
                continue
            del self._stack[index:]
            if element is not None:
                element.end_start = self._offset()
            return

    def _element(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
        self_closing: bool,
    ) -> _ElementSource | None:
        if not any(name == "data-doable-id" and value == self._doable_id for name, value in attrs):
            return None
        raw = self.get_starttag_text() or ""
        start = self._offset()
        element = _ElementSource(
            tag=tag,
            attrs=attrs,
            start=start,
            start_end=start + len(raw),
            self_closing=self_closing,
        )
        self.matches.append(element)
        return element

    def _offset(self) -> int:
        line, column = self.getpos()
        return self._line_offsets[line - 1] + column


@dataclass(frozen=True, slots=True)
class _Translation:
    html_source: str
    css_source: str
    changed_files: dict[str, str]


class StaticSiteTranslator:
    def apply(
        self,
        html_source: str,
        css_source: str,
        change: ApprovedChange,
    ) -> _Translation:
        doable_id = change.selection.doable_id
        if not doable_id:
            raise ReleaseBlocked(
                "source_mapping_not_found",
                "Approved change has no data-doable-id source marker",
            )
        patch = change.preview_patch
        if patch.parent_styles:
            raise ReleaseBlocked(
                "unsupported_change",
                "Prototype release does not support parent style changes",
            )

        parser = _DoableHTMLParser(html_source, doable_id)
        parser.feed(html_source)
        parser.close()
        if not parser.matches:
            raise ReleaseBlocked(
                "source_mapping_not_found",
                f"No element has data-doable-id={doable_id!r}",
            )
        if len(parser.matches) != 1:
            raise ReleaseBlocked(
                "source_mapping_ambiguous",
                f"Multiple elements have data-doable-id={doable_id!r}",
            )
        target = parser.matches[0]
        if target.tag in {"script", "style"}:
            raise ReleaseBlocked(
                "unsupported_change", "Script and style elements cannot be released"
            )

        updated_html = self._apply_html(html_source, target, patch.text, patch.attributes)
        updated_css = css_source
        if patch.styles:
            reparsed = _DoableHTMLParser(updated_html, doable_id)
            reparsed.feed(updated_html)
            reparsed.close()
            target = reparsed.matches[0]
            updated_css = self._apply_css(css_source, target.attrs, patch.styles)

        changed_files: dict[str, str] = {}
        if updated_html != html_source:
            changed_files["index.html"] = updated_html
        if updated_css != css_source:
            changed_files["styles.css"] = updated_css
        if not changed_files:
            raise ReleaseBlocked(
                "unsupported_change", "Approved change produces no source update"
            )
        return _Translation(updated_html, updated_css, changed_files)

    def _apply_html(
        self,
        source: str,
        target: _ElementSource,
        text: str | None,
        attributes: dict[str, str | None] | None,
    ) -> str:
        attrs = list(target.attrs)
        replacements: list[tuple[int, int, str]] = []
        if attributes:
            attrs = self._updated_attributes(attrs, attributes)
            opening = self._serialize_opening_tag(
                target.tag, attrs, target.self_closing
            )
            replacements.append((target.start, target.start_end, opening))
        if text is not None:
            if target.self_closing or target.end_start is None or target.has_child:
                raise ReleaseBlocked(
                    "unsupported_change",
                    "Prototype text release requires a non-nested leaf element",
                )
            replacements.append(
                (target.start_end, target.end_start, html.escape(text, quote=False))
            )

        updated = source
        for start, end, replacement in sorted(replacements, reverse=True):
            updated = updated[:start] + replacement + updated[end:]
        return updated

    def _updated_attributes(
        self,
        attrs: list[tuple[str, str | None]],
        updates: dict[str, str | None],
    ) -> list[tuple[str, str | None]]:
        normalized: dict[str, str | None] = {}
        for name, value in updates.items():
            safe_name = name.strip().lower()
            if not re.fullmatch(r"[a-z_:][a-z0-9_.:-]*", safe_name):
                raise ReleaseBlocked("unsupported_change", f"Invalid attribute: {name}")
            if safe_name.startswith("on") or safe_name in {
                "data-doable-id",
                "srcdoc",
                "style",
            }:
                raise ReleaseBlocked("unsupported_change", f"Unsafe attribute: {name}")
            if value is not None and "javascript:" in value.lower():
                raise ReleaseBlocked("unsupported_change", f"Unsafe attribute value: {name}")
            normalized[safe_name] = value

        result = [
            (name, value)
            for name, value in attrs
            if name not in normalized and name != "data-doable-id"
        ]
        result.append(("data-doable-id", next(
            value for name, value in attrs if name == "data-doable-id"
        )))
        result.extend(
            (name, value)
            for name, value in sorted(normalized.items())
            if value is not None
        )
        return result

    def _apply_css(
        self,
        source: str,
        attrs: list[tuple[str, str | None]],
        updates: dict[str, str | None],
    ) -> str:
        class_value = next((value for name, value in attrs if name == "class"), None)
        classes = class_value.split() if class_value else []
        if len(classes) != 1 or not re.fullmatch(r"[A-Za-z_-][A-Za-z0-9_-]*", classes[0]):
            raise ReleaseBlocked(
                "source_mapping_ambiguous",
                "Styled elements must have exactly one unambiguous class",
            )
        selector = f".{classes[0]}"
        stylesheet = tinycss2.parse_stylesheet(
            source, skip_comments=False, skip_whitespace=False
        )
        matching_rules = [
            node
            for node in stylesheet
            if isinstance(node, QualifiedRule)
            and tinycss2.serialize(node.prelude).strip() == selector
        ]
        if len(matching_rules) > 1:
            raise ReleaseBlocked(
                "source_mapping_ambiguous", f"Multiple CSS rules match {selector}"
            )

        normalized_updates: dict[str, str | None] = {}
        for name, value in updates.items():
            property_name = name.strip().lower()
            if not re.fullmatch(r"(?:--)?[a-z][a-z0-9-]*", property_name):
                raise ReleaseBlocked("unsupported_change", f"Invalid CSS property: {name}")
            lowered_value = (value or "").lower()
            if any(
                token in lowered_value
                for token in ("javascript:", "expression(", "@import", "</script")
            ):
                raise ReleaseBlocked(
                    "unsupported_change", f"Unsafe CSS value: {property_name}"
                )
            normalized_updates[property_name] = value

        if not matching_rules:
            declarations = " ".join(
                f"{name}: {value};"
                for name, value in sorted(normalized_updates.items())
                if value is not None
            )
            if not declarations:
                return source
            separator = "" if not source or source.endswith("\n") else "\n"
            return f"{source}{separator}{selector} {{ {declarations} }}\n"

        rule = matching_rules[0]
        declaration_nodes = tinycss2.parse_declaration_list(
            rule.content, skip_comments=False, skip_whitespace=True
        )
        if any(isinstance(node, ParseError) for node in declaration_nodes):
            raise ReleaseBlocked(
                "unsupported_change", f"Cannot safely parse CSS rule {selector}"
            )
        existing_names = [
            node.lower_name
            for node in declaration_nodes
            if isinstance(node, Declaration)
            and node.lower_name in normalized_updates
        ]
        if len(existing_names) != len(set(existing_names)):
            raise ReleaseBlocked(
                "source_mapping_ambiguous",
                f"CSS rule {selector} contains duplicate target declarations",
            )

        kept = [
            tinycss2.serialize([node]).strip()
            for node in declaration_nodes
            if not isinstance(node, Declaration)
            or node.lower_name not in normalized_updates
        ]
        kept.extend(
            f"{name}: {value};"
            for name, value in sorted(normalized_updates.items())
            if value is not None
        )
        rule.content = tinycss2.parse_component_value_list(" ".join(filter(None, kept)))
        return tinycss2.serialize(stylesheet)

    @staticmethod
    def _serialize_opening_tag(
        tag: str,
        attrs: list[tuple[str, str | None]],
        self_closing: bool,
    ) -> str:
        rendered = [f"<{tag}"]
        for name, value in attrs:
            rendered.append(f" {name}")
            if value is not None:
                rendered.append(f'="{html.escape(value, quote=True)}"')
        rendered.append(" />" if self_closing else ">")
        return "".join(rendered)


class ReleaseService:
    def __init__(self, translator: StaticSiteTranslator | None = None) -> None:
        self._translator = translator or StaticSiteTranslator()
        self._results: dict[tuple[int, int, str], ReleaseResponse] = {}
        self._lock = asyncio.Lock()

    async def release(
        self,
        snapshot: ReleaseSnapshot,
        client: GitHubClient,
    ) -> ReleaseResponse:
        repository = snapshot.repository
        result_key = (
            repository.installation_id,
            repository.repository_id,
            snapshot.ledger_hash,
        )
        cached = self._results.get(result_key)
        if cached is not None:
            return cached.model_copy(deep=True)

        async with self._lock:
            cached = self._results.get(result_key)
            if cached is not None:
                return cached.model_copy(deep=True)
            result = await self._release(snapshot, repository, client)
            self._results[result_key] = result.model_copy(deep=True)
            return result

    async def _release(
        self,
        snapshot: ReleaseSnapshot,
        repository: RepositoryBinding,
        client: GitHubClient,
    ) -> ReleaseResponse:
        base_sha = await client.get_ref(repository.full_name, repository.default_branch)
        base_commit = await client.get_commit(repository.full_name, base_sha)
        html_source, css_source = await asyncio.gather(
            client.read_file(repository.full_name, "index.html", base_sha),
            client.read_file(repository.full_name, "styles.css", base_sha),
        )

        translations: list[tuple[ApprovedChange, dict[str, str]]] = []
        for change in snapshot.changes:
            translation = self._translator.apply(html_source, css_source, change)
            html_source = translation.html_source
            css_source = translation.css_source
            translations.append((change, translation.changed_files))

        current_base_sha = await client.get_ref(
            repository.full_name, repository.default_branch
        )
        if current_base_sha != base_sha:
            raise ReleaseBlocked(
                "base_branch_moved",
                "The repository default branch moved during release preparation",
                status_code=409,
            )

        parent_sha = base_sha
        tree_sha = base_commit["tree_sha"]
        commit_shas: list[str] = []
        for change, changed_files in translations:
            tree_sha = await client.create_tree(
                repository.full_name, tree_sha, changed_files
            )
            parent_sha = await client.create_commit(
                repository.full_name,
                f"Doable: {change.request.strip()[:72]}",
                tree_sha,
                parent_sha,
            )
            commit_shas.append(parent_sha)

        branch = f"doable/{snapshot.ledger_hash[:12]}"
        await client.create_ref(repository.full_name, branch, commit_shas[-1])
        pull_request_number, pull_request_url = await client.create_pull_request(
            repository.full_name,
            "Apply approved Doable changes",
            self._pull_request_body(snapshot, commit_shas),
            branch,
            repository.default_branch,
        )
        return ReleaseResponse(
            pull_request_url=pull_request_url,
            pull_request_number=pull_request_number,
            branch=branch,
            commit_shas=commit_shas,
            ledger_hash=snapshot.ledger_hash,
        )

    @staticmethod
    def _pull_request_body(snapshot: ReleaseSnapshot, commit_shas: list[str]) -> str:
        lines = [
            "## Approved changes",
            "",
            f"Ledger: `{snapshot.ledger_hash}`",
            "",
        ]
        for change, commit_sha in zip(snapshot.changes, commit_shas, strict=True):
            checks = ", ".join(change.qa.checks)
            lines.append(
                f"- `{change.change_id}` -> `{commit_sha}`; QA: "
                f"{'passed' if change.qa.passed else 'failed'} ({checks})"
            )
        lines.extend(
            [
                "",
                "Created from the exact approved Doable ledger. This pull request was not merged automatically.",
            ]
        )
        return "\n".join(lines)