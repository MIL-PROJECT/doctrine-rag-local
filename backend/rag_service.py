"""RAG orchestration: ingest doctrine corpus + answer questions."""

from __future__ import annotations

import logging
from pathlib import Path

import config
from chunker import chunk_text
from document_loader import list_doctrine_files, load_document
from embeddings import embed_query, embed_texts
from llm import generate_answer
import vector_store

logger = logging.getLogger(__name__)


def _ensure_dirs() -> None:
    config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    config.DOCTRINE_DATA_DIR.mkdir(parents=True, exist_ok=True)


def ingest_doctrine_dir(directory: str | Path | None = None) -> dict:
    """
    Load all .pdf/.txt from directory, chunk, embed, store in Chroma.
    Returns stats; does not touch .ingested flag (caller decides).
    """
    _ensure_dirs()
    root = Path(directory) if directory else config.DOCTRINE_DATA_DIR
    files = list_doctrine_files(root)
    if not files:
        logger.warning("No .pdf or .txt files in %s", root)
        return {"chunks": 0, "files": []}

    total_chunks = 0
    seen_files: list[str] = []

    for path in files:
        try:
            text = load_document(str(path))
        except Exception as e:
            logger.exception("Failed to load %s", path)
            raise RuntimeError(f"Failed to load {path.name}: {e}") from e

        if not text.strip():
            logger.warning("Skipping empty extract: %s", path.name)
            continue

        chunks = chunk_text(text, config.CHUNK_SIZE, config.CHUNK_OVERLAP)
        if not chunks:
            continue

        embeddings = embed_texts(chunks)
        source_name = path.name
        n = vector_store.add_chunks(
            chunks,
            embeddings,
            source_name=source_name,
            start_index=0,
        )
        total_chunks += n
        seen_files.append(source_name)

    logger.info("Ingested %s chunks from %s files", total_chunks, len(seen_files))
    return {"chunks": total_chunks, "files": seen_files}


def run_startup_ingest() -> None:
    """If .ingested missing, ingest data/doctrine and create flag."""
    _ensure_dirs()
    flag = Path(config.INGEST_FLAG_PATH)
    if flag.exists():
        logger.info("Ingest flag present (%s), skipping startup ingest.", flag)
        return

    result = ingest_doctrine_dir(config.DOCTRINE_DATA_DIR)
    if result["chunks"] > 0:
        flag.touch()
        logger.info("Startup ingest complete; wrote %s", flag)
    else:
        logger.warning(
            "Startup ingest produced 0 chunks. Add files to %s and restart (or DELETE /reset).",
            config.DOCTRINE_DATA_DIR,
        )


def build_context(chunks: list[dict]) -> str:
    blocks: list[str] = []
    for idx, item in enumerate(chunks, start=1):
        meta = item.get("metadata") or {}
        blocks.append(
            f"""
[Evidence {idx}]
Source: {meta.get("source", "unknown")}
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
        return {
            "answer": "No documents are indexed yet. Place PDF/TXT files in data/doctrine and restart the backend.",
            "sources": [],
        }

    q_emb = embed_query(q)
    retrieved = vector_store.search(q_emb, top_k=top_k)
    if not retrieved:
        return {"answer": "No relevant passages were retrieved.", "sources": []}

    context = build_context(retrieved)
    answer = generate_answer(q, context)

    sources: list[dict] = []
    for item in retrieved:
        meta = item.get("metadata") or {}
        sources.append(
            {
                "source": meta.get("source"),
                "chunk_index": meta.get("chunk_index"),
                "distance": item.get("distance"),
                "preview": (item.get("content") or "")[:300],
            }
        )

    return {"answer": answer, "sources": sources}


def full_reset_and_reingest() -> dict:
    """DELETE /reset: clear Chroma, remove flag, re-ingest."""
    vector_store.reset_collection()
    vector_store.remove_ingest_flag()
    result = ingest_doctrine_dir(config.DOCTRINE_DATA_DIR)
    if result["chunks"] > 0:
        Path(config.INGEST_FLAG_PATH).touch()
    return {"message": "Vector store reset and re-ingested.", **result}
