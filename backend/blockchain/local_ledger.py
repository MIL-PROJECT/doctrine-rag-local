"""Append-only JSONL ledger with hash chain links."""

from __future__ import annotations

import json
from typing import Any

from blockchain import config
from blockchain.hash_utils import create_event_hash

try:
    import fcntl  # type: ignore[import-not-found]

    _HAS_FCNTL = True
except ImportError:
    fcntl = None  # type: ignore[assignment]
    _HAS_FCNTL = False


def _iter_events():
    path = config.LOCAL_LEDGER_PATH
    if not path.exists():
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def _count_events() -> int:
    return sum(1 for _ in _iter_events())


def get_last_event_hash() -> str:
    last_hash = config.CHAIN_GENESIS_HASH
    for entry in _iter_events():
        integrity = entry.get("integrity") or {}
        candidate = integrity.get("event_hash")
        if candidate:
            last_hash = candidate
    return last_hash


def append_event(event_payload: dict[str, Any]) -> dict[str, Any]:
    if not config.BLOCKCHAIN_ENABLED:
        return {"skipped": True, "reason": "blockchain_disabled"}

    line_probe = json.dumps(event_payload, ensure_ascii=False, sort_keys=True)
    if len(line_probe.encode("utf-8")) > config.MAX_PAYLOAD_BYTES:
        return {"skipped": True, "reason": "payload_too_large"}

    config.ensure_ledger_dir()

    previous_hash = get_last_event_hash()
    event_hash = create_event_hash(previous_hash, event_payload)
    chain_index = _count_events() + 1

    entry = {
        **event_payload,
        "integrity": {
            "previous_hash": previous_hash,
            "event_hash": event_hash,
            "chain_index": chain_index,
        },
    }

    line = json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n"
    path = config.LOCAL_LEDGER_PATH

    with open(path, "a", encoding="utf-8") as f:
        if _HAS_FCNTL and fcntl is not None:
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                f.write(line)
                f.flush()
            finally:
                try:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                except Exception:
                    pass
        else:
            f.write(line)
            f.flush()

    return entry


def get_event_by_record_id(record_id: str) -> dict[str, Any] | None:
    """task_id(A2A) 또는 chat_id(표준 채팅)로 원장 행 검색."""
    for entry in _iter_events():
        if entry.get("task_id") == record_id or entry.get("chat_id") == record_id:
            return entry
    return None


def get_event_by_task_id(task_id: str) -> dict[str, Any] | None:
    return get_event_by_record_id(task_id)


def get_latest_events(limit: int = 20) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    all_events = list(_iter_events())
    tail = all_events[-limit:]
    tail.reverse()
    return tail
