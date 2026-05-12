"""Remote Ollama — POST {OLLAMA_BASE_URL}/api/chat, GET {OLLAMA_BASE_URL}/api/tags."""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

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

BASE_SYSTEM_PROMPT = """
Use only retrieved doctrine evidence (RAG).
If evidence is insufficient, say the selected doctrine dataset does not contain sufficient information.
Do not hallucinate or invent facts.
Answer in Korean with sections: 요약, 근거 (각 인용은 [번호]와 해당 Evidence 블록의 표기용 제목을 함께 적을 것).
Do not add a '한계' section header. If evidence is insufficient, briefly state that the dataset lacks enough information and then provide helpful next steps.
Keep a calm, educational tone suitable for training materials.
""".strip()

GENERAL_CHAT_SYSTEM_PROMPT = """
You are a helpful Korean assistant for a military doctrine chatbot.
If the user greets or asks casual/meta questions, respond naturally and briefly in Korean.
Do not fabricate sensitive operational facts.
If the user asks doctrine-specific content, suggest asking a concrete doctrine question with branch context.
""".strip()


def load_branch_prompt(branch: str) -> str:
    """backend/rag/prompts/{branch}.txt 내용을 읽어 base prompt와 결합."""
    if branch not in config.SERVICE_BRANCHES:
        raise ValueError(f"Invalid branch: {branch}")
    path = config.PROMPTS_DIR / f"{branch}.txt"
    try:
        text = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        text = ""
    if text:
        return f"{text}\n\n{BASE_SYSTEM_PROMPT}".strip()
    return BASE_SYSTEM_PROMPT


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


def generate_rag_answer(question: str, context: str, system_prompt: str | None = None) -> str:
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
            {"role": "system", "content": (system_prompt or BASE_SYSTEM_PROMPT)},
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


def iter_ollama_chat_stream(url: str, payload: dict[str, Any]) -> Iterator[tuple[str, str | None]]:
    """
    Ollama /api/chat NDJSON 스트림.
    (\"delta\", 텍스트 조각), (\"error\", 메시지), 마지막에 (\"done\", None) 를 순서대로보냄.
    """
    body = {**payload, "stream": True}
    headers = ollama_request_headers()
    cumulative = ""
    try:
        with httpx.Client(timeout=_chat_timeout(), headers=headers) as client:
            with client.stream("POST", url, json=body) as r:
                if r.status_code >= 400:
                    err_body = (r.read() or b"").decode("utf-8", errors="replace")[:800]
                    logger.error("Ollama stream: HTTP %s — %s", r.status_code, err_body)
                    yield ("error", USER_FACING_UNAVAILABLE)
                    return
                for raw in r.iter_lines():
                    if not raw or not str(raw).strip():
                        continue
                    line = str(raw)
                    if _looks_like_html(line):
                        yield ("error", USER_FACING_UNAVAILABLE)
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
                            else USER_FACING_UNAVAILABLE
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
        yield ("error", USER_FACING_UNAVAILABLE)
        return
    except httpx.RequestError:
        logger.exception("Ollama stream: connection failed (%s)", url)
        yield ("error", USER_FACING_UNAVAILABLE)
        return
    yield ("done", None)


def iter_stream_rag_answer(question: str, context: str, system_prompt: str | None = None) -> Iterator[tuple[str, str | None]]:
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
            {"role": "system", "content": (system_prompt or BASE_SYSTEM_PROMPT)},
            {"role": "user", "content": user_content},
        ],
        "options": {
            "temperature": 0.2,
            "top_p": 0.9,
            "num_predict": config.OLLAMA_MAX_TOKENS,
        },
    }
    yield from iter_ollama_chat_stream(url, payload)


def iter_stream_general_answer(question: str, branch: str | None = None) -> Iterator[tuple[str, str | None]]:
    url = f"{config.OLLAMA_BASE_URL}/api/chat"
    branch_hint = f"(selected_branch={branch})" if branch else ""
    user_content = (
        f"{branch_hint}\n"
        f"User message: {question}\n\n"
        "Please answer naturally in Korean: about 4-7 short sentences for casual/meta questions; "
        "for doctrine-related questions, use a compact structure (핵심 요점 -> 간단한 설명 -> 한 줄 정리), under ~500 Korean characters when possible."
    ).strip()
    payload: dict[str, Any] = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": GENERAL_CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "options": {
            "temperature": 0.4,
            "top_p": 0.9,
            "num_predict": config.OLLAMA_MAX_TOKENS,
        },
    }
    yield from iter_ollama_chat_stream(url, payload)


# Backward-compatible alias
def generate_answer(question: str, context: str, system_prompt: str | None = None) -> str:
    return generate_rag_answer(question, context, system_prompt=system_prompt)


