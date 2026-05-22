from __future__ import annotations

from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from app.rag.service import full_reset_and_reingest

router = APIRouter(tags=["admin"])


@router.delete("/reset")
async def reset() -> dict:
    try:
        return await run_in_threadpool(full_reset_and_reingest)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
