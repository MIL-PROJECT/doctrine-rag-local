import logging
import asyncio
from contextlib import asynccontextmanager
from typing import Any
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

import config
from llm import ollama_health_status
from rag_service import ask_question, full_reset_and_reingest, list_indexed_documents, retrieve_passages, run_startup_ingest
import vector_store

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


class ChatResponse(BaseModel):
    mode: Literal["rag", "general"]
    branch: str
    answer: str
    sources: list[dict[str, Any]]
    route_reason: str | None = None
    route_confidence: float | None = None


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

    return {
        "api": "ok",
        "status": "ok",
        "service": "doctrine-rag-ollama",
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
    try:

        def _ask() -> dict[str, Any]:
            return ask_question(body.question.strip(), branch=body.branch, top_k=body.top_k, mode=body.mode)

        data = await run_in_threadpool(_ask)
        mode_val = "rag" if str(data.get("mode")) == "rag" else "general"
        return ChatResponse(
            mode=mode_val,
            branch=str(data.get("branch") or body.branch),
            answer=str(data.get("answer") or ""),
            sources=data.get("sources") or [],
            route_reason=str(data.get("route_reason")) if data.get("route_reason") is not None else None,
            route_confidence=float(data.get("route_confidence")) if data.get("route_confidence") is not None else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.delete("/reset")
async def reset() -> dict[str, Any]:
    try:
        return await run_in_threadpool(full_reset_and_reingest)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
