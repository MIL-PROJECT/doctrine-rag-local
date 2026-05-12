"""A2A Task 답변 캐시 — 발표 시연용 안정 재생.

캐싱 키: question + top_k 의 SHA256 해시
저장: backend/a2a/demo_cache.json (Git에 안 올림)
환경변수: A2A_CACHE_ENABLED=true 일 때만 동작
"""
import json
import hashlib
import os
from pathlib import Path
from typing import Any

CACHE_PATH = Path(__file__).parent / "demo_cache.json"


def cache_enabled() -> bool:
    return os.getenv("A2A_CACHE_ENABLED", "false").lower() in ("true", "1", "yes")


def make_key(question: str, top_k: int) -> str:
    """질문 + top_k 기반 캐시 키."""
    raw = f"{question.strip()}::{top_k}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def get(question: str, top_k: int) -> dict[str, Any] | None:
    """캐시 조회. 없으면 None."""
    if not cache_enabled():
        return None
    if not CACHE_PATH.exists():
        return None
    key = make_key(question, top_k)
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        cache = json.load(f)
    return cache.get(key)


def put(question: str, top_k: int, response: dict[str, Any]) -> None:
    """캐시 저장."""
    if not cache_enabled():
        return
    key = make_key(question, top_k)

    cache = {}
    if CACHE_PATH.exists():
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            cache = json.load(f)

    cache[key] = {
        "question": question,
        "top_k": top_k,
        "response": response,
    }

    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def list_cached() -> list[dict[str, Any]]:
    """캐시된 항목 목록 (디버깅용)."""
    if not CACHE_PATH.exists():
        return []
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        cache = json.load(f)
    return [
        {"key": k, "question": v.get("question", ""), "top_k": v.get("top_k", 0)}
        for k, v in cache.items()
    ]
