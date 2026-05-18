import logging
import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

import config
from llm import llm_health_status, ollama_health_status
from llm.factory import resolve_chat_model
from rag_service import ask_question, full_reset_and_reingest, list_indexed_documents, retrieve_passages, run_startup_ingest, iter_chat_stream_ndjson
import vector_store
from a2a.supervisor import run_a2a_task
from a2a.audit import read_recent, record, emit_blockchain_event

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)
INGEST_IN_PROGRESS = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Startup: running CSV chunk ingest if needed (dir=%s)...", config.CHUNKS_PATH_DISPLAY)
    global INGEST_IN_PROGRESS
    INGEST_IN_PROGRESS = True

    async def _do_ingest() -> None:
        global INGEST_IN_PROGRESS
        try:
            await run_in_threadpool(run_startup_ingest)
            counts = {b: vector_store.collection_count(config.COLLECTION_MAP[b]) for b in config.SERVICE_BRANCHES}
            logger.info("Startup: ingest step finished. Chroma counts=%s", counts)
        finally:
            INGEST_IN_PROGRESS = False

    # 서버는 먼저 떠서 /health, /chat, /retrieve 가 즉시 응답하도록 함.
    asyncio.create_task(_do_ingest())
    yield
    logger.info("Shutdown complete.")


app = FastAPI(title="DoctrineRAG Ollama API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    branch: str = Field(default="navy")
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=config.TOP_K_MAX)
    mode: Literal["auto", "rag", "general"] = Field(default="auto")
    user_id: str | None = Field(default=None)
    military_number: str | None = Field(default=None)


def _audit_actor_chat(body: ChatRequest) -> dict[str, str]:
    uid = body.user_id.strip() if body.user_id else ""
    mid = body.military_number.strip() if body.military_number else ""
    return {"user_id": uid, "military_number": mid}


def _audit_question_preview(q: str, limit: int = 500) -> str:
    s = q.strip()
    if len(s) <= limit:
        return s
    return s[:limit] + "…"


def _emit_standard_chat_ledger_entry(
    *,
    chat_id: str,
    question: str,
    answer: str,
    sources: list[Any],
    branch: str,
    mode: str | None,
    pipeline: str,
    body: ChatRequest,
    route_reason: Any = None,
    route_confidence: Any = None,
    stream_error: str | None = None,
) -> dict[str, Any]:
    from blockchain.audit_event import build_standard_chat_ledger_payload

    return emit_blockchain_event(
        build_standard_chat_ledger_payload(
            chat_id,
            question,
            answer,
            sources,
            branch=branch,
            mode=mode,
            pipeline=pipeline,
            route_reason=route_reason,
            route_confidence=route_confidence,
            user_id=body.user_id,
            military_number=body.military_number,
            stream_error=stream_error,
        )
    )


class ChatResponse(BaseModel):
    mode: Literal["rag", "general"]
    branch: str
    answer: str
    sources: list[dict[str, Any]]
    route_reason: str | None = None
    route_confidence: float | None = None
    chat_id: str | None = None


class RetrieveRequest(BaseModel):
    branch: str = Field(default="navy")
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=8, ge=1, le=config.TOP_K_MAX)


@app.get("/health")
def health() -> dict[str, Any]:
    # branch collection counts
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
        from blockchain import config as _bc
        from blockchain.verifier import verify_chain as _verify_chain

        _v = _verify_chain()
        block = {
            "ledger_enabled": _bc.BLOCKCHAIN_ENABLED,
            "chain_valid": _v.get("valid"),
            "ledger_events": _v.get("total_events"),
        }
    except Exception as e:
        block = {"ledger_enabled": False, "error": str(e)[:120]}

    from llm._utils import run_async

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
        # backward compatible field (sum)
        "chroma_documents": int(sum(per_branch.values())),
        "ollama_reachable": reachable,
        "ollama_model": ollama["model"],
        "ingest_flag": all((config.CHROMA_DIR / f".ingested_{b}").exists() for b in config.SERVICE_BRANCHES),
        "ingest_mode": "csv_chunks",
        "ingest_in_progress": INGEST_IN_PROGRESS,
        "chunks_data_dir": config.CHUNKS_PATH_DISPLAY,
        "top_k_max": config.TOP_K_MAX,
        "blockchain": block,
    }


class LLMTestRequest(BaseModel):
    branch: str = Field(default="army")
    message: str = Field(..., min_length=1)


@app.get("/llm/health")
async def llm_health() -> dict[str, Any]:
    """현재 LLM provider 연결 상태."""
    status = await llm_health_status()
    return {
        "provider": config.LLM_PROVIDER,
        "vllm_base_url_configured": bool(config.VLLM_BASE_URL),
        "ollama_base_url": config.OLLAMA_BASE_URL,
        "base_url": status.get("base_url"),
        "reachable": bool(status.get("reachable")),
        "model": status.get("model"),
        "error": status.get("error"),
    }


