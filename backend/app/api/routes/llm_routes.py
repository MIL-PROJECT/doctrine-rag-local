from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.api.schemas import LLMTestRequest
from app.core import config
from app.llm import llm_health_status
from app.llm.factory import get_llm_client, resolve_chat_model
from app.llm.prompts import build_system_prompt, wrap_user_message

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/health")
async def llm_health() -> dict[str, Any]:
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


@router.post("/test")
async def llm_test(body: LLMTestRequest) -> dict[str, Any]:
    branch = body.branch.strip()
    if branch not in (*config.SERVICE_BRANCHES, "air"):
        raise HTTPException(status_code=400, detail=f"Unsupported branch: {branch}")
    try:
        model = resolve_chat_model(branch)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

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
