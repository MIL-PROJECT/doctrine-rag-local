"""Remote Ollama — POST {OLLAMA_BASE_URL}/api/chat, GET {OLLAMA_BASE_URL}/api/tags."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

import config

logger = logging.getLogger(__name__)

# 프론트/사용자에게 노출하는 메시지 (스택 트레이스 금지)
USER_FACING_UNAVAILABLE = (
    "Remote Ollama server is unavailable. Please check Colab and ngrok URL."
)
OLLAMA_HEALTH_ERROR = "Remote Ollama server unavailable"
MODEL_NOT_FOUND_HINT = (
    "The requested Ollama model is not available on the remote server. "
    "Run `ollama pull` in Colab for this model."
)

SYSTEM_PROMPT = """
You are a helpful assistant that answers strictly from the provided document evidence (RAG).
Rules:
1. Use only the information in the evidence blocks. If the evidence is insufficient, say so clearly in Korean.
2. Do not invent facts not present in the evidence.
3. Answer in Korean with sections: 요약, 근거 (cite evidence numbers), 한계.
4. Keep a calm, educational tone suitable for training materials.
""".strip()


def ollama_request_headers() -> dict[str, str]:
    """ngrok 무료 터널은 이 헤더 없이 HTML 경고 페이지를 줄 수 있음 — 모든 Ollama 요청에 적용."""
    return {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
    }


def _looks_like_html(body: str) -> bool:
    s = body.lstrip()[:500].lower()
    return s.startswith("<!doctype html") or s.startswith("<html") or "<head>" in s[:200]


def _chat_timeout() -> httpx.Timeout:
    return httpx.Timeout(
        connect=15.0,
        read=config.OLLAMA_TIMEOUT_SECONDS,
        write=30.0,
        pool=5.0,
    )


def _extract_model_names(data: dict[str, Any]) -> list[str]:
    raw = data.get("models")
    if not isinstance(raw, list):
        return []
    names: list[str] = []
    for item in raw:
        if isinstance(item, dict) and item.get("name"):
            names.append(str(item["name"]))
    return names


def _parse_ollama_tags_json(text: str) -> tuple[list[str] | None, str | None]:
    """
    /api/tags 본문 파싱. 실패 시 (None, reason).
    """
    if _looks_like_html(text):
        return None, "response was HTML (ngrok warning or error page?)"
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None, "invalid JSON"
    if not isinstance(data, dict):
        return None, "unexpected JSON shape"
    return _extract_model_names(data), None


def ollama_health_status() -> dict[str, Any]:
    """
    GET {OLLAMA_BASE_URL}/api/tags — 모델 목록·도달 가능 여부.
    """
    base = config.OLLAMA_BASE_URL
    model = config.OLLAMA_MODEL
    url = f"{base}/api/tags"
    headers = ollama_request_headers()
    out: dict[str, Any] = {
        "reachable": False,
        "base_url": base,
        "model": model,
    }

    try:
        with httpx.Client(timeout=config.OLLAMA_HEALTHCHECK_TIMEOUT, headers=headers) as client:
            r = client.get(url)
    except httpx.TimeoutException:
        logger.warning("Ollama health: timeout %s", url)
        out["error"] = OLLAMA_HEALTH_ERROR
        return out
    except httpx.RequestError as e:
        logger.warning("Ollama health: request error: %s", e)
        out["error"] = OLLAMA_HEALTH_ERROR
        return out

    body = r.text or ""
    if r.status_code == 403:
        logger.warning("Ollama health: HTTP 403")
        out["error"] = OLLAMA_HEALTH_ERROR
        return out
    if r.status_code == 404:
        logger.warning("Ollama health: HTTP 404")
        out["error"] = OLLAMA_HEALTH_ERROR
        return out
    if r.status_code >= 500:
        logger.warning("Ollama health: HTTP %s", r.status_code)
        out["error"] = OLLAMA_HEALTH_ERROR
        return out
    if r.status_code != 200:
        logger.warning("Ollama health: HTTP %s — %s", r.status_code, body[:300])
        out["error"] = OLLAMA_HEALTH_ERROR
        return out

    names, err = _parse_ollama_tags_json(body)
    if err:
        logger.warning("Ollama health: %s", err)
        out["error"] = OLLAMA_HEALTH_ERROR
        return out

    out["reachable"] = True
    out["models"] = names
    return out


def ollama_healthcheck() -> bool:
    return bool(ollama_health_status()["reachable"])


def generate_answer(question: str, context: str) -> str:
    url = f"{config.OLLAMA_BASE_URL}/api/chat"
    user_content = f"""[Question]
{question}

[Evidence from documents]
{context}

Answer in Korean using only the evidence above.""".strip()

    payload: dict[str, Any] = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "options": {
            "temperature": 0.2,
            "top_p": 0.9,
            "num_predict": config.OLLAMA_MAX_TOKENS,
        },
    }

    headers = ollama_request_headers()

    try:
        with httpx.Client(timeout=_chat_timeout(), headers=headers) as client:
            r = client.post(url, json=payload)
    except httpx.TimeoutException:
        logger.exception("Ollama chat: timeout")
        return USER_FACING_UNAVAILABLE
    except httpx.RequestError:
        logger.exception("Ollama chat: connection failed (%s)", url)
        return USER_FACING_UNAVAILABLE

    body = r.text or ""

    if r.status_code >= 400:
        logger.error("Ollama chat: HTTP %s — %s", r.status_code, body[:500])
        return USER_FACING_UNAVAILABLE

    if _looks_like_html(body):
        logger.error("Ollama chat: HTML response (likely ngrok interstitial)")
        return USER_FACING_UNAVAILABLE

    try:
        data = r.json()
    except ValueError:
        logger.error("Ollama chat: response is not JSON")
        return USER_FACING_UNAVAILABLE

    if not isinstance(data, dict):
        return USER_FACING_UNAVAILABLE

    err = data.get("error")
    if err:
        msg = err if isinstance(err, str) else str(err)
        logger.warning("Ollama chat: API error: %s", msg[:500])
        lower = msg.lower()
        if "not found" in lower or "unknown model" in lower or "pull" in lower:
            return MODEL_NOT_FOUND_HINT
        return USER_FACING_UNAVAILABLE

    message = data.get("message") or {}
    if not isinstance(message, dict):
        return USER_FACING_UNAVAILABLE

    content = message.get("content")
    if content is None:
        return USER_FACING_UNAVAILABLE

    return str(content).strip()
