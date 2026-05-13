"""SHA256 canonical hashing for the local audit chain."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def canonical_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_json(data: Any) -> str:
    return sha256_text(canonical_json(data))


def sha256_list(items: list[Any]) -> str:
    return sha256_json(items)


def create_event_hash(previous_hash: str, event_payload: dict[str, Any]) -> str:
    combined = {"previous_hash": previous_hash, "payload": event_payload}
    return sha256_json(combined)
