"""A2A 감사 로그 — 모든 에이전트 통신 기록"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

AUDIT_LOG_PATH = Path(__file__).parent.parent / "logs" / "audit_log.jsonl"


def ensure_log_dir() -> None:
    AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)


def record(event_type: str, payload: dict[str, Any]) -> None:
    """이벤트 한 건을 audit_log.jsonl 에 한 줄로 append."""
    ensure_log_dir()
    entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "event": event_type,
        **payload,
    }
    with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def read_recent(limit: int = 50) -> list[dict[str, Any]]:
    """최근 감사 로그 반환."""
    if not AUDIT_LOG_PATH.exists():
        return []
    with open(AUDIT_LOG_PATH, "r", encoding="utf-8") as f:
        lines = f.readlines()
    return [json.loads(line) for line in lines[-limit:]]
