"""해시 유틸리티 — SHA256 기반 canonical 해시 생성.

canonical_json: 키 순서 정렬, 공백 통일 (변조 시 다른 해시 생성)
"""
import hashlib
import json
from typing import Any


def canonical_json(data: Any) -> str:
    """canonical JSON 문자열 생성 — 키 정렬 + 공백 통일."""
    return json.dumps(
        data,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_text(text: str) -> str:
    """문자열의 SHA256 해시 (16진수 64자)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_json(data: Any) -> str:
    """JSON 객체의 canonical 해시."""
    return sha256_text(canonical_json(data))


def sha256_list(items: list[Any]) -> str:
    """리스트의 canonical 해시 (순서 보존)."""
    return sha256_json(items)


def create_event_hash(
    previous_hash: str,
    event_payload: dict[str, Any],
) -> str:
    """이전 해시 + 이벤트 페이로드의 결합 해시.

    체인 무결성의 핵심: previous_hash가 바뀌면 모든 후속 event_hash가 깨짐.
    """
    combined = {
        "previous_hash": previous_hash,
        "payload": event_payload,
    }
    return sha256_json(combined)
