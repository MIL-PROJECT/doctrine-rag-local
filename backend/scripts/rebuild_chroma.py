"""Chroma 컬렉션을 비우고 CHUNKS_DATA_DIR 의 모든 CSV를 다시 인제스트합니다."""

from __future__ import annotations

from pathlib import Path

from app.core import config
from app.rag import vector_store
from app.rag.service import ingest_csv_chunks


def main() -> None:
    print("Resetting Chroma collection...")
    vector_store.reset_collection()
    vector_store.remove_ingest_flag()
    print("Ingesting CSV from", config.CHUNKS_DATA_DIR)
    result = ingest_csv_chunks()
    if result["chunks"] > 0:
        Path(config.INGEST_FLAG_PATH).touch()
    print("Done:", result)


if __name__ == "__main__":
    main()
