from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.api.schemas import A2ATaskRequest
from app.a2a.audit import read_recent
from app.a2a.supervisor import run_a2a_task
from app.core.config import BACKEND_ROOT

router = APIRouter(prefix="/a2a", tags=["a2a"])

_AGENT_CARDS_PATH = BACKEND_ROOT / "app" / "a2a" / "agent_cards.json"


@router.get("/agents")
async def list_agent_cards():
    with open(_AGENT_CARDS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/agents/{agent_id}")
async def get_agent_card(agent_id: str):
    with open(_AGENT_CARDS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    for agent in data["agents"]:
        if agent["id"] == agent_id:
            return agent

    raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")


@router.post("/task")
async def execute_a2a_task(req: A2ATaskRequest):
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


@router.get("/audit")
async def get_audit_log(limit: int = 50):
    return {"entries": read_recent(limit=limit)}


@router.get("/cache")
async def list_cache():
    from app.a2a.cache import cache_enabled, list_cached

    return {
        "enabled": cache_enabled(),
        "entries": list_cached(),
    }


@router.delete("/cache")
async def clear_cache():
    from app.a2a.cache import CACHE_PATH

    if CACHE_PATH.exists():
        CACHE_PATH.unlink()
    return {"status": "cleared"}


@router.get("/ledger/settings")
def a2a_ledger_settings() -> dict[str, Any]:
    from app.blockchain import config as bc

    return {
        "enabled": bc.BLOCKCHAIN_ENABLED,
        "ledger_path": str(bc.LOCAL_LEDGER_PATH),
        "hash_algorithm": bc.HASH_ALGORITHM,
    }


@router.get("/ledger/verify")
def a2a_ledger_verify() -> dict[str, Any]:
    from app.blockchain.verifier import verify_chain

    return verify_chain()


@router.get("/ledger/recent")
def a2a_ledger_recent(limit: int = 25) -> dict[str, Any]:
    from app.blockchain.local_ledger import get_latest_events

    lim = max(1, min(limit, 100))
    return {"events": get_latest_events(lim)}


@router.get("/ledger/task/{task_id}")
def a2a_ledger_task_verify(task_id: str) -> dict[str, Any]:
    from app.blockchain.verifier import verify_task

    return verify_task(task_id)
