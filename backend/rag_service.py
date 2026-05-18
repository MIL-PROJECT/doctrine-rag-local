"""RAG: CSV 청크 인제스트 + 질의 응답."""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from time import perf_counter
import re
from typing import Any, Iterator

import config
from chunk_table_loader import load_all_chunk_rows, normalize_chroma_meta
from embeddings import embed_query, embed_texts
from ingest_seed import ensure_ingested
from llm import (
    USER_FACING_UNAVAILABLE,
    generate_general_answer,
    generate_rag_answer,
    iter_stream_general_answer,
    iter_stream_rag_answer,
    load_branch_prompt,
)
from rag.query_router import _is_casual_backchannel, route_question, STRONG_DOCTRINE_INTENT
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


def _chunk_fingerprint(item: dict[str, Any]) -> str:
    meta = item.get("metadata") or {}
    cid = str(meta.get("chunk_id") or meta.get("chunk_index") or "").strip()
    if cid:
        return f"id:{cid}"
    doc = str(meta.get("document_id") or meta.get("source") or "")
    body = re.sub(r"\s+", " ", str(item.get("content") or "")[:160].strip().lower())
    return f"doc:{doc}|{body}"


def _dedupe_retrieved_chunks(retrieved: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """유사·중복 청크 제거 — 동일 문서 메타만 여러 개 올라오는 것 방지."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in retrieved:
        fp = _chunk_fingerprint(item)
        if fp in seen:
            continue
        seen.add(fp)
        out.append(item)
        if len(out) >= limit:
            break
    return out or retrieved[:limit]


def _evidence_chunks_homogeneous(chunks: list[dict[str, Any]]) -> bool:
    """동일 문서·유사 본문만 여러 개 검색된 경우 (메타 반복 답변 유발)."""
    if len(chunks) < 3:
        return False
    titles: set[str] = set()
    prefixes: list[str] = []
    for c in chunks:
        meta = c.get("metadata") or {}
        title = str(meta.get("document_title") or meta.get("document_short_title") or "").strip()
        if title:
            titles.add(title)
        body = re.sub(r"\s+", " ", str(c.get("content") or "")[:100].lower())
        if body:
            prefixes.append(body)
    if len(titles) != 1:
        return False
    return len(set(prefixes)) <= max(2, len(prefixes) // 3)


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
        "service_branch",
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


def _branch_label(branch: str) -> str:
    return {"army": "육군", "navy": "해군", "air_force": "공군"}.get(branch, branch)


def _answer_common_parallel_rag(question: str, top_k: int) -> dict[str, Any]:
    """공통 브랜치: 3군 RAG를 병렬 실행해 하나의 답변으로 합침."""
    q = question.strip()
    if not q:
        raise ValueError("Question is empty.")

    branch_results: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {
            pool.submit(
                _answer_with_rag,
                q,
                b,
                top_k,
                None,
                "common_parallel_forced_rag",
                1.0,
            ): b
            for b in config.SERVICE_BRANCHES
        }
        for fut in as_completed(futures):
            b = futures[fut]
            try:
                branch_results[b] = fut.result()
            except Exception as e:
                branch_results[b] = {
                    "mode": "rag",
                    "branch": b,
                    "answer": f"{_branch_label(b)} 처리 중 오류가 발생했습니다: {e}",
                    "sources": [],
                    "route_reason": "common_parallel_error",
                    "route_confidence": 0.0,
                }

    answer_blocks: list[str] = []
    merged_sources: list[dict[str, Any]] = []
    for b in config.SERVICE_BRANCHES:
        res = branch_results.get(b) or {}
        answer_blocks.append(f"## {_branch_label(b)}\n{str(res.get('answer') or '답변 없음')}")
        for src in (res.get("sources") or []):
            row = dict(src) if isinstance(src, dict) else {}
            row["service_branch"] = b
            merged_sources.append(row)

    return {
        "mode": "rag",
        "branch": "common",
        "answer": "\n\n".join(answer_blocks),
        "sources": merged_sources,
        "route_reason": "common_parallel_forced_rag",
        "route_confidence": 1.0,
    }


def list_indexed_documents(branch: str) -> dict[str, Any]:
    """군별 컬렉션에서 문서 단위 메타데이터를 집계."""
    if branch == "common":
        merged: dict[str, dict[str, Any]] = {}
        has_any_index = False
        for b in config.SERVICE_BRANCHES:
            part = list_indexed_documents(b)
            docs = part.get("documents") or []
            if docs:
                has_any_index = True
            for d in docs:
                key = str(d.get("doc_id") or d.get("document_no") or d.get("title") or "").strip()
                if not key:
                    continue
                row = merged.get(key)
                if row is None:
                    row = {
                        "doc_id": key,
                        "title": str(d.get("title") or key),
                        "source": d.get("source"),
                        "document_no": str(d.get("document_no") or key),
                        "chunk_count": 0,
                        "keywords": set(),
                        "branches": set(),
                    }
                    merged[key] = row
                row["chunk_count"] = int(row["chunk_count"]) + int(d.get("chunk_count") or 0)
                row["branches"].add(b)
                for kw in d.get("keywords") or []:
                    if isinstance(kw, str) and kw.strip():
                        row["keywords"].add(kw.strip())

        if not has_any_index:
            return {"branch": "common", "indexed": False, "documents": []}

        items: list[dict[str, Any]] = []
        branch_ko = {"army": "육군", "navy": "해군", "air_force": "공군"}
        for row in merged.values():
            branches = sorted(list(row["branches"]))
            branch_tags = [f"군:{branch_ko.get(b, b)}" for b in branches]
            keywords = sorted(list(row["keywords"]))
            items.append(
                {
                    "doc_id": row["doc_id"],
                    "title": row["title"],
                    "source": row["source"],
                    "document_no": row["document_no"],
                    "chunk_count": row["chunk_count"],
                    "keywords": [*branch_tags, *keywords],
                    "branches": branches,
                }
            )

        items.sort(key=lambda x: (str(x["title"]).lower(), str(x["doc_id"]).lower()))
        return {"branch": "common", "indexed": True, "documents": items}

    if branch not in config.SERVICE_BRANCHES:
        raise ValueError(f"Invalid branch: {branch}")

    collection = config.COLLECTION_MAP[branch]
    if vector_store.collection_count(collection) == 0:
        return {"branch": branch, "indexed": False, "documents": []}

    metadatas = vector_store.list_document_metadatas(collection)
    docs: dict[str, dict[str, Any]] = {}

    for meta in metadatas:
        source = str(meta.get("source") or "").strip()
        title = str(meta.get("document_title") or meta.get("document_short_title") or source or "문서").strip()
        doc_id = str(meta.get("document_id") or source or title).strip()
        chapter = str(meta.get("chapter") or "").strip()
        section = str(meta.get("section") or "").strip()

        key = doc_id or title or source
        if not key:
            continue

        row = docs.get(key)
        if row is None:
            row = {
                "doc_id": key,
                "title": title or key,
                "source": source or None,
                "document_no": doc_id or key,
                "chunk_count": 0,
                "keywords": set(),
            }
            docs[key] = row

        row["chunk_count"] = int(row["chunk_count"]) + 1
        if chapter:
            row["keywords"].add(chapter)
        if section:
            row["keywords"].add(section)

    items: list[dict[str, Any]] = []
    for row in docs.values():
        keywords = sorted(list(row["keywords"]))
        items.append(
            {
                "doc_id": row["doc_id"],
                "title": row["title"],
                "source": row["source"],
                "document_no": row["document_no"],
                "chunk_count": row["chunk_count"],
                "keywords": keywords,
            }
        )

    items.sort(key=lambda x: (str(x["title"]).lower(), str(x["doc_id"]).lower()))
    return {"branch": branch, "indexed": True, "documents": items}


def _evidence_display_title(meta: dict[str, Any]) -> str:
    """답변 근거 괄호에 붙일 짧은 제목 — 메타의 문서명·장·절을 조합."""
    title = (meta.get("document_title") or meta.get("document_short_title") or "").strip()
    chapter = str(meta.get("chapter") or "").strip()
    section = str(meta.get("section") or "").strip()
    src = str(meta.get("source") or "").strip()
    parts: list[str] = []
    if title:
        parts.append(title)
    elif src:
        parts.append(src)
    if chapter:
        parts.append(chapter)
    if section and section != chapter:
        parts.append(section)
    return " — ".join(parts) if parts else (src or "출처 미상")


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

        display_title = _evidence_display_title(meta)
        block = (
            f"""
[Evidence {idx}]
표기용 제목 (근거에 번호와 함께 반드시 이 이름을 적을 것): {display_title}
{", ".join(cite_bits)}
Chunk index: {meta.get("chunk_index", "unknown")}
Text:
{text}
""".strip()
        )
        ctx_limit = (
            config.VLLM_RAG_CONTEXT_CHAR_LIMIT
            if config.LLM_PROVIDER == "vllm"
            else config.RAG_CONTEXT_CHAR_LIMIT
        )
        if total_chars + len(block) > ctx_limit:
            break
        blocks.append(block)
        total_chars += len(block)
    return "\n\n".join(blocks)


def _full_rag_system_prompt(branch: str) -> str:
    if config.LLM_PROVIDER == "vllm":
        length_rules = (
            "- 최종 답변 본문은 반드시 한국어(한글)만 사용한다. 영어 설명 문장 금지.\n"
            "- 근거가 충분하면 ## 요약 / ## 근거 섹션을 사용한다.\n"
            "- 요약: 서로 다른 요점 2~4개 불릿만 (각 1~2문장). 같은 문장을 불릿마다 반복하지 말 것.\n"
            "- 근거: [번호]마다 해당 Evidence Text의 고유 내용만 1~2문장. 문서 제목·목적 설명만 8번 반복 금지.\n"
            "- Evidence가 메타설명만 있으면 「본문 단서 부족」을 명시하고 불릿 개수를 억지로 채우지 말 것.\n"
            "- 한국어 기준 600~1400자 내외로 충분히 작성 (반복으로 길이 채우기 금지).\n"
            "- 별도 '한계' 섹션 헤더는 쓰지 않는다."
        )
    else:
        length_rules = (
            "- 최종 답변 본문은 반드시 한국어(한글)만 사용한다. 영어 설명 문장 금지.\n"
            "- If evidence is sufficient: use sections 요약 / 근거. 요약은 5-8개 불릿, 각 불릿 2-3문장.\n"
            "- 전체 분량은 한국어 기준 대략 800~1500자 내외로 충분히 작성.\n"
            "- 근거에서는 [증거번호]만 쓰지 말고, 각 블록 첫 줄의 「표기용 제목」과 동일한 문서·장·절 이름을 번호 직후에 붙일 것.\n"
            "  예: 근거: [2] NWP 5-01 — 제3장 … / [4] FM 3-0 — …\n"
            "- Do NOT include a separate '한계' section header.\n"
            "- If evidence is insufficient, briefly state that the dataset lacks enough information and then provide helpful next steps."
        )
    return f"{load_branch_prompt(branch)}\n{length_rules}"


def _prepare_rag_for_llm(
    q: str,
    branch: str,
    top_k: int,
    routed_chunks: list[dict[str, Any]] | None,
    route_reason: str,
    route_confidence: float,
) -> dict[str, Any]:
    """RAG에서 LLM 호출 직전까지. kind=early면 payload만 반환, kind=ready면 context·sources 등."""
    collection = config.COLLECTION_MAP[branch]
    if vector_store.collection_count(collection) == 0:
        hint = (
            f"No documents are indexed yet. Add preprocessed chunk CSV (e.g. All_RAG_Chunks.csv) under "
            f"{config.chunks_dir_for_branch(branch)} and restart the backend (or DELETE /reset)."
        )
        return {
            "kind": "early",
            "payload": {
                "mode": "rag",
                "branch": branch,
                "answer": hint,
                "sources": [],
                "route_reason": route_reason,
                "route_confidence": route_confidence,
            },
        }

    retrieved = routed_chunks
    if retrieved is None:
        q_emb = embed_query(q)
        retrieve_k = max(top_k, 6)
        retrieved = vector_store.search(collection, q_emb, top_k=retrieve_k)
    else:
        retrieve_cap = max(top_k, 6)
        retrieved = retrieved[:retrieve_cap]

    retrieved = _filter_retrieved_chunks(retrieved)
    retrieved = _dedupe_retrieved_chunks(retrieved, max(top_k, 6))

    if not retrieved:
        return {
            "kind": "early",
            "payload": {
                "mode": "rag",
                "branch": branch,
                "answer": "No relevant passages were retrieved.",
                "sources": [],
                "route_reason": route_reason,
                "route_confidence": route_confidence,
            },
        }

    sources = _sources_from_retrieved(retrieved)
    quality = _evidence_quality(retrieved)
    weak_evidence = quality["count"] < 2 or quality["best_distance"] > (config.RETRIEVAL_MAX_DISTANCE + 0.05)
    if weak_evidence:
        return {
            "kind": "early",
            "payload": {
                "mode": "rag",
                "branch": branch,
                "answer": _insufficient_evidence_answer(q, sources, quality),
                "sources": sources,
                "route_reason": f"{route_reason}|weak_evidence",
                "route_confidence": min(route_confidence, 0.7),
            },
        }

    use_chunks = retrieved[:top_k]
    homogeneous = _evidence_chunks_homogeneous(use_chunks)
    if homogeneous:
        use_chunks = use_chunks[:3]
        route_reason = f"{route_reason}|homogeneous_evidence"

    context = build_context(use_chunks)
    if homogeneous:
        context = (
            "[주의] 검색된 Evidence가 동일 문서·유사 구간입니다. "
            "문서 제목·목적 설명을 반복하지 말고, Text에 있는 구체적 조항·절차만 2~3문장으로 요약하세요. "
            "본문 단서가 없으면 「검색 본문 부족」을 명시하세요.\n\n"
            + context
        )
    return {
        "kind": "ready",
        "context": context,
        "sources": sources,
        "branch": branch,
        "route_reason": route_reason,
        "route_confidence": route_confidence,
        "top_k": top_k,
        "retrieved_n": len(use_chunks),
        "context_chars": len(context),
        "homogeneous_evidence": homogeneous,
    }


def _answer_with_rag(
    q: str,
    branch: str,
    top_k: int,
    routed_chunks: list[dict[str, Any]] | None = None,
    route_reason: str = "forced_rag",
    route_confidence: float = 1.0,
) -> dict[str, Any]:
    t0 = perf_counter()
    prep = _prepare_rag_for_llm(q, branch, top_k, routed_chunks, route_reason, route_confidence)
    if prep["kind"] == "early":
        return prep["payload"]

    context = prep["context"]
    sources = prep["sources"]
    branch = prep["branch"]
    route_reason = prep["route_reason"]
    route_confidence = prep["route_confidence"]

    t_llm_start = perf_counter()
    answer = generate_rag_answer(
        q, context, system_prompt=_full_rag_system_prompt(branch), branch=branch
    )
    t_llm_ms = (perf_counter() - t_llm_start) * 1000
    t_total_ms = (perf_counter() - t0) * 1000
    logger.info(
        "RAG timing | llm=%.1fms total=%.1fms retrieved=%s top_k=%s context_chars=%s",
        t_llm_ms,
        t_total_ms,
        prep.get("retrieved_n"),
        top_k,
        prep.get("context_chars"),
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
    if branch == "common":
        # 합참(common)에서도 "일반 채팅"을 선택하면 3군 병렬 RAG 대신 일반 LLM 응답으로 우회
        if mode == "general":
            return {
                "mode": "general",
                "branch": "common",
                "answer": generate_general_answer(q, branch="common"),
                "sources": [],
                "route_reason": "common_forced_general",
                "route_confidence": 1.0,
            }
        return _answer_common_parallel_rag(q, top_k)

    if branch not in config.SERVICE_BRANCHES:
        raise ValueError(f"Invalid branch: {branch}")
    if _is_casual_backchannel(q):
        return {
            "mode": "general",
            "branch": branch,
            "answer": (
                "알겠습니다. 교리·작전·절차 등 구체적인 질문을 해 주시면, "
                "선택하신 군(육·해·공) 교범 근거를 바탕으로 답변드릴게요."
            ),
            "sources": [],
            "route_reason": "casual_backchannel",
            "route_confidence": 1.0,
        }
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


def _ndjson(obj: dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False) + "\n"


def _yield_answer_payload_stream(data: dict[str, Any]) -> Iterator[str]:
    """완성된 응답 dict → meta + delta(청크) + done (공통·casual 등 동기 답변용)."""
    yield _ndjson(
        {
            "type": "meta",
            "mode": data.get("mode"),
            "branch": data.get("branch"),
            "sources": data.get("sources") or [],
            "route_reason": data.get("route_reason"),
            "route_confidence": data.get("route_confidence"),
        },
    )
    text = str(data.get("answer") or "")
    step = 72
    for i in range(0, len(text), step):
        yield _ndjson({"type": "delta", "text": text[i : i + step]})
    yield _ndjson({"type": "done"})


def _stream_rag_token_events(
    q: str,
    branch: str,
    top_k: int,
    routed_chunks: list[dict[str, Any]] | None,
    route_reason: str,
    route_confidence: float,
) -> Iterator[str]:
    prep = _prepare_rag_for_llm(q, branch, top_k, routed_chunks, route_reason, route_confidence)
    if prep["kind"] == "early":
        yield from _yield_answer_payload_stream(prep["payload"])
        return
    yield _ndjson(
        {
            "type": "meta",
            "mode": "rag",
            "branch": prep["branch"],
            "sources": prep["sources"],
            "route_reason": prep["route_reason"],
            "route_confidence": prep["route_confidence"],
        },
    )
    for kind, chunk in iter_stream_rag_answer(
        q, prep["context"], _full_rag_system_prompt(branch), branch=branch
    ):
        if kind == "error":
            yield _ndjson({"type": "error", "detail": chunk or USER_FACING_UNAVAILABLE})
            yield _ndjson({"type": "done"})
            return
        if kind == "done":
            break
        if kind == "delta" and chunk:
            yield _ndjson({"type": "delta", "text": chunk})
    yield _ndjson({"type": "done"})


def _stream_general_tokens(
    q: str,
    branch: str,
    route_reason: str,
    route_confidence: float,
) -> Iterator[str]:
    yield _ndjson(
        {
            "type": "meta",
            "mode": "general",
            "branch": branch,
            "sources": [],
            "route_reason": route_reason,
            "route_confidence": route_confidence,
        },
    )
    for kind, chunk in iter_stream_general_answer(q, branch):
        if kind == "error":
            yield _ndjson({"type": "error", "detail": chunk or USER_FACING_UNAVAILABLE})
            yield _ndjson({"type": "done"})
            return
        if kind == "done":
            break
        if kind == "delta" and chunk:
            yield _ndjson({"type": "delta", "text": chunk})
    yield _ndjson({"type": "done"})


def iter_chat_stream_ndjson(question: str, branch: str, top_k: int, mode: str) -> Iterator[str]:
    """NDJSON 한 줄 = JSON 객체. type: meta | delta | error | done."""
    q = question.strip()
    if not q:
        yield _ndjson({"type": "error", "detail": "question이 비어 있습니다."})
        return
    if mode not in ("auto", "rag", "general"):
        yield _ndjson({"type": "error", "detail": "Invalid mode. Use one of: auto, rag, general"})
        return

    if branch == "common":
        data = ask_question(q, branch="common", top_k=top_k, mode=mode)
        yield from _yield_answer_payload_stream(data)
        return

    if branch not in config.SERVICE_BRANCHES:
        yield _ndjson({"type": "error", "detail": f"Invalid branch: {branch}"})
        return

    if _is_casual_backchannel(q):
        yield from _yield_answer_payload_stream(
            {
                "mode": "general",
                "branch": branch,
                "answer": (
                    "알겠습니다. 교리·작전·절차 등 구체적인 질문을 해 주시면, "
                    "선택하신 군(육·해·공) 교범 근거를 바탕으로 답변드릴게요."
                ),
                "sources": [],
                "route_reason": "casual_backchannel",
                "route_confidence": 1.0,
            },
        )
        return

    if mode == "general":
        yield from _stream_general_tokens(q, branch, "forced_general", 1.0)
        return
    if mode == "rag":
        yield from _stream_rag_token_events(q, branch, top_k, None, "forced_rag", 1.0)
        return

    router = route_question(q, branch=branch)
    route = router.get("route", "general")
    reason = str(router.get("reason", "auto_route"))
    confidence = float(router.get("confidence", 0.5))

    has_strong_doctrine_intent = any(w in q for w in STRONG_DOCTRINE_INTENT)
    if route != "rag" and has_strong_doctrine_intent:
        forced_reason = f"{reason}|forced_rag_by_strong_doctrine_intent"
        yield from _stream_rag_token_events(
            q,
            branch,
            top_k,
            None,
            forced_reason,
            max(confidence, 0.8),
        )
        return

    if route == "rag":
        routed_chunks = router.get("retrieved_chunks") if isinstance(router.get("retrieved_chunks"), list) else None
        yield from _stream_rag_token_events(q, branch, top_k, routed_chunks, reason, confidence)
        return

    yield from _stream_general_tokens(q, branch, reason, confidence)


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
