"""ChromaDB vector store — cosine space, precomputed embeddings."""

from __future__ import annotations

import logging
import uuid
from typing import Any

import chromadb
from chromadb.config import Settings

import config

logger = logging.getLogger(__name__)
# Chroma telemetry-posthog version mismatch noise suppression.
logging.getLogger("chromadb.telemetry.product.posthog").setLevel(logging.CRITICAL)

# anonymized_telemetry=False: posthog 최신 버전과 chromadb 텔레메트리 호출 시그니처 불일치로
# "capture() takes 1 positional argument but 3 were given" 로그가 나오는 것을 방지
_client = chromadb.PersistentClient(
    path=str(config.CHROMA_DIR),
    settings=Settings(anonymized_telemetry=False),
)
_collections: dict[str, Any] = {}


def _get_collection(name: str):
    col = _collections.get(name)
    if col is None:
        col = _client.get_or_create_collection(name=name, metadata={"hnsw:space": "cosine"})
        _collections[name] = col
    return col


def collection_count(collection_name: str | None = None) -> int:
    """기본 컬렉션 또는 지정 컬렉션 문서 수."""
    name = collection_name or config.COLLECTION_NAME
    return _get_collection(name).count()


def collection_stats(collection_name: str | None = None) -> dict[str, Any]:
    """헬스/모니터링용 — 컬렉션명·문서 수·설정상 Chroma 경로 표시."""
    name = collection_name or config.COLLECTION_NAME
    return {"collection": name, "documents": collection_count(name), "path": config.CHROMA_PATH_DISPLAY}


def add_chunk_records(
    collection_name: str,
    documents: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict[str, Any]],
    ids: list[str] | None = None,
) -> int:
    """행마다 다른 메타데이터를 가진 청크 일괄 추가."""
    if not documents:
        return 0
    if len(documents) != len(embeddings) or len(documents) != len(metadatas):
        raise ValueError("documents, embeddings, metadatas length mismatch.")
    id_list = ids if ids is not None and len(ids) == len(documents) else [str(uuid.uuid4()) for _ in documents]
    _get_collection(collection_name).add(
        ids=id_list,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    return len(documents)


def search(collection_name: str, question_embedding: list[float], top_k: int) -> list[dict[str, Any]]:
    n = collection_count(collection_name)
    if n == 0:
        return []
    k = min(max(top_k, 1), n)
    res = _get_collection(collection_name).query(
        query_embeddings=[question_embedding],
        n_results=k,
    )
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]

    out: list[dict[str, Any]] = []
    for i, content in enumerate(docs):
        meta = metas[i] if i < len(metas) else {}
        dist = dists[i] if i < len(dists) else None
        out.append(
            {
                "content": content or "",
                "metadata": dict(meta) if meta else {},
                "distance": float(dist) if dist is not None else None,
            }
        )
    return out


def reset_collection(collection_name: str | None = None) -> None:
    """컬렉션 비우기 (지정 없으면 기본 컬렉션)."""
    name = collection_name or config.COLLECTION_NAME
    try:
        _client.delete_collection(name)
    except Exception:
        logger.warning("delete_collection failed or missing", exc_info=True)
    _collections.pop(name, None)
    _get_collection(name)


def remove_ingest_flag(path) -> None:
    """기존 호환: flag 파일 삭제(경로는 호출자가 지정)."""
    try:
        if path.exists():
            path.unlink()
    except Exception:
        logger.warning("remove_ingest_flag failed", exc_info=True)
