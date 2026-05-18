"""공통 LLM client 인터페이스."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseLLMClient(ABC):
    """OpenAI chat messages 형식을 사용하는 비동기 LLM 클라이언트."""

    provider: str

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> str:
        """단일 완성 응답 텍스트를 반환."""

    async def health_status(self) -> dict[str, Any]:
        """GET /llm/health 용 — 하위 클래스에서 오버라이드 가능."""
        return {"reachable": False, "provider": self.provider}
