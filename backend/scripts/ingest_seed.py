"""
CSV 청크 idempotent 인제스트 CLI.

  cd backend
  python -m scripts.ingest_seed
"""

from __future__ import annotations

import logging
import sys

from app.core import config
from app.rag.ingest import ensure_ingested

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)


def main() -> int:
    try:
        ensure_ingested()
    except Exception:
        logger.exception("ingest_seed failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
