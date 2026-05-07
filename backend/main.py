import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

import config
from llm import ollama_health_status
from rag_service import ask_question, full_reset_and_reingest, run_startup_ingest
import vector_store

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Startup: running CSV chunk ingest if needed (dir=%s)...", config.CHUNKS_PATH_DISPLAY)
    await run_in_threadpool(run_startup_ingest)
    logger.info("Startup: ingest step finished. Chroma count=%s", vector_store.collection_count())
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
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=config.TOP_K_MAX)


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict[str, Any]]


@app.get("/health")
def health() -> dict[str, Any]:
    vdb = vector_store.collection_stats()
    doc_count = int(vdb.get("documents", 0))
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
            "documents": doc_count,
            "collection": vdb.get("collection"),
            "path": vdb.get("path"),
        },
        "chroma_documents": doc_count,
        "ollama_reachable": reachable,
        "ollama_model": ollama["model"],
        "ingest_flag": config.INGEST_FLAG_PATH.exists(),
        "chunks_data_dir": config.CHUNKS_PATH_DISPLAY,
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse:
    try:

        def _ask() -> dict[str, Any]:
            return ask_question(body.question.strip(), top_k=body.top_k)

        data = await run_in_threadpool(_ask)
        return ChatResponse(answer=data["answer"], sources=data.get("sources") or [])
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
