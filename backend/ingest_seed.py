"""
Manual re-ingest CLI (development / ops).

Usage (from backend/):
  python ingest_seed.py

Requires data/doctrine with .pdf/.txt files.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import config
from rag_service import ingest_doctrine_dir
import vector_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> int:
    config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    vector_store.reset_collection()
    vector_store.remove_ingest_flag()
    result = ingest_doctrine_dir(config.DOCTRINE_DATA_DIR)
    if result["chunks"] > 0:
        Path(config.INGEST_FLAG_PATH).touch()
        logger.info("Done: %s chunks from %s", result["chunks"], result["files"])
        return 0
    logger.error("No chunks ingested. Add files to %s", config.DOCTRINE_DATA_DIR)
    return 1


if __name__ == "__main__":
    sys.exit(main())
