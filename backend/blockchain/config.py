"""블록체인 감사 모듈 설정.

A2A_BLOCKCHAIN_ENABLED=false 일 때 모든 함수는 no-op.
파인튜닝 팀 / 다른 5조 작업과 격리 보장.
"""
import os
from pathlib import Path

# 블록체인 활성화 여부 (개발 중 기본 OFF)
BLOCKCHAIN_ENABLED = os.getenv("A2A_BLOCKCHAIN_ENABLED", "false").lower() in ("true", "1", "yes")

# 저장 경로
BACKEND_DIR = Path(__file__).parent.parent.resolve()
STORAGE_DIR = BACKEND_DIR / "storage"
LOCAL_LEDGER_PATH = STORAGE_DIR / "local_ledger.jsonl"
BLOCKCHAIN_RECEIPTS_PATH = STORAGE_DIR / "blockchain_receipts.jsonl"

# 체인 설정
CHAIN_GENESIS_HASH = "0" * 64  # 첫 이벤트의 previous_hash
HASH_ALGORITHM = "sha256"

# 페이로드 크기 제한 (변조 방지)
MAX_PAYLOAD_BYTES = 10000


def ensure_storage_dir() -> None:
    """storage 디렉토리 자동 생성."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
