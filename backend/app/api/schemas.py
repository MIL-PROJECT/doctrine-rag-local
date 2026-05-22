from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core import config


class ChatRequest(BaseModel):
    branch: str = Field(default="navy")
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=config.TOP_K_MAX)
    mode: Literal["auto", "rag", "general"] = Field(default="auto")
    user_id: str | None = Field(default=None)
    military_number: str | None = Field(default=None)


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


class LLMTestRequest(BaseModel):
    branch: str = Field(default="army")
    message: str = Field(..., min_length=1)


class A2ATaskRequest(BaseModel):
    question: str
    top_k: int = 10
    task_id: str | None = None
    user_id: str | None = None
    military_number: str | None = None
