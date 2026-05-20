"""CSV 청크 idempotent 인제스트 (기동 시·CLI)."""

from __future__ import annotations

import logging
from pathlib import Path

from app.core import config
from app.rag import vector_store

logger = logging.getLogger(__name__)


def _ensure_dirs() -> None:
    config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    config.CHUNKS_DATA_DIR.mkdir(parents=True, exist_ok=True)


def _run_csv_ingest(branch: str) -> dict:
    from app.rag.service import ingest_csv_chunks_for_branch

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
