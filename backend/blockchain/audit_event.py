"""감사 이벤트 표준 스키마 — 답변 원문 X, 해시·메타데이터만."""
from datetime import datetime, timezone
from typing import Any

from blockchain.hash_utils import sha256_text, sha256_list


def build_task_event(
    task_id: str,
    question: str,
    final_answer: str,
    branches_consulted: list[str],
    answers_by_branch: dict[str, dict],
    all_sources: list[dict],
    from_cache: bool = False,
    model_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """A2A Task 완료 시 감사 이벤트 생성.

    저장 데이터 원칙:
    - 답변 원문 ❌ → answer_hash 만
    - 질문 원문 ❌ → question_hash 만
    - 출처 원문 ❌ → source_hash 만
    """
    # 각 군 답변 해시 (branch 알파벳 순)
    agents_hashes = []
    for branch in sorted(answers_by_branch.keys()):
        agent_data = answers_by_branch[branch]
        agents_hashes.append({
            "agent_id": branch,
            "answer_hash": sha256_text(agent_data.get("answer", "")),
            "sources_count": agent_data.get("sources_count", 0),
            "mode": agent_data.get("mode", "unknown"),
        })

    # 출처 해시 (chunk_id + distance 결합, 정렬 후 리스트 해시)
    source_ids = [
        src.get("chunk_id", "") + "::" + str(src.get("distance", 0))
        for src in all_sources
    ]
    source_hash = sha256_list(sorted(source_ids))

    event = {
        "event_type": "A2A_TASK_COMPLETED",
        "task_id": task_id,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
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
        "evidence": {
            "source_hash": source_hash,
        },
        "model_info": model_info or {
            "model": "qwen2.5:3b",
            "framework": "ollama+langgraph",
        },
    }

    return event
