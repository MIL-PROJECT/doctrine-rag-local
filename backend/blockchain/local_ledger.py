"""로컬 ledger — JSONL 기반 해시 체인 저장소.

체인 무결성:
- 각 이벤트의 previous_hash = 직전 이벤트의 event_hash
- 첫 이벤트의 previous_hash = CHAIN_GENESIS_HASH ("0"*64)
- 한 이벤트라도 변조되면 후속 event_hash 전부 깨짐

BLOCKCHAIN_ENABLED=false 일 때 append_event는 no-op (skipped 반환).
"""
import json
from typing import Any

from blockchain import config
from blockchain.hash_utils import create_event_hash

try:
    import fcntl  # POSIX
    _HAS_FCNTL = True
except ImportError:
    fcntl = None  # type: ignore[assignment]
    _HAS_FCNTL = False


def _iter_events():
    """ledger 파일을 한 줄씩 읽어 dict 산출 (파싱 실패 라인은 skip)."""
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
    """체인 총 이벤트 수."""
    return sum(1 for _ in _iter_events())


def get_last_event_hash() -> str:
    """체인 마지막 이벤트의 event_hash 반환 (비어있으면 GENESIS)."""
    last_hash = config.CHAIN_GENESIS_HASH
    for entry in _iter_events():
        integrity = entry.get("integrity") or {}
        candidate = integrity.get("event_hash")
        if candidate:
            last_hash = candidate
    return last_hash


def append_event(event_payload: dict[str, Any]) -> dict[str, Any]:
    """이벤트를 체인에 append 하고 integrity 메타가 포함된 entry 반환.

    BLOCKCHAIN_ENABLED=false 일 때 no-op: {"skipped": True, ...} 반환.
    """
    if not config.BLOCKCHAIN_ENABLED:
        return {"skipped": True, "reason": "blockchain_disabled"}

    config.ensure_storage_dir()

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
        if _HAS_FCNTL:
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


def get_event_by_task_id(task_id: str) -> dict[str, Any] | None:
    """task_id 일치하는 첫 엔트리 반환."""
    for entry in _iter_events():
        if entry.get("task_id") == task_id:
            return entry
    return None


def get_latest_events(limit: int = 20) -> list[dict[str, Any]]:
    """마지막 N개 이벤트 (최신순)."""
    if limit <= 0:
        return []
    all_events = list(_iter_events())
    tail = all_events[-limit:]
    tail.reverse()
    return tail