def generate_general_answer(question: str, branch: str | None = None) -> str:
    """RAG 문맥 없이 일반 대화/메타 질문에 짧게 응답."""
    url = f"{config.OLLAMA_BASE_URL}/api/chat"
    branch_hint = f"(selected_branch={branch})" if branch else ""
    user_content = (
        f"{branch_hint}\n"
        f"User message: {question}\n\n"
        "Please answer naturally in Korean: about 4-7 short sentences for casual/meta questions; "
        "for doctrine-related questions, use a compact structure (핵심 요점 -> 간단한 설명 -> 한 줄 정리), under ~500 Korean characters when possible."
    ).strip()

    payload: dict[str, Any] = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": GENERAL_CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "options": {
            "temperature": 0.4,
            "top_p": 0.9,
            # general 응답도 같은 토큰 상한을 사용 (프롬프트에서 길이를 늘려도
            # 여기서 256 토큰 이하로 또 잘리지 않게)
            "num_predict": config.OLLAMA_MAX_TOKENS,
        },
    }

    headers = ollama_request_headers()
    try:
        with httpx.Client(timeout=_chat_timeout(), headers=headers) as client:
            r = client.post(url, json=payload)
    except httpx.TimeoutException:
        logger.exception("Ollama general chat: timeout")
        return USER_FACING_UNAVAILABLE
    except httpx.RequestError:
        logger.exception("Ollama general chat: connection failed (%s)", url)
        return USER_FACING_UNAVAILABLE

    body = r.text or ""
    if r.status_code >= 400:
        logger.error("Ollama general chat: HTTP %s — %s", r.status_code, body[:500])
        return USER_FACING_UNAVAILABLE
    if _looks_like_html(body):
        logger.error("Ollama general chat: HTML response")
        return USER_FACING_UNAVAILABLE

    try:
        data = r.json()
    except ValueError:
        logger.error("Ollama general chat: response is not JSON")
        return USER_FACING_UNAVAILABLE

    if not isinstance(data, dict):
        return USER_FACING_UNAVAILABLE
    message = data.get("message") or {}
    if not isinstance(message, dict):
        return USER_FACING_UNAVAILABLE
    content = message.get("content")
    if content is None:
        return USER_FACING_UNAVAILABLE
    return str(content).strip()


# === A2A Supervisor synthesis (additive — 기존 함수 무수정) ===

SYNTHESIS_SYSTEM_PROMPT = """당신은 합참(한국군) 자문관 역할의 합동 교리 통합관(Joint Doctrine Supervisor)입니다.

역할:
- 육군/해군/공군 에이전트가 각자 자기 교리에 따라 답변한 내용을 받아,
  합동성(Jointness) 관점에서 통합한 단일 종합 답변을 작성합니다.
- 단순히 각 군 답변을 나열하지 않고, 비교·통합·결론을 도출합니다.

작성 원칙:
1. 답변은 반드시 한국어로 작성. 군사 약어(F2T2EA, D3A, JFACC 등)는 원문 유지.
2. 헤더는 정확히 다음 3개만 사용, 각 헤더는 한 번만 등장:
   ### 핵심 요약
   ### 군별 입장 비교
   ### 합동성 관점의 통합 결론
3. 인용은 본문 안에 자연스럽게 삽입 (예: "육군 교리에서는 D3A를...").
   답변 끝에 [육군], [공군] 같은 라벨만 별도로 나열 금지.
4. 각 군의 핵심을 1~2문장으로만 요약 (절대 길게 늘이지 말 것).
5. "공통점", "차이점", "통합 운용" 세 관점을 명확히 구분.
6. 마지막 결론은 "합동작전 시 ~한다" 형식의 운용 권고로 마무리.
"""


def generate_synthesis_answer(prompt: str, max_tokens: int | None = None) -> str:
    """A2A Supervisor 종합 답변 전용 — 3군 답변을 합참 자문관 페르소나로 융합.

    generate_rag_answer 와 동일한 httpx/에러처리 패턴을 사용하되,
    system prompt 와 num_predict 만 종합 답변용으로 분리.
    """
    url = f"{config.OLLAMA_BASE_URL}/api/chat"

    payload: dict[str, Any] = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "options": {
            "temperature": 0.3,
            "top_p": 0.9,
            "num_predict": max_tokens if max_tokens is not None else config.OLLAMA_MAX_TOKENS,
        },
    }

    headers = ollama_request_headers()

    try:
        with httpx.Client(timeout=_chat_timeout(), headers=headers) as client:
            r = client.post(url, json=payload)
    except httpx.TimeoutException:
        logger.exception("Ollama synthesis: timeout")
        return USER_FACING_UNAVAILABLE
    except httpx.RequestError:
        logger.exception("Ollama synthesis: connection failed (%s)", url)
        return USER_FACING_UNAVAILABLE

    body = r.text or ""

    if r.status_code >= 400:
        logger.error("Ollama synthesis: HTTP %s — %s", r.status_code, body[:500])
        return USER_FACING_UNAVAILABLE

    if _looks_like_html(body):
        logger.error("Ollama synthesis: HTML response (likely ngrok interstitial)")
        return USER_FACING_UNAVAILABLE

    try:
        data = r.json()
    except ValueError:
        logger.error("Ollama synthesis: response is not JSON")
        return USER_FACING_UNAVAILABLE

    if not isinstance(data, dict):
        return USER_FACING_UNAVAILABLE

    err = data.get("error")
    if err:
        msg = err if isinstance(err, str) else str(err)
        logger.warning("Ollama synthesis: API error: %s", msg[:500])
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
