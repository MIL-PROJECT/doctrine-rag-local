"""
시작 시 Chroma 상태를 보고 CSV 청크 인제스트를 한 번만 수행합니다.

- 컬렉션에 문서가 있으면 인제스트 생략(재시작 시 중복 방지).
- 문서 수가 0이면 `.ingested` 가 있어도 제거한 뒤 다시 인제스트합니다.
- 소스: CHUNKS_DATA_DIR 내 `*.csv` (행 단위, embedding_text / chunk_text / content).

Docker / 로컬:
  python ingest_seed.py
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import config
import vector_store

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)


def _ensure_dirs() -> None:
    config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    config.CHUNKS_DATA_DIR.mkdir(parents=True, exist_ok=True)


def _run_csv_ingest(branch: str) -> dict:
    from rag_service import ingest_csv_chunks_for_branch

    return ingest_csv_chunks_for_branch(branch)


def _flag_path(branch: str) -> Path:
    return config.CHROMA_DIR / f".ingested_{branch}"


def ensure_ingested() -> None:
    """군별 컬렉션·플래그 규칙에 따라 CSV 청크만 idempotent 인제스트."""
    _ensure_dirs()
    for branch in config.SERVICE_BRANCHES:
        col = config.COLLECTION_MAP[branch]
        flag = _flag_path(branch)
        count = vector_store.collection_count(col)

        if count > 0:
            if not flag.exists():
                flag.touch()
                logger.info("[%s] Chroma has %s docs; recreated missing flag %s", branch, count, flag)
            else:
                logger.info("[%s] Chroma has %s docs and flag exists; skipping ingest.", branch, count)
            continue

        if flag.exists():
            flag.unlink()
            logger.info("[%s] Removed stale ingest flag (collection empty).", branch)

        result = _run_csv_ingest(branch)
        if result.get("chunks", 0) > 0:
            flag.touch()
            logger.info("[%s] Ingest complete: %s rows from CSV", branch, result["chunks"])
        else:
            logger.warning(
                "[%s] Ingest produced 0 rows. Add `*.csv` under %s and restart (or DELETE /reset).",
                branch,
                config.chunks_dir_for_branch(branch),
            )


def main() -> int:
    try:
        ensure_ingested()
    except Exception:
        logger.exception("ingest_seed failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
