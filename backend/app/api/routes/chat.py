from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.api.deps import audit_actor_chat, audit_question_preview, emit_standard_chat_ledger_entry
from app.api.schemas import ChatRequest, ChatResponse
from app.a2a.audit import record
from app.rag.service import ask_question, iter_chat_stream_ndjson

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
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
            "question_preview": audit_question_preview(q),
            "question_length": len(q),
            **audit_actor_chat(body),
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
                **audit_actor_chat(body),
            },
        )
        emit_standard_chat_ledger_entry(
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
            {"chat_id": chat_id, "pipeline": "standard_sync", "error": str(e), **audit_actor_chat(body)},
        )
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        record(
            "standard_chat_failed",
            {"chat_id": chat_id, "pipeline": "standard_sync", "error": str(e), **audit_actor_chat(body)},
        )
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/chat/stream")
async def chat_stream(body: ChatRequest):
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
            "question_preview": audit_question_preview(q),
            "question_length": len(q),
            **audit_actor_chat(body),
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
                    **audit_actor_chat(body),
                },
            )
            br = str(meta.get("branch") or body.branch.strip() or "navy")
            md = meta.get("mode")
            mode_out: str | None = str(md) if md is not None else None
            emit_standard_chat_ledger_entry(
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
