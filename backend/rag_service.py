"""RAG: CSV 청크 인제스트 + 질의 응답."""

from __future__ import annotations

import logging
from pathlib import Path
from time import perf_counter
import re
from typing import Any

import config
from chunk_table_loader import load_all_chunk_rows, normalize_chroma_meta
from embeddings import embed_query, embed_texts
from ingest_seed import ensure_ingested
from llm import generate_general_answer, generate_rag_answer, load_branch_prompt
from rag.query_router import route_question, STRONG_DOCTRINE_INTENT
import vector_store

logger = logging.getLogger(__name__)

_NOISE_MARKERS = ("table of contents", "front_matter", "목차")
_DOT_LEADER_RE = re.compile(r"\.{5,}")
_GARBLED_RE = re.compile(r"i\?\S|�")


def _looks_garbled(text: str) -> bool:
    if not text:
        return True
    bad = len(_GARBLED_RE.findall(text))
    ratio = bad / max(1, len(text))
    return ratio >= 0.02


def _is_low_signal_chunk(item: dict[str, Any]) -> bool:
    meta = item.get("metadata") or {}
    chapter = str(meta.get("chapter") or "").lower()
    section = str(meta.get("section") or "").lower()
    chunk_type = str(meta.get("chunk_type") or "").lower()
    content = str(item.get("content") or "")
    combined = f"{chapter} {section} {chunk_type}".strip()
    if any(m in combined for m in _NOISE_MARKERS):
        return True
    if _DOT_LEADER_RE.search(content):
        return True
    if len(content.strip()) < 80:
        return True
    return _looks_garbled(content)


