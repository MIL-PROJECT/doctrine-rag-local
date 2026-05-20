from __future__ import annotations

from typing import Any

from app.api.schemas import ChatRequest
from app.a2a.audit import emit_blockchain_event


def audit_actor_chat(body: ChatRequest) -> dict[str, str]:
    uid = body.user_id.strip() if body.user_id else ""
    mid = body.military_number.strip() if body.military_number else ""
    return {"user_id": uid, "military_number": mid}


def audit_question_preview(q: str, limit: int = 500) -> str:
    s = q.strip()
    if len(s) <= limit:
        return s
    return s[:limit] + "…"


def emit_standard_chat_ledger_entry(
    *,
    chat_id: str,
    question: str,
    answer: str,
    sources: list[Any],
    branch: str,
    mode: str | None,
    pipeline: str,
    body: ChatRequest,
    route_reason: Any = None,
    route_confidence: Any = None,
    stream_error: str | None = None,
) -> dict[str, Any]:
    from app.blockchain.audit_event import build_standard_chat_ledger_payload

    return emit_blockchain_event(
        build_standard_chat_ledger_payload(
            chat_id,
            question,
            answer,
            sources,
            branch=branch,
            mode=mode,
            pipeline=pipeline,
            route_reason=route_reason,
            route_confidence=route_confidence,
            user_id=body.user_id,
            military_number=body.military_number,
            stream_error=stream_error,
        )
    )