@app.post("/llm/test")
async def llm_test(body: LLMTestRequest) -> dict[str, Any]:
    """군별 LoRA/Ollama 연결 테스트 (RAG 없음). 운영 배포 시 비활성화 검토."""
    branch = body.branch.strip()
    if branch not in (*config.SERVICE_BRANCHES, "air"):
        raise HTTPException(status_code=400, detail=f"Unsupported branch: {branch}")
    try:
        model = resolve_chat_model(branch)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    from llm.prompts import build_system_prompt, wrap_user_message
    from llm.factory import get_llm_client

    client = get_llm_client()
    try:
        result = await client.chat(
            [
                {"role": "system", "content": build_system_prompt(branch)},
                {"role": "user", "content": wrap_user_message(body.message.strip())},
            ],
            model=model,
            temperature=0.2,
            max_tokens=min(900, config.LLM_MAX_OUTPUT_TOKENS),
            postprocess=True,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return {
        "provider": result.get("provider", config.LLM_PROVIDER),
        "branch": branch,
        "model": result.get("model", model),
        "answer": result.get("answer", ""),
        "validation": result.get("validation", {}),
    }


@app.get("/branches")
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


@app.post("/retrieve")
async def retrieve(body: RetrieveRequest) -> dict[str, Any]:
    """Chroma 유사도 검색만 수행 (LLM 없음). 프론트 교범 검색 탭용."""
    try:

        def _run() -> dict[str, Any]:
            return retrieve_passages(body.question.strip(), branch=body.branch, top_k=body.top_k)

        return await run_in_threadpool(_run)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/source-documents")
async def source_documents(branch: str = "navy") -> dict[str, Any]:
    """군별 인덱싱 문서 목록(문서 단위 집계)."""
    try:
        return await run_in_threadpool(lambda: list_indexed_documents(branch.strip() or "navy"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse:
    chat_id = str(uuid.uuid4())
    q = body.question.strip()
    record(
        "standard_chat_received",
        {
            "chat_id": chat_id,
            "pipeline": "standard_sync",
            "branch": body.branch,
            "mode": body.mode,
            "top_k": body.top_k,
            "question_preview": _audit_question_preview(q),
            "question_length": len(q),
            **_audit_actor_chat(body),
        },
    )
    try:

        def _ask() -> dict[str, Any]:
            return ask_question(q, branch=body.branch, top_k=body.top_k, mode=body.mode)

        data = await run_in_threadpool(_ask)
        mode_val = "rag" if str(data.get("mode")) == "rag" else "general"
        ans = str(data.get("answer") or "")
        srcs = data.get("sources") or []
        record(
            "standard_chat_completed",
            {
                "chat_id": chat_id,
                "pipeline": "standard_sync",
                "mode": mode_val,
                "branch": str(data.get("branch") or body.branch),
                "answer_length": len(ans),
                "sources_count": len(srcs) if isinstance(srcs, list) else 0,
                "route_reason": data.get("route_reason"),
                "route_confidence": data.get("route_confidence"),
                **_audit_actor_chat(body),
            },
        )
        _emit_standard_chat_ledger_entry(
            chat_id=chat_id,
            question=q,
            answer=ans,
            sources=srcs if isinstance(srcs, list) else [],
            branch=str(data.get("branch") or body.branch),
            mode=mode_val,
            pipeline="standard_sync",
            body=body,
            route_reason=data.get("route_reason"),
            route_confidence=data.get("route_confidence"),
        )
        return ChatResponse(
            mode=mode_val,
            branch=str(data.get("branch") or body.branch),
            answer=ans,
            sources=srcs if isinstance(srcs, list) else [],
            route_reason=str(data.get("route_reason")) if data.get("route_reason") is not None else None,
            route_confidence=float(data.get("route_confidence")) if data.get("route_confidence") is not None else None,
            chat_id=chat_id,
        )
    except ValueError as e:
        record(
            "standard_chat_failed",
            {"chat_id": chat_id, "pipeline": "standard_sync", "error": str(e), **_audit_actor_chat(body)},
        )
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        record(
            "standard_chat_failed",
            {"chat_id": chat_id, "pipeline": "standard_sync", "error": str(e), **_audit_actor_chat(body)},
        )
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/chat/stream")
async def chat_stream(body: ChatRequest):
    """NDJSON 스트림 — 한 줄에 JSON 하나: meta → delta* → done. Ollama stream: true."""
    chat_id = str(uuid.uuid4())
    q = body.question.strip()
    record(
        "standard_chat_received",
        {
            "chat_id": chat_id,
            "pipeline": "standard_stream",
            "branch": body.branch.strip() or "navy",
            "mode": body.mode,
            "top_k": body.top_k,
            "question_preview": _audit_question_preview(q),
            "question_length": len(q),
            **_audit_actor_chat(body),
        },
    )

    def ndjson_bytes():
        meta: dict[str, Any] = {}
        delta_chars = 0
        answer_accumulated = ""
        err_detail: str | None = None
        try:
            for line in iter_chat_stream_ndjson(
                q,
                body.branch.strip() or "navy",
                body.top_k,
                body.mode,
            ):
                yield line.encode("utf-8")
                try:
                    obj = json.loads(line.strip())
                    t = obj.get("type")
                    if t == "meta" and isinstance(obj, dict):
                        meta = obj
                    elif t == "delta":
                        chunk = str(obj.get("text") or "")
                        delta_chars += len(chunk)
                        answer_accumulated += chunk
                    elif t == "error":
                        err_detail = str(obj.get("detail") or "")
                except (json.JSONDecodeError, TypeError):
                    pass
        except ValueError as e:
            err_detail = str(e)
            yield (json.dumps({"type": "error", "detail": str(e)}, ensure_ascii=False) + "\n").encode("utf-8")
        finally:
            sources = meta.get("sources") if isinstance(meta.get("sources"), list) else []
            record(
                "standard_chat_completed",
                {
                    "chat_id": chat_id,
                    "pipeline": "standard_stream",
                    "mode": meta.get("mode"),
                    "branch": meta.get("branch"),
                    "sources_count": len(sources),
                    "answer_chars_streamed": delta_chars,
                    "route_reason": meta.get("route_reason"),
                    "route_confidence": meta.get("route_confidence"),
                    "error": err_detail,
                    **_audit_actor_chat(body),
                },
            )
            br = str(meta.get("branch") or body.branch.strip() or "navy")
            md = meta.get("mode")
            mode_out: str | None = str(md) if md is not None else None
            _emit_standard_chat_ledger_entry(
                chat_id=chat_id,
                question=q,
                answer=answer_accumulated,
                sources=sources,
                branch=br,
                mode=mode_out,
                pipeline="standard_stream",
                body=body,
                route_reason=meta.get("route_reason"),
                route_confidence=meta.get("route_confidence"),
                stream_error=err_detail,
            )

    return StreamingResponse(
        ndjson_bytes(),
        media_type="application/x-ndjson; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Chat-Id": chat_id,
        },
    )


@app.delete("/reset")
async def reset() -> dict[str, Any]:
    try:
        return await run_in_threadpool(full_reset_and_reingest)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# === A2A Endpoints ===

@app.get("/a2a/agents")
async def list_agent_cards():
    """모든 Agent Card 반환 — A2A 표준 discovery."""
    cards_path = Path(__file__).parent / "a2a" / "agent_cards.json"
    with open(cards_path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/a2a/agents/{agent_id}")
async def get_agent_card(agent_id: str):
    """특정 Agent Card 반환."""
    cards_path = Path(__file__).parent / "a2a" / "agent_cards.json"
    with open(cards_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for agent in data["agents"]:
        if agent["id"] == agent_id:
            return agent

    raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")


class A2ATaskRequest(BaseModel):
    question: str
    top_k: int = 10
    task_id: str | None = None
    user_id: str | None = None
    military_number: str | None = None


@app.post("/a2a/task")
async def execute_a2a_task(req: A2ATaskRequest):
    """A2A Task 실행 — Supervisor 패턴으로 3군 에이전트 협업."""
    task_id = req.task_id or str(uuid.uuid4())
    uid = req.user_id.strip() if req.user_id else ""
    mid = req.military_number.strip() if req.military_number else ""
    return run_a2a_task(
        question=req.question,
        task_id=task_id,
        top_k=req.top_k,
        user_id=uid or None,
        military_number=mid or None,
    )


@app.get("/a2a/audit")
async def get_audit_log(limit: int = 50):
    """최근 감사 로그 반환."""
    return {"entries": read_recent(limit=limit)}


@app.get("/a2a/cache")
async def list_cache():
    """현재 캐시된 시연 답변 목록."""
    from a2a.cache import list_cached, cache_enabled
    return {
        "enabled": cache_enabled(),
        "entries": list_cached(),
    }


@app.delete("/a2a/cache")
async def clear_cache():
    """캐시 전체 삭제."""
    from a2a.cache import CACHE_PATH
    if CACHE_PATH.exists():
        CACHE_PATH.unlink()
    return {"status": "cleared"}


@app.get("/a2a/ledger/settings")
def a2a_ledger_settings() -> dict[str, Any]:
    from blockchain import config as bc

    return {
        "enabled": bc.BLOCKCHAIN_ENABLED,
        "ledger_path": str(bc.LOCAL_LEDGER_PATH),
        "hash_algorithm": bc.HASH_ALGORITHM,
    }


@app.get("/a2a/ledger/verify")
def a2a_ledger_verify() -> dict[str, Any]:
    from blockchain.verifier import verify_chain

    return verify_chain()


@app.get("/a2a/ledger/recent")
def a2a_ledger_recent(limit: int = 25) -> dict[str, Any]:
    from blockchain.local_ledger import get_latest_events

    lim = max(1, min(limit, 100))
    return {"events": get_latest_events(lim)}


@app.get("/a2a/ledger/task/{task_id}")
def a2a_ledger_task_verify(task_id: str) -> dict[str, Any]:
    """원장 단건 검증 — 경로 이름은 task_id 이지만 A2A task_id와 표준 채팅 chat_id 모두 허용."""
    from blockchain.verifier import verify_task

    return verify_task(task_id)
