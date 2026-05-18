"""vLLM OpenAI-compatible API client."""

from __future__ import annotations

import logging
from typing import Any

import httpx

import config
from llm._utils import looks_like_html, ngrok_request_headers, parse_openai_chat_content
from llm.base import BaseLLMClient
from llm.output_guard import pack_chat_result

logger = logging.getLogger(__name__)


class VLLMClient(BaseLLMClient):
    provider = "vllm"

    def __init__(self) -> None:
        base = config.VLLM_BASE_URL
        if not base:
            raise RuntimeError(
                "VLLM_BASE_URL is not set (expected e.g. https://xxxx.ngrok-free.app/v1)"
            )
        self._base_url = base.rstrip("/")
        self._api_key = config.VLLM_API_KEY or "EMPTY"

    def _headers(self) -> dict[str, str]:
        h = ngrok_request_headers()
        h["Authorization"] = f"Bearer {self._api_key}"
        return h

    def _timeout(self) -> httpx.Timeout:
        t = config.VLLM_TIMEOUT_SECONDS
        return httpx.Timeout(connect=15.0, read=t, write=30.0, pool=5.0)

    def _chat_url(self) -> str:
        return f"{self._base_url}/chat/completions"

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 900,
        postprocess: bool = True,
    ) -> dict[str, Any]:
        if not model:
            raise ValueError("vLLM chat requires an explicit model (branch mapping).")
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "frequency_penalty": 0.8,
            "presence_penalty": 0.2,
            "stream": False,
            "extra_body": {
                "chat_template_kwargs": {"enable_thinking": False},
            },
        }
        url = self._chat_url()
        try:
            async with httpx.AsyncClient(timeout=self._timeout(), headers=self._headers()) as client:
                r = await client.post(url, json=payload)
        except httpx.TimeoutException as e:
            raise RuntimeError(f"vLLM chat timeout ({url})") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"vLLM chat request failed ({url}): {e}") from e

        body = r.text or ""
        if r.status_code >= 400:
            raise RuntimeError(f"vLLM chat HTTP {r.status_code}: {body[:800]}")
        if looks_like_html(body):
            raise RuntimeError("vLLM chat returned HTML (ngrok interstitial or error page?)")

        try:
            data = r.json()
        except ValueError as e:
            raise RuntimeError(f"vLLM chat response is not JSON: {body[:300]}") from e
        if not isinstance(data, dict):
            raise RuntimeError(f"vLLM chat unexpected JSON shape: {body[:300]}")

        raw = parse_openai_chat_content(data)
        return pack_chat_result(raw, model=model, provider=self.provider, postprocess=postprocess)

    async def health_status(self) -> dict[str, Any]:
        url = f"{self._base_url}/models"
        out: dict[str, Any] = {
            "reachable": False,
            "provider": self.provider,
            "base_url": self._base_url,
        }
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(config.OLLAMA_HEALTHCHECK_TIMEOUT),
                headers=self._headers(),
            ) as client:
                r = await client.get(url)
        except (httpx.TimeoutException, httpx.RequestError) as e:
            out["error"] = str(e)[:200]
            return out
        if r.status_code == 200 and not looks_like_html(r.text or ""):
            out["reachable"] = True
        else:
            out["error"] = f"HTTP {r.status_code}: {(r.text or '')[:200]}"
        return out
