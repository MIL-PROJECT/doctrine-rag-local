"""체인 무결성 검증기.

verify_chain: 전체 ledger 순회, previous_hash 연결 + event_hash 재계산 검증
verify_task: 단일 task_id 이벤트의 event_hash 재계산 검증

변조 탐지 원리:
- previous_hash가 직전 event_hash와 불일치 → 누군가 중간 이벤트를 빼냈거나 순서를 바꿈
- event_hash 재계산 결과가 저장값과 불일치 → payload가 변조됨
"""
import json
from typing import Any

from blockchain import config
from blockchain.hash_utils import create_event_hash
from blockchain.local_ledger import get_event_by_task_id


def _strip_integrity(entry: dict[str, Any]) -> dict[str, Any]:
    """entry에서 integrity 메타를 제외한 payload만 반환."""
    return {k: v for k, v in entry.items() if k != "integrity"}


def verify_chain() -> dict[str, Any]:
    """전체 ledger 체인 무결성 검증.

    각 이벤트마다:
    1. previous_hash가 직전 event_hash와 일치하는가? (연결)
    2. event_hash가 create_event_hash(previous_hash, payload)와 일치하는가? (변조)

    빈 ledger는 valid=True, total_events=0.
    JSON 파싱 실패는 변조로 간주.
    """
    path = config.LOCAL_LEDGER_PATH
    if not path.exists():
        return {
            "valid": True,
            "total_events": 0,
            "broken_at": None,
            "error": None,
        }

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

    return {
        "valid": True,
        "total_events": total,
        "broken_at": None,
        "error": None,
    }


def verify_task(task_id: str) -> dict[str, Any]:
    """단일 task_id 이벤트의 무결성 검증."""
    entry = get_event_by_task_id(task_id)
    if entry is None:
        return {
            "task_id": task_id,
            "found": False,
            "valid": False,
            "chain_index": None,
            "event_hash": None,
            "previous_hash": None,
            "error": "task_id not found in ledger",
        }

    integrity = entry.get("integrity") or {}
    stored_prev = integrity.get("previous_hash")
    stored_hash = integrity.get("event_hash")
    chain_index = integrity.get("chain_index")

    if stored_prev is None or stored_hash is None:
        return {
            "task_id": task_id,
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
            "task_id": task_id,
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
        "task_id": task_id,
        "found": True,
        "valid": True,
        "chain_index": chain_index,
        "event_hash": stored_hash,
        "previous_hash": stored_prev,
        "error": None,
    }
