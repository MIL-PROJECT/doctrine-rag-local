"""LLM provider factory 및 군별 모델 매핑."""

from __future__ import annotations

import os

from app.core import config
from app.llm.base import BaseLLMClient
from app.llm.ollama_client import OllamaClient
from app.llm.vllm_client import VLLMClient

_BRANCH_MODEL_ENV: dict[str, str] = {
    "army": "ARMY_MODEL",
    "navy": "NAVY_MODEL",
    "air_force": "AIR_MODEL",
    "air": "AIR_MODEL",
}

_BRANCH_MODEL_DEFAULT: dict[str, str] = {
    "army": "army",
    "navy": "navy",
    "air_force": "air",
    "air": "air",
}


def get_model_for_branch(branch: str) -> str:
    """군별 vLLM LoRA 모델 이름 (OpenAI model 필드)."""
    key = branch.strip()
    if key not in _BRANCH_MODEL_ENV:
        raise ValueError(f"Unsupported branch: {branch}")
    env_name = _BRANCH_MODEL_ENV[key]
    return os.getenv(env_name, _BRANCH_MODEL_DEFAULT[key])


def resolve_chat_model(branch: str | None) -> str:
    """provider·branch에 따른 실제 model 이름."""
    if config.LLM_PROVIDER == "ollama":
        return config.OLLAMA_MODEL
    b = (branch or "").strip()
    if b in _BRANCH_MODEL_ENV:
        return get_model_for_branch(b)
    if b in ("", "common"):
        return config.VLLM_DEFAULT_MODEL
    raise ValueError(f"Unsupported branch for vLLM: {branch}")


def get_llm_client() -> BaseLLMClient:
    if config.LLM_PROVIDER == "vllm":
        return VLLMClient()
    return OllamaClient()
