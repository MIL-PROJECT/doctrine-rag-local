"""FastAPI application entry — uvicorn app.main:app"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app import state
from app.api.routes import api_router
from app.core import config
from app.rag import vector_store
from app.rag.service import run_startup_ingest

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Startup: running CSV chunk ingest if needed (dir=%s)...", config.CHUNKS_PATH_DISPLAY)
    state.INGEST_IN_PROGRESS = True

    async def _do_ingest() -> None:
        try:
            await run_in_threadpool(run_startup_ingest)
            counts = {b: vector_store.collection_count(config.COLLECTION_MAP[b]) for b in config.SERVICE_BRANCHES}
            logger.info("Startup: ingest step finished. Chroma counts=%s", counts)
        finally:
            state.INGEST_IN_PROGRESS = False

    asyncio.create_task(_do_ingest())
    yield
    logger.info("Shutdown complete.")


def create_app() -> FastAPI:
    application = FastAPI(title="DoctrineRAG Ollama API", version="1.0.0", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(api_router)
    return application


app = create_app()
