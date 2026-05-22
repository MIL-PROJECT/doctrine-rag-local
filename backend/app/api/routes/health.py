from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app import state
from app.core import config
from app.llm import llm_health_status, ollama_health_status
from app.rag import vector_store

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, Any]:
    per_branch = {b: vector_store.collection_count(config.COLLECTION_MAP[b]) for b in config.SERVICE_BRANCHES}
    ollama = ollama_health_status()
    reachable = bool(ollama["reachable"])
    ollama_block: dict[str, Any] = {
        "reachable": reachable,
        "base_url": ollama["base_url"],
        "model": ollama["model"],
    }
    if reachable:
        ollama_block["models"] = ollama.get("models") or []
    else:
        ollama_block["error"] = ollama.get("error") or "Remote Ollama server unavailable"

    block: dict[str, Any] = {"ledger_enabled": False}
    try:
        from app.blockchain import config as _bc
        from app.blockchain.verifier import verify_chain as _verify_chain

        _v = _verify_chain()
        block = {
            "ledger_enabled": _bc.BLOCKCHAIN_ENABLED,
            "chain_valid": _v.get("valid"),
            "ledger_events": _v.get("total_events"),
        }
    except Exception as e:
        block = {"ledger_enabled": False, "error": str(e)[:120]}

    from app.llm._utils import run_async

    llm_block: dict[str, Any] = {"provider": config.LLM_PROVIDER}
    try:
        llm_h = run_async(llm_health_status())
        llm_block["base_url"] = llm_h.get("base_url")
        llm_block["reachable"] = bool(llm_h.get("reachable"))
        if llm_h.get("error"):
            llm_block["error"] = llm_h.get("error")
        if llm_h.get("model"):
            llm_block["model"] = llm_h.get("model")
    except Exception as e:
        llm_block["reachable"] = False
        llm_block["error"] = str(e)[:120]

    return {
        "api": "ok",
        "status": "ok",
        "service": "doctrine-rag-ollama",
        "llm": llm_block,
        "ollama": ollama_block,
        "vector_db": {
            config.COLLECTION_MAP["army"]: per_branch["army"],
            config.COLLECTION_MAP["navy"]: per_branch["navy"],
            config.COLLECTION_MAP["air_force"]: per_branch["air_force"],
        },
        "chroma_documents": int(sum(per_branch.values())),
        "ollama_reachable": reachable,
        "ollama_model": ollama["model"],
        "ingest_flag": all((config.CHROMA_DIR / f".ingested_{b}").exists() for b in config.SERVICE_BRANCHES),
        "ingest_mode": "csv_chunks",
        "ingest_in_progress": state.INGEST_IN_PROGRESS,
        "chunks_data_dir": config.CHUNKS_PATH_DISPLAY,
        "top_k_max": config.TOP_K_MAX,
        "blockchain": block,
    }


@router.get("/branches")
def branches() -> dict[str, Any]:
    def _desc(b: str) -> str:
        if b == "common":
            return "육·해·공군 교리 근거를 병렬로 조회하여 통합 비교 응답"
        if b == "army":
            return "지상작전, 방어, 공격, 기동, 화력 운용 중심 질의응답"
        if b == "navy":
            return "해상작전, 함대 운용, 해양통제, 합동작전 중심 질의응답"
        return "항공작전, 공역통제, 항공전력 운용 중심 질의응답"

    def _label(b: str) -> str:
        return {"common": "공통", "army": "육군", "navy": "해군", "air_force": "공군"}[b]

    def _theme(b: str) -> str:
        return {"common": "common", "army": "land", "navy": "sea", "air_force": "air"}[b]

    items = []
    for b in ("common", *config.SERVICE_BRANCHES):
        if b == "common":
            items.append(
                {
                    "id": b,
                    "label": _label(b),
                    "collection": "all_branches",
                    "documents": int(sum(vector_store.collection_count(config.COLLECTION_MAP[x]) for x in config.SERVICE_BRANCHES)),
                    "theme": _theme(b),
                    "description": _desc(b),
                }
            )
            continue
        col = config.COLLECTION_MAP[b]
        items.append(
            {
                "id": b,
                "label": _label(b),
                "collection": col,
                "documents": vector_store.collection_count(col),
                "theme": _theme(b),
                "description": _desc(b),
            }
        )
    return {"branches": items}
