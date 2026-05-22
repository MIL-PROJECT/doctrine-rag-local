"""LLM provider abstraction (Ollama / vLLM OpenAI-compatible)."""

from app.llm.bridge import (
    USER_FACING_UNAVAILABLE,
    USER_FACING_LLM_UNAVAILABLE,
    generate_answer,
    generate_branch_answer,
    generate_general_answer,
    generate_rag_answer,
    generate_synthesis_answer,
    iter_stream_general_answer,
    iter_stream_rag_answer,
    llm_health_status,
)
from app.llm.output_guard import postprocess_answer, validate_answer
from app.llm.prompts import build_rag_user_prompt, build_system_prompt
from app.llm.factory import get_llm_client, get_model_for_branch, resolve_chat_model
from app.llm.ollama_client import ollama_health_status, ollama_healthcheck
from app.llm.prompts import BASE_SYSTEM_PROMPT, load_branch_prompt

__all__ = [
    "USER_FACING_UNAVAILABLE",
    "USER_FACING_LLM_UNAVAILABLE",
    "BASE_SYSTEM_PROMPT",
    "generate_answer",
    "generate_branch_answer",
    "generate_general_answer",
    "generate_rag_answer",
    "generate_synthesis_answer",
    "get_llm_client",
    "get_model_for_branch",
    "iter_stream_general_answer",
    "iter_stream_rag_answer",
    "llm_health_status",
    "load_branch_prompt",
    "ollama_health_status",
    "ollama_healthcheck",
    "resolve_chat_model",
    "build_system_prompt",
    "build_rag_user_prompt",
    "postprocess_answer",
    "validate_answer",
]
