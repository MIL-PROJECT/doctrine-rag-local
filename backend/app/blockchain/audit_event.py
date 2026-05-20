"""Audit event schema — hashes only, no answer plaintext in the ledger payload."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.blockchain.hash_utils import sha256_list, sha256_text

from app.core import config


def build_task_event(
    task_id: str,
    question: str,
    final_answer: str,
    branches_consulted: list[str],
    answers_by_branch: dict[str, dict],
    all_sources: list[dict],
    from_cache: bool = False,
    model_info: dict[str, Any] | None = None,
    user_id: str | None = None,
    military_number: str | None = None,
) -> dict[str, Any]:
    agents_hashes = []
    for branch in sorted(answers_by_branch.keys()):
        agent_data = answers_by_branch[branch]
        agents_hashes.append(
            {
                "agent_id": branch,
                "answer_hash": sha256_text(str(agent_data.get("answer", ""))),
                "sources_count": int(agent_data.get("sources_count", 0) or 0),
                "mode": str(agent_data.get("mode", "unknown")),
            }
        )

    source_ids = [
        str(src.get("chunk_id", "")) + "::" + str(src.get("distance", 0))
        for src in all_sources
    ]
    source_hash = sha256_list(sorted(source_ids))

    uid = (user_id or "").strip()
    mid = (military_number or "").strip()

    return {
        "event_type": "A2A_TASK_COMPLETED",
        "task_id": task_id,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "actor": {
            "user_id": uid,
            "military_number": mid,
        },
        "request": {
            "question_hash": sha256_text(question),
            "from_cache": from_cache,
        },
        "routing": {
            "supervisor": "joint_supervisor",
            "branches_consulted": sorted(branches_consulted),
        },
        "agents": agents_hashes,
        "final_answer": {
            "answer_hash": sha256_text(final_answer),
            "answer_length": len(final_answer),
            "sources_count": len(all_sources),
        },
        "evidence": {"source_hash": source_hash},
        "model_info": model_info
        or {
            "model": config.OLLAMA_MODEL,
            "framework": "ollama+langgraph",
        },
    }


def build_standard_chat_ledger_payload(
    chat_id: str,
    question: str,
    answer: str,
    sources: list[dict],
    *,
    branch: str,
    mode: str | None,
    pipeline: str,
    route_reason: str | None = None,
    route_confidence: float | None = None,
    user_id: str | None = None,
    military_number: str | None = None,
    stream_error: str | None = None,
) -> dict[str, Any]:
    """표준 채팅(/chat, /chat/stream) 완료를 원장에 남길 때 — 원문 대신 해시만 저장."""
    source_ids = [
        str(src.get("chunk_id", "")) + "::" + str(src.get("distance", 0))
        for src in sources
    ]
    source_hash = sha256_list(sorted(source_ids))

    uid = (user_id or "").strip()
    mid = (military_number or "").strip()
    err = (stream_error or "").strip()

    return {
        "event_type": "STANDARD_CHAT_COMPLETED",
        "chat_id": chat_id,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "actor": {
            "user_id": uid,
            "military_number": mid,
        },
        "pipeline": pipeline,
        "routing": {
            "branch": branch,
            "mode": mode,
            "route_reason": route_reason,
            "route_confidence": route_confidence,
        },
        "request": {
            "question_hash": sha256_text(question),
        },
        "response": {
            "answer_hash": sha256_text(answer),
            "answer_length": len(answer),
            "sources_count": len(sources),
            "stream_error": err or None,
        },
        "evidence": {"source_hash": source_hash},
        "model_info": {
            "model": config.OLLAMA_MODEL,
            "framework": "ollama+rag",
        },
    }
