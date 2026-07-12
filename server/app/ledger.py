import hashlib
import json
import secrets
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from app.models import ApprovedChange, ApprovedChangeReference


class InvalidApprovalToken(Exception):
    pass


class LedgerMismatch(Exception):
    pass


def canonical_json(value: BaseModel | Any) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json", by_alias=True)
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )


def stable_hash(value: BaseModel | Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def change_hash(change: ApprovedChange) -> str:
    return stable_hash(
        change.model_dump(
            mode="json",
            by_alias=True,
            exclude={"change_hash"},
        )
    )


def change_references(changes: list[ApprovedChange]) -> tuple[ApprovedChangeReference, ...]:
    return tuple(
        ApprovedChangeReference(
            change_id=change.change_id, change_hash=change.change_hash)
        for change in changes
    )


def ledger_hash(changes: list[ApprovedChange]) -> str:
    references = [reference.model_dump(
        mode="json", by_alias=True) for reference in change_references(changes)]
    return stable_hash(references)


@dataclass(frozen=True, slots=True)
class ApprovalRecord:
    token: str
    ledger_hash: str
    references: tuple[ApprovedChangeReference, ...]


def issue_approval(changes: list[ApprovedChange]) -> ApprovalRecord:
    return ApprovalRecord(
        token=secrets.token_urlsafe(32),
        ledger_hash=ledger_hash(changes),
        references=change_references(changes),
    )


def verify_approval(
    approval: ApprovalRecord | None,
    token: str,
    references: list[ApprovedChangeReference],
    changes: list[ApprovedChange],
) -> str:
    if approval is None or not secrets.compare_digest(approval.token, token):
        raise InvalidApprovalToken

    current_references = change_references(changes)
    if tuple(references) != current_references or approval.references != current_references:
        raise LedgerMismatch

    current_hash = ledger_hash(changes)
    if not secrets.compare_digest(approval.ledger_hash, current_hash):
        raise LedgerMismatch
    return current_hash