def _filter_retrieved_chunks(retrieved: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filtered = [c for c in retrieved if not _is_low_signal_chunk(c)]
    return filtered or retrieved


def _evidence_quality(chunks: list[dict[str, Any]]) -> dict[str, float]:
    if not chunks:
        return {"count": 0.0, "best_distance": 1.0, "avg_distance": 1.0}
    dists = [float(c.get("distance", 1.0) or 1.0) for c in chunks]
    return {
        "count": float(len(chunks)),
        "best_distance": min(dists),
        "avg_distance": sum(dists) / len(dists),
    }


def _insufficient_evidence_answer(question: str, sources: list[dict[str, Any]], quality: dict[str, float]) -> str:
    src_lines = []
    for i, s in enumerate(sources[:3], start=1):
        src = s.get("source") or "unknown"
        title = s.get("document_short_title") or s.get("document_title") or ""
        page = s.get("pdf_page_start") or s.get("page") or "?"
        if title:
            src_lines.append(f"{i}) {title} / {src} / p.{page}")
        else:
            src_lines.append(f"{i}) {src} / p.{page}")
    src_text = "\n".join(src_lines) if src_lines else "- 활용 가능한 근거 청크가 충분하지 않음"
    return (
        "요약:\n"
        "현재 검색된 교리 근거만으로는 질문에 대한 상세·단정적 설명을 제공하기 어렵습니다.\n\n"
        "현재 근거 범위에서의 설명:\n"
        f"- 질문: {question}\n"
        "- 확인 가능한 범위: 관련 키워드/목차 수준의 단편 정보만 확인됩니다.\n"
        "- 따라서 세부 절차, 조건, 예외사항은 확정적으로 제시하지 않습니다.\n\n"
        "근거:\n"
        f"{src_text}\n\n"
        "한계 및 다음 액션:\n"
        f"- 검색 품질 점수: best_distance={quality['best_distance']:.3f}, avg_distance={quality['avg_distance']:.3f}\n"
        "- 본문 중심 청크(목차 제외)와 해당 주제(예: 지휘통제 절차, 임무 단계, 책임체계) 페이지를 추가하면 더 상세한 답변이 가능합니다."
    )

def _ensure_dirs() -> None:
    config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    config.CHUNKS_DATA_DIR.mkdir(parents=True, exist_ok=True)


def ingest_csv_chunks_for_branch(branch: str) -> dict:
    """
    CHUNKS_DATA_DIR/{branch} 의 `*.csv` 행을 그대로 벡터로 저장 (재청킹 없음).
    본문: CHUNK_TEXT_COLUMN 또는 embedding_text → chunk_text → content.
    """
    _ensure_dirs()
    if branch not in config.SERVICE_BRANCHES:
        raise ValueError(f"Invalid branch: {branch}")
    root = config.chunks_dir_for_branch(branch)
    rows = load_all_chunk_rows(root, config.CHUNK_TEXT_COLUMN)
    # backward compatibility: 기존 단일 디렉터리(data/chunks/*.csv)를 navy로 취급
    if not rows and branch == "navy":
        rows = load_all_chunk_rows(config.CHUNKS_DATA_DIR, config.CHUNK_TEXT_COLUMN)
        if rows:
            logger.info("No navy subdir CSVs; falling back to %s/*.csv for navy ingest", config.CHUNKS_DATA_DIR)
    if not rows:
        logger.warning("No CSV rows in %s (expected `*.csv`)", root)
        return {"chunks": 0, "files": []}

    batch = max(1, config.INGEST_BATCH_SIZE)
    logger.info("Loaded %s CSV rows; embedding in batches of %s", len(rows), batch)
    n = 0
    files = {f for _, _, f in rows}
    collection = config.COLLECTION_MAP[branch]
    for start in range(0, len(rows), batch):
        chunk = rows[start : start + batch]
        texts = [t for t, _, _ in chunk]
        metas_raw = []
        for _, m, _ in chunk:
            m2 = dict(m)
            m2["service_branch"] = branch
            metas_raw.append(m2)
        metas_chroma = [normalize_chroma_meta(m) for m in metas_raw]
        embeddings = embed_texts(texts, batch_size=min(32, len(texts)))
        n += vector_store.add_chunk_records(collection, texts, embeddings, metas_chroma)
        if (start // batch + 1) % 50 == 0 or start + batch >= len(rows):
            logger.info("Ingest progress: %s / %s rows", min(start + batch, len(rows)), len(rows))
    files_sorted = sorted(files)
    logger.info("Ingested %s rows from %s CSV file(s)", n, len(files_sorted))
    return {"chunks": n, "files": files_sorted, "mode": "csv_chunks", "branch": branch, "collection": collection}


def ingest_corpus() -> dict:
    """(호환용) 단일 코퍼스 재적재 — navy 기본."""
    return ingest_csv_chunks_for_branch("navy")


def run_startup_ingest() -> None:
    ensure_ingested()


def _sources_from_retrieved(retrieved: list[dict]) -> list[dict]:
    """Chroma 검색 결과를 /chat·/retrieve 공통 출처 형식으로 변환."""
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
    sources: list[dict] = []
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
    return sources


def retrieve_passages(question: str, branch: str, top_k: int = 5) -> dict:
    """
    임베딩 + Chroma 검색만 수행 (Ollama 호출 없음). 교범 검색 탭·전용 검색 API용.
    """
    q = question.strip()
    if not q:
        raise ValueError("Question is empty.")

    if branch not in config.SERVICE_BRANCHES:
        raise ValueError(f"Invalid branch: {branch}")
    collection = config.COLLECTION_MAP[branch]

    if vector_store.collection_count(collection) == 0:
        return {
            "sources": [],
            "indexed": False,
            "hint": (
                f"No documents indexed. Add chunk CSV under {config.CHUNKS_DATA_DIR} "
                "and restart the backend (or DELETE /reset)."
            ),
        }

    q_emb = embed_query(q)
    retrieved = vector_store.search(collection, q_emb, top_k=top_k)
    retrieved = _filter_retrieved_chunks(retrieved)
    if not retrieved:
        return {"sources": [], "indexed": True}

    return {"branch": branch, "sources": _sources_from_retrieved(retrieved), "indexed": True}


def build_context(chunks: list[dict]) -> str:
    blocks: list[str] = []
    total_chars = 0
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

        raw_text = item.get("content", "") or ""
        if len(raw_text) > config.RAG_CHUNK_CHAR_LIMIT:
            text = raw_text[: config.RAG_CHUNK_CHAR_LIMIT].rstrip() + "\n...(truncated)"
        else:
            text = raw_text

        block = (
            f"""
[Evidence {idx}]
{", ".join(cite_bits)}
Chunk index: {meta.get("chunk_index", "unknown")}
Text:
{text}
""".strip()
        )
        if total_chars + len(block) > config.RAG_CONTEXT_CHAR_LIMIT:
            break
        blocks.append(block)
        total_chars += len(block)
    return "\n\n".join(blocks)


def _answer_with_rag(
    q: str,
    branch: str,
    top_k: int,
    routed_chunks: list[dict[str, Any]] | None = None,
    route_reason: str = "forced_rag",
    route_confidence: float = 1.0,
) -> dict[str, Any]:
    t0 = perf_counter()
    collection = config.COLLECTION_MAP[branch]
    if vector_store.collection_count(collection) == 0:
        hint = (
            f"No documents are indexed yet. Add preprocessed chunk CSV (e.g. All_RAG_Chunks.csv) under "
            f"{config.chunks_dir_for_branch(branch)} and restart the backend (or DELETE /reset)."
        )
        return {
            "mode": "rag",
            "branch": branch,
            "answer": hint,
            "sources": [],
            "route_reason": route_reason,
            "route_confidence": route_confidence,
        }

    t_embed_start = perf_counter()
    retrieved = routed_chunks
    if retrieved is None:
        q_emb = embed_query(q)
        t_embed_ms = (perf_counter() - t_embed_start) * 1000
        t_search_start = perf_counter()
        retrieved = vector_store.search(collection, q_emb, top_k=max(top_k, 8))
        t_search_ms = (perf_counter() - t_search_start) * 1000
    else:
        t_embed_ms = 0.0
        t_search_ms = 0.0
        retrieved = retrieved[: max(top_k, 8)]

    retrieved = _filter_retrieved_chunks(retrieved)

    if not retrieved:
        return {
            "mode": "rag",
            "branch": branch,
            "answer": "No relevant passages were retrieved.",
            "sources": [],
            "route_reason": route_reason,
            "route_confidence": route_confidence,
        }

    sources = _sources_from_retrieved(retrieved)
    quality = _evidence_quality(retrieved)
    weak_evidence = quality["count"] < 2 or quality["best_distance"] > (config.RETRIEVAL_MAX_DISTANCE + 0.05)
    if weak_evidence:
        return {
            "mode": "rag",
            "branch": branch,
            "answer": _insufficient_evidence_answer(q, sources, quality),
            "sources": sources,
            "route_reason": f"{route_reason}|weak_evidence",
            "route_confidence": min(route_confidence, 0.7),
        }

    t_ctx_start = perf_counter()
    context = build_context(retrieved[:top_k])
    t_ctx_ms = (perf_counter() - t_ctx_start) * 1000
    t_llm_start = perf_counter()
    system_prompt = (
        f"{load_branch_prompt(branch)}\n"
        "- If evidence is sufficient, provide a detailed explanation with 8-12 concrete bullet points.\n"
        "- Each bullet should be 2-4 sentences long and cover concrete steps, conditions, and implications.\n"
        "- Output length: total answer should be at least 1200 Korean characters when evidence is sufficient.\n"
        "- In '근거', map each key claim to evidence numbers (e.g. 근거: [1][2] ...).\n"
        "- Do NOT include a separate '한계' section header.\n"
        "- If evidence is insufficient, briefly state that the dataset lacks enough information and then provide helpful next steps (without a '한계' section)."
    )
    answer = generate_rag_answer(q, context, system_prompt=system_prompt)
    t_llm_ms = (perf_counter() - t_llm_start) * 1000
    t_total_ms = (perf_counter() - t0) * 1000
    logger.info(
        "RAG timing | embed=%.1fms search=%.1fms context=%.1fms llm=%.1fms total=%.1fms retrieved=%s top_k=%s context_chars=%s",
        t_embed_ms,
        t_search_ms,
        t_ctx_ms,
        t_llm_ms,
        t_total_ms,
        len(retrieved[:top_k]),
        top_k,
        len(context),
    )
    return {
        "mode": "rag",
        "branch": branch,
        "answer": answer,
        "sources": sources,
        "route_reason": route_reason,
        "route_confidence": route_confidence,
    }


def ask_question(question: str, branch: str, top_k: int = 5, mode: str = "auto") -> dict:
    t0 = perf_counter()
    q = question.strip()
    if not q:
        raise ValueError("Question is empty.")

    if mode not in ("auto", "rag", "general"):
        raise ValueError("Invalid mode. Use one of: auto, rag, general")
    if branch not in config.SERVICE_BRANCHES:
        raise ValueError(f"Invalid branch: {branch}")
    if mode == "general":
        return {
            "mode": "general",
            "branch": branch,
            "answer": generate_general_answer(q, branch=branch),
            "sources": [],
            "route_reason": "forced_general",
            "route_confidence": 1.0,
        }
    if mode == "rag":
        return _answer_with_rag(q, branch, top_k, route_reason="forced_rag", route_confidence=1.0)

    router = route_question(q, branch=branch)
    route = router.get("route", "general")
    reason = str(router.get("reason", "auto_route"))
    confidence = float(router.get("confidence", 0.5))

    # Safety override:
    # 모델/임베딩 상태에 따라 lexical routing이 "general"로 내려갈 수 있는데,
    # 질문 안에 '교리' 성격(예: 교리/개념/설명/근거/정의 등)이 강하게 들어있으면
    # 사용자 기대대로 RAG를 사용하도록 강제합니다.
    has_strong_doctrine_intent = any(w in q for w in STRONG_DOCTRINE_INTENT)
    if route != "rag" and has_strong_doctrine_intent:
        forced_reason = f"{reason}|forced_rag_by_strong_doctrine_intent"
        return _answer_with_rag(
            q,
            branch,
            top_k,
            routed_chunks=None,
            route_reason=forced_reason,
            route_confidence=max(confidence, 0.8),
        )

    if route == "rag":
        routed_chunks = router.get("retrieved_chunks") if isinstance(router.get("retrieved_chunks"), list) else None
        return _answer_with_rag(
            q,
            branch,
            top_k,
            routed_chunks=routed_chunks,
            route_reason=reason,
            route_confidence=confidence,
        )
    return {
        "mode": "general",
        "branch": branch,
        "answer": generate_general_answer(q, branch=branch),
        "sources": [],
        "route_reason": reason,
        "route_confidence": confidence,
    }


def full_reset_and_reingest() -> dict:
    """DELETE /reset: clear all branch collections, remove flags, re-ingest CSV per branch."""
    for b in config.SERVICE_BRANCHES:
        vector_store.reset_collection(config.COLLECTION_MAP[b])
        vector_store.remove_ingest_flag(config.CHROMA_DIR / f".ingested_{b}")
    results = []
    for b in config.SERVICE_BRANCHES:
        r = ingest_csv_chunks_for_branch(b)
        if r.get("chunks", 0) > 0:
            Path(config.CHROMA_DIR / f".ingested_{b}").touch()
        results.append(r)
    return {"message": "Vector store reset and re-ingested.", "results": results}
