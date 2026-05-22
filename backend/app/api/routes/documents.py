from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from app.api.schemas import RetrieveRequest
from app.rag.service import list_indexed_documents, retrieve_passages

router = APIRouter(tags=["documents"])


@router.post("/retrieve")
async def retrieve(body: RetrieveRequest) -> dict[str, Any]:
    try:

        def _run() -> dict[str, Any]:
            return retrieve_passages(body.question.strip(), branch=body.branch, top_k=body.top_k)

        return await run_in_threadpool(_run)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/source-documents")
async def source_documents(branch: str = "navy") -> dict[str, Any]:
    try:
        return await run_in_threadpool(lambda: list_indexed_documents(branch.strip() or "navy"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
