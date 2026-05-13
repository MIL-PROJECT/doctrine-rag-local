"""Verify hash-chain integrity over the local ledger."""

from __future__ import annotations

import json
from typing import Any

from blockchain import config
from blockchain.hash_utils import create_event_hash
from blockchain.local_ledger import get_event_by_record_id


def _strip_integrity(entry: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in entry.items() if k != "integrity"}


def verify_chain() -> dict[str, Any]:
    path = config.LOCAL_LEDGER_PATH
    if not path.exists():
        return {"valid": True, "total_events": 0, "broken_at": None, "error": None}

    expected_prev = config.CHAIN_GENESIS_HASH
    total = 0
    line_no = 0

    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line_no += 1
            line = raw_line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
            except json.JSONDecodeError as exc:
                return {
                    "valid": False,
                    "total_events": total,
                    "broken_at": line_no,
                    "error": f"json decode error at line {line_no}: {exc}",
                }

            total += 1
            integrity = entry.get("integrity") or {}
            stored_prev = integrity.get("previous_hash")
            stored_hash = integrity.get("event_hash")
            chain_index = integrity.get("chain_index", total)

            if stored_prev is None or stored_hash is None:
                return {
                    "valid": False,
                    "total_events": total,
                    "broken_at": chain_index,
                    "error": f"missing integrity metadata at chain_index {chain_index}",
                }

            if stored_prev != expected_prev:
                return {
                    "valid": False,
                    "total_events": total,
                    "broken_at": chain_index,
                    "error": (
                        f"previous_hash mismatch at chain_index {chain_index}: "
                        f"expected {expected_prev[:12]}…, got {stored_prev[:12]}…"
                    ),
                }

            payload = _strip_integrity(entry)
            recomputed = create_event_hash(stored_prev, payload)
            if recomputed != stored_hash:
                return {
                    "valid": False,
                    "total_events": total,
                    "broken_at": chain_index,
                    "error": (
                        f"event_hash mismatch at chain_index {chain_index}: "
                        f"recomputed {recomputed[:12]}… != stored {stored_hash[:12]}…"
                    ),
                }

            expected_prev = stored_hash

    return {"valid": True, "total_events": total, "broken_at": None, "error": None}


def verify_task(record_id: str) -> dict[str, Any]:
    """원장에서 task_id(A2A) 또는 chat_id(표준 채팅)로 단건 검증."""
    entry = get_event_by_record_id(record_id)
    if entry is None:
        return {
            "record_id": record_id,
            "task_id": None,
            "chat_id": None,
            "found": False,
            "valid": False,
            "chain_index": None,
            "event_hash": None,
            "previous_hash": None,
            "error": "record_id not found in ledger",
        }

    integrity = entry.get("integrity") or {}
    stored_prev = integrity.get("previous_hash")
    stored_hash = integrity.get("event_hash")
    chain_index = integrity.get("chain_index")

    if stored_prev is None or stored_hash is None:
        return {
            "record_id": record_id,
            "task_id": entry.get("task_id"),
            "chat_id": entry.get("chat_id"),
            "found": True,
            "valid": False,
            "chain_index": chain_index,
            "event_hash": stored_hash,
            "previous_hash": stored_prev,
            "error": "missing integrity metadata",
        }

    payload = _strip_integrity(entry)
    recomputed = create_event_hash(stored_prev, payload)
    if recomputed != stored_hash:
        return {
            "record_id": record_id,
            "task_id": entry.get("task_id"),
            "chat_id": entry.get("chat_id"),
            "found": True,
            "valid": False,
            "chain_index": chain_index,
            "event_hash": stored_hash,
            "previous_hash": stored_prev,
            "error": (
                f"event_hash mismatch: recomputed {recomputed[:12]}… "
                f"!= stored {stored_hash[:12]}…"
            ),
        }

    return {
        "record_id": record_id,
        "task_id": entry.get("task_id"),
        "chat_id": entry.get("chat_id"),
        "found": True,
        "valid": True,
        "chain_index": chain_index,
        "event_hash": stored_hash,
        "previous_hash": stored_prev,
        "error": None,
    }
