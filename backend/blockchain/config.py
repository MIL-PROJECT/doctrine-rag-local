"""Blockchain-style audit ledger — disabled by default."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

BLOCKCHAIN_ENABLED = os.getenv("A2A_BLOCKCHAIN_ENABLED", "false").lower() in ("true", "1", "yes")

BACKEND_DIR = Path(__file__).parent.parent.resolve()
# 감사 JSONL(audit_log.jsonl)과 동일 디렉터리 backend/logs/
LEDGER_DIR = BACKEND_DIR / "logs"
LOCAL_LEDGER_PATH = LEDGER_DIR / "local_ledger.jsonl"
_LEGACY_LEDGER_PATHS = (
    BACKEND_DIR / "a2a" / "logs" / "local_ledger.jsonl",
    BACKEND_DIR / "storage" / "local_ledger.jsonl",
)

CHAIN_GENESIS_HASH = "0" * 64
HASH_ALGORITHM = "sha256"
MAX_PAYLOAD_BYTES = 100_000


def ensure_ledger_dir() -> None:
    """원장 디렉터리 준비. 예전 경로에만 파일이 있으면 한 번 복사합니다."""
    LEDGER_DIR.mkdir(parents=True, exist_ok=True)
    if LOCAL_LEDGER_PATH.exists():
        return
    for legacy in _LEGACY_LEDGER_PATHS:
        if legacy.exists():
            try:
                shutil.copy2(legacy, LOCAL_LEDGER_PATH)
            except OSError:
                pass
            break
