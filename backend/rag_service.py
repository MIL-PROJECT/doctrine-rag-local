"""RAG: CSV 청크 인제스트 + 질의 응답."""

from __future__ import annotations

import logging
from pathlib import Path

import config
from chunk_table_loader import load_all_chunk_rows, normalize_chroma_meta
from embeddings import embed_query, embed_texts
from ingest_seed import ensure_ingested
from llm import generate_answer
import vector_store

logger = logging.getLogger(__name__)


def _ensure_dirs() -> None:
    config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    config.CHUNKS_DATA_DIR.mkdir(parents=True, exist_ok=True)


def ingest_csv_chunks(directory: str | Path | None = None) -> dict:
    """
    CHUNKS_DATA_DIR 의 `*.csv` 행을 그대로 벡터로 저장 (재청킹 없음).
    본문: CHUNK_TEXT_COLUMN 또는 embedding_text → chunk_text → content.
    """
    _ensure_dirs()
    root = Path(directory) if directory else config.CHUNKS_DATA_DIR
    rows = load_all_chunk_rows(root, config.CHUNK_TEXT_COLUMN)
    if not rows:
        logger.warning("No CSV rows in %s (expected `*.csv`)", root)
        return {"chunks": 0, "files": []}

    batch = max(1, config.INGEST_BATCH_SIZE)
    logger.info("Loaded %s CSV rows; embedding in batches of %s", len(rows), batch)
    n = 0
    files = {f for _, _, f in rows}
    for start in range(0, len(rows), batch):
        chunk = rows[start : start + batch]
        texts = [t for t, _, _ in chunk]
        metas_chroma = [normalize_chroma_meta(m) for _, m, _ in chunk]
        embeddings = embed_texts(texts, batch_size=min(32, len(texts)))
        n += vector_store.add_chunk_records(texts, embeddings, metas_chroma)
        if (start // batch + 1) % 50 == 0 or start + batch >= len(rows):
            logger.info("Ingest progress: %s / %s rows", min(start + batch, len(rows)), len(rows))
    files_sorted = sorted(files)
    logger.info("Ingested %s rows from %s CSV file(s)", n, len(files_sorted))
    return {"chunks": n, "files": files_sorted, "mode": "csv_chunks"}


def ingest_corpus() -> dict:
    """Chroma 재적재용 진입점 — CSV 청크만."""
    return ingest_csv_chunks()


def run_startup_ingest() -> None:
    ensure_ingested()


def build_context(chunks: list[dict]) -> str:
    blocks: list[str] = []
    for idx, item in enumerate(chunks, start=1):
        meta = item.get("metadata") or {}
        title = meta.get("document_title") or meta.get("document_short_title") or ""
        chapter = meta.get("chapter", "")
        section = meta.get("section", "")
        page = meta.get("pdf_page_start") or meta.get("page") or meta.get("pdf_page_end") or ""

        cite_bits = [f"Source: {meta.get('source', 'unknown')}"]
        if title:
            cite_bits.append(f"Document: {title}")
        if chapter:
            cite_bits.append(f"Chapter: {chapter}")
        if section:
            cite_bits.append(f"Section: {section}")
        if page not in ("", None):
            cite_bits.append(f"Page: {page}")

        blocks.append(
            f"""
[Evidence {idx}]
{", ".join(cite_bits)}
Chunk index: {meta.get("chunk_index", "unknown")}
Text:
{item.get("content", "")}
""".strip()
        )
    return "\n\n".join(blocks)


def ask_question(question: str, top_k: int = 5) -> dict:
    q = question.strip()
    if not q:
        raise ValueError("Question is empty.")

    if vector_store.collection_count() == 0:
        hint = (
            f"No documents are indexed yet. Add preprocessed chunk CSV (e.g. All_RAG_Chunks.csv) under "
            f"{config.CHUNKS_DATA_DIR} and restart the backend (or DELETE /reset)."
        )
        return {"answer": hint, "sources": []}

    q_emb = embed_query(q)
    retrieved = vector_store.search(q_emb, top_k=top_k)
    if not retrieved:
        return {"answer": "No relevant passages were retrieved.", "sources": []}

    context = build_context(retrieved)
    answer = generate_answer(q, context)

    sources: list[dict] = []
    extra_keys = (
        "document_title",
        "document_short_title",
        "document_id",
        "chapter",
        "section",
        "subsection",
        "pdf_page_start",
        "pdf_page_end",
        "chunk_id",
    )
    for item in retrieved:
        meta = item.get("metadata") or {}
        row: dict = {
            "source": meta.get("source"),
            "chunk_index": meta.get("chunk_index"),
            "distance": item.get("distance"),
            "preview": (item.get("content") or "")[:300],
        }
        for k in extra_keys:
            if meta.get(k) is not None and meta.get(k) != "":
                row[k] = meta.get(k)
        sources.append(row)

    return {"answer": answer, "sources": sources}


def full_reset_and_reingest() -> dict:
    """DELETE /reset: clear Chroma, remove flag, re-ingest CSV."""
    vector_store.reset_collection()
    vector_store.remove_ingest_flag()
    result = ingest_corpus()
    if result["chunks"] > 0:
        Path(config.INGEST_FLAG_PATH).touch()
    return {"message": "Vector store reset and re-ingested.", **result}
