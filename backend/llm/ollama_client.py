"""Ollama /api/chat client — 기존 동작 보존."""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

import httpx

import config
from llm._utils import looks_like_html, ngrok_request_headers, parse_ollama_chat_content
from llm.base import BaseLLMClient
from llm.output_guard import pack_chat_result

logger = logging.getLogger(__name__)

OLLAMA_HEALTH_ERROR = "Remote Ollama server unavailable"
MODEL_NOT_FOUND_HINT = (
    "The requested Ollama model is not available on the remote server. "
    "Run `ollama pull` in Colab for this model."
)


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
    if looks_like_html(text):
        return None, "response was HTML (ngrok warning or error page?)"
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None, "invalid JSON"
    if not isinstance(data, dict):
        return None, "unexpected JSON shape"
    return _extract_model_names(data), None


class OllamaClient(BaseLLMClient):
    provider = "ollama"

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 900,
        postprocess: bool = True,
    ) -> dict[str, Any]:
        resolved_model = model or config.OLLAMA_MODEL
        url = f"{config.OLLAMA_BASE_URL}/api/chat"
        payload: dict[str, Any] = {
            "model": resolved_model,
            "stream": False,
            "messages": messages,
            "options": {
                "temperature": temperature,
                "top_p": 0.9,
                "num_predict": max_tokens,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=_chat_timeout(), headers=ngrok_request_headers()) as client:
                r = await client.post(url, json=payload)
        except httpx.TimeoutException as e:
            raise RuntimeError(f"Ollama chat timeout ({url})") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"Ollama chat request failed ({url}): {e}") from e

        body = r.text or ""
        if r.status_code >= 400:
            raise RuntimeError(f"Ollama chat HTTP {r.status_code}: {body[:800]}")
        if looks_like_html(body):
            raise RuntimeError("Ollama chat returned HTML (ngrok interstitial?)")

        try:
            data = r.json()
        except ValueError as e:
            raise RuntimeError(f"Ollama chat response is not JSON: {body[:300]}") from e
        if not isinstance(data, dict):
            raise RuntimeError("Ollama chat unexpected JSON shape")

        err = data.get("error")
        if err:
            msg = err if isinstance(err, str) else str(err)
            lower = msg.lower()
            if "not found" in lower or "unknown model" in lower or "pull" in lower:
                raise RuntimeError(MODEL_NOT_FOUND_HINT)
            raise RuntimeError(f"Ollama API error: {msg[:500]}")

        raw = parse_ollama_chat_content(data)
        return pack_chat_result(
            raw, model=resolved_model, provider=self.provider, postprocess=postprocess
        )

    async def health_status(self) -> dict[str, Any]:
        return await ollama_health_status_async()


async def ollama_health_status_async() -> dict[str, Any]:
    base = config.OLLAMA_BASE_URL
    model = config.OLLAMA_MODEL
    url = f"{base}/api/tags"
    out: dict[str, Any] = {
        "reachable": False,
        "provider": "ollama",
        "base_url": base,
        "model": model,
    }
    try:
        async with httpx.AsyncClient(
            timeout=config.OLLAMA_HEALTHCHECK_TIMEOUT,
            headers=ngrok_request_headers(),
        ) as client:
            r = await client.get(url)
    except httpx.TimeoutException:
        out["error"] = OLLAMA_HEALTH_ERROR
        return out
    except httpx.RequestError:
        out["error"] = OLLAMA_HEALTH_ERROR
        return out

    body = r.text or ""
    if r.status_code != 200:
        out["error"] = OLLAMA_HEALTH_ERROR
        return out

    names, err = _parse_ollama_tags_json(body)
    if err:
        out["error"] = OLLAMA_HEALTH_ERROR
        return out

    out["reachable"] = True
    out["models"] = names
    return out


def ollama_health_status() -> dict[str, Any]:
    """GET /health 호환 — 동기 래퍼."""
    from llm._utils import run_async

    return run_async(ollama_health_status_async())


def ollama_healthcheck() -> bool:
    return bool(ollama_health_status()["reachable"])


_STREAM_UNAVAILABLE = "Remote LLM server is unavailable. Please check Colab and ngrok URL."


def iter_ollama_chat_stream(url: str, payload: dict[str, Any]) -> Iterator[tuple[str, str | None]]:
    """Ollama /api/chat NDJSON 스트림 — (kind, chunk) 제너레이터."""
    body = {**payload, "stream": True}
    headers = ngrok_request_headers()
    cumulative = ""
    try:
        with httpx.Client(timeout=_chat_timeout(), headers=headers) as client:
            with client.stream("POST", url, json=body) as r:
                if r.status_code >= 400:
                    err_body = (r.read() or b"").decode("utf-8", errors="replace")[:800]
                    logger.error("Ollama stream: HTTP %s — %s", r.status_code, err_body)
                    yield ("error", _STREAM_UNAVAILABLE)
                    return
                for raw in r.iter_lines():
                    if not raw or not str(raw).strip():
                        continue
                    line = str(raw)
                    if looks_like_html(line):
                        yield ("error", _STREAM_UNAVAILABLE)
                        return
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(data, dict):
                        continue
                    err = data.get("error")
                    if err:
                        msg = err if isinstance(err, str) else str(err)
                        lower = msg.lower()
                        hint = (
                            MODEL_NOT_FOUND_HINT
                            if "not found" in lower or "unknown model" in lower or "pull" in lower
                            else _STREAM_UNAVAILABLE
                        )
                        yield ("error", hint)
                        return
                    if data.get("done"):
                        break
                    msg = data.get("message") or {}
                    if not isinstance(msg, dict):
                        continue
                    piece = msg.get("content")
                    if piece is None or piece == "":
                        continue
                    text = str(piece)
                    if text.startswith(cumulative):
                        delta = text[len(cumulative) :]
                        cumulative = text
                    else:
                        delta = text
                        cumulative = cumulative + delta
                    if delta:
                        yield ("delta", delta)
    except httpx.TimeoutException:
        logger.exception("Ollama stream: timeout")
        yield ("error", _STREAM_UNAVAILABLE)
        return
    except httpx.RequestError:
        logger.exception("Ollama stream: connection failed (%s)", url)
        yield ("error", _STREAM_UNAVAILABLE)
        return
    yield ("done", None)
