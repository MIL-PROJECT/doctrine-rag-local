"""고수준 LLM 호출 — RAG / 일반 / 스트리밍 / A2A (기존 llm.py API 호환)."""

from __future__ import annotations

import logging
from typing import Any, Iterator


import config
from llm._utils import (
    answer_has_degeneration,
    answer_lacks_korean,
    count_hangul,
    finalize_llm_answer_text,
    run_async,
    sanitize_llm_answer_text,
)
from llm.factory import get_llm_client, resolve_chat_model
from llm.ollama_client import iter_ollama_chat_stream
from llm.prompts import (
    BASE_SYSTEM_PROMPT,
    DOCTRINE_STAFF_SYSTEM_PROMPT,
    GENERAL_CHAT_SYSTEM_PROMPT,
    KOREAN_USER_SUFFIX,
    SYNTHESIS_SYSTEM_PROMPT,
    wrap_user_message,
    load_branch_prompt,
)

logger = logging.getLogger(__name__)

USER_FACING_UNAVAILABLE = (
    "Remote Ollama server is unavailable. Please check Colab and ngrok URL."
)
# vLLM 사용 시에도 프론트 호환 메시지 유지
USER_FACING_LLM_UNAVAILABLE = (
    "LLM server is unavailable. Please check Colab/ngrok URL and LLM_PROVIDER settings."
)


def _user_facing_error() -> str:
    if config.LLM_PROVIDER == "vllm":
        return USER_FACING_LLM_UNAVAILABLE
    return USER_FACING_UNAVAILABLE


def rag_output_token_budget() -> int:
    """RAG 답변용 출력 토큰 상한 (일반 채팅보다 낮게 — 반복 붕괴 완화)."""
    return min(config.LLM_MAX_OUTPUT_TOKENS, config.RAG_MAX_OUTPUT_TOKENS)


def _effective_max_tokens(messages: list[dict[str, str]], requested: int) -> int:
    """vLLM 2048 컨텍스트 한도 — 입력 추정 후 출력 토큰 조정(최소 출력 보장)."""
    if config.LLM_PROVIDER != "vllm":
        return requested
    chars = sum(len(str(m.get("content", ""))) for m in messages)
    est_input = max(1, int(chars / 1.6))
    reserve = 120
    available = config.VLLM_MAX_MODEL_LEN - est_input - reserve
    floor = min(config.VLLM_MIN_OUTPUT_TOKENS, max(64, available))
    capped = min(requested, max(floor, available))
    if capped < requested:
        logger.info(
            "vLLM max_tokens capped %s -> %s (est_input~%s available=%s max_len=%s)",
            requested,
            capped,
            est_input,
            available,
            config.VLLM_MAX_MODEL_LEN,
        )
    return capped


_KOREAN_RETRY_USER = (
    "이전 답변이 영어였습니다. 동일 내용을 반드시 한국어(한글)로만 다시 작성하세요. "
    "형식: ## 요약 / ## 근거. 영어 문장 금지."
)
_DEGEN_RETRY_USER = (
    "이전 답변이 같은 단어·구절을 반복했습니다. "
    "## 요약: 서로 다른 요점 2~3개 불릿, 각 1문장. "
    "## 근거: [1]~[3]만, Evidence 고유 내용 1문장. "
    "쉼표로 같은 말 나열·「지휘관 ○○」 연속 나열 절대 금지."
)


def _chat_once(
    client: Any,
    messages: list[dict[str, str]],
    *,
    model: str,
    temperature: float,
    max_tokens: int,
) -> str:
    out_tokens = _effective_max_tokens(messages, max_tokens)
    raw = run_async(
        client.chat(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=out_tokens,
        )
    )
    return sanitize_llm_answer_text(raw)


def _retry_compact_answer(
    client: Any,
    messages: list[dict[str, str]],
    *,
    model: str,
    suffix: str,
    max_tokens: int,
) -> str | None:
    system_msg = next((m for m in messages if m.get("role") == "system"), None)
    user_msg = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    user_body = str(user_msg.get("content", "")) if user_msg else ""
    if len(user_body) > 1400:
        user_body = user_body[:1400] + "\n...(근거 일부 생략)"
    retry_messages: list[dict[str, str]] = []
    if system_msg:
        retry_messages.append({"role": "system", "content": str(system_msg["content"])})
    retry_messages.append(
        {"role": "user", "content": wrap_user_message(f"{user_body}\n\n{suffix}")}
    )
    try:
        return _chat_once(
            client, retry_messages, model=model, temperature=0.1, max_tokens=max_tokens
        )
    except Exception:
        logger.exception("compact LLM retry failed")
        return None


def _safe_chat(
    messages: list[dict[str, str]],
    *,
    model: str,
    temperature: float,
    max_tokens: int,
) -> str:
    client = get_llm_client()
    try:
        answer = _chat_once(client, messages, model=model, temperature=temperature, max_tokens=max_tokens)
        if answer_has_degeneration(answer):
            logger.warning("LLM answer has repetition degeneration; retrying with compact prompt")
            retried = _retry_compact_answer(
                client, messages, model=model, suffix=_DEGEN_RETRY_USER, max_tokens=min(max_tokens, 400)
            )
            if retried and not answer_has_degeneration(retried):
                answer = retried
            else:
                answer = (
                    "## 요약\n"
                    "- 검색된 교리 본문만으로는 질문에 맞는 상세 설명을 안정적으로 생성하지 못했습니다.\n"
                    "- 질문을 더 구체적으로 입력해 주세요(문서명·장·절·주제).\n\n"
                    "## 근거\n"
                    "- 동일 구절 반복이 감지되어 답변을 중단했습니다. 다른 키워드로 다시 검색해 주세요."
                )
        if answer_lacks_korean(answer):
            logger.warning("LLM answer lacks Korean; retrying with compact Korean-only prompt")
            system_msg = next((m for m in messages if m.get("role") == "system"), None)
            user_msg = next((m for m in reversed(messages) if m.get("role") == "user"), None)
            user_body = str(user_msg.get("content", "")) if user_msg else ""
            if len(user_body) > 1800:
                user_body = user_body[:1800] + "\n...(근거 일부 생략)"
            retry_messages: list[dict[str, str]] = []
            if system_msg:
                retry_messages.append({"role": "system", "content": str(system_msg["content"])})
            retry_messages.append(
                {
                    "role": "user",
                    "content": wrap_user_message(
                        f"{user_body}\n\n{_KOREAN_RETRY_USER}"
                    ),
                }
            )
            answer2 = _chat_once(
                client,
                retry_messages,
                model=model,
                temperature=0.1,
                max_tokens=min(max_tokens, max(600, config.VLLM_MIN_OUTPUT_TOKENS)),
            )
            if count_hangul(answer2) >= count_hangul(answer):
                return sanitize_llm_answer_text(answer2)
        return sanitize_llm_answer_text(answer)
    except RuntimeError as e:
        logger.error("LLM chat failed (%s): %s", config.LLM_PROVIDER, e)
        return _user_facing_error()
    except Exception:
        logger.exception("LLM chat unexpected error")
        return _user_facing_error()


def _rag_user_content(question: str, context: str) -> str:
    body = f"""[질문]
{question}

[검색된 교리 근거 — 영문 원문이어도 답변은 한국어로 작성]
{context}

위 근거만 사용하여 한국어(한글)로 답변하라.
## 요약 (서로 다른 요점 2~4개 불릿) / ## 근거 ([번호]마다 해당 Evidence의 고유 내용 1~2문장)을 포함하라.
동일 문장 반복 금지. Evidence가 제목·메타설명만 있으면 개수를 채우지 말고 본문 부족을 명시하라."""
    return wrap_user_message(body)


def _iter_fake_stream(text: str, step: int = 72) -> Iterator[tuple[str, str | None]]:
    for i in range(0, len(text), step):
        yield ("delta", text[i : i + step])
    yield ("done", None)


async def generate_branch_answer(
    branch: str,
    question: str,
    context: str,
    temperature: float = 0.2,
) -> str:
    """군별 LoRA 모델로 RAG 답변 생성 (Multi-Agent / supervisor 병렬 호출용)."""
    model = resolve_chat_model(branch)
    messages = [
        {"role": "system", "content": DOCTRINE_STAFF_SYSTEM_PROMPT},
        {"role": "user", "content": _rag_user_content(question, context)},
    ]
    client = get_llm_client()
    raw = await client.chat(
        messages,
        model=model,
        temperature=temperature,
        max_tokens=_effective_max_tokens(messages, rag_output_token_budget()),
    )
    return sanitize_llm_answer_text(raw)


def generate_rag_answer(
    question: str,
    context: str,
    system_prompt: str | None = None,
    branch: str = "navy",
) -> str:
    model = resolve_chat_model(branch)
    messages = [
        {"role": "system", "content": (system_prompt or BASE_SYSTEM_PROMPT)},
        {"role": "user", "content": _rag_user_content(question, context)},
    ]
    # Qwen: system에 한국어 예시가 이미 있으나 user 끝 접미어로 재강조됨 (_rag_user_content)
    return _safe_chat(
        messages,
        model=model,
        temperature=0.2,
        max_tokens=rag_output_token_budget(),
    )


def generate_answer(question: str, context: str, system_prompt: str | None = None, branch: str = "navy") -> str:
    return generate_rag_answer(question, context, system_prompt=system_prompt, branch=branch)


def generate_general_answer(question: str, branch: str | None = None) -> str:
    branch_hint = f"(selected_branch={branch})" if branch else ""
    user_content = (
        f"{branch_hint}\n"
        f"사용자 메시지: {question}\n\n"
        "반드시 한국어(한글)로만 답변하라. 일상/메타 질문은 6~10문장, 교리 질문은 핵심 요점·설명·정리를 포함해 800~1200자 내외로 충분히 작성."
    )
    user_content = wrap_user_message(user_content)
    try:
        model = resolve_chat_model(branch)
    except ValueError as e:
        logger.error("general chat model resolve failed: %s", e)
        return _user_facing_error()

    messages = [
        {"role": "system", "content": GENERAL_CHAT_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    return _safe_chat(
        messages,
        model=model,
        temperature=0.4,
        max_tokens=rag_output_token_budget(),
    )


def generate_synthesis_answer(prompt: str, max_tokens: int | None = None) -> str:
    model = resolve_chat_model("army") if config.LLM_PROVIDER == "vllm" else config.OLLAMA_MODEL
    messages = [
        {"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    return _safe_chat(
        messages,
        model=model,
        temperature=0.3,
        max_tokens=max_tokens if max_tokens is not None else config.SYNTHESIS_MAX_TOKENS,
    )


def iter_stream_rag_answer(
    question: str,
    context: str,
    system_prompt: str | None = None,
    branch: str = "navy",
) -> Iterator[tuple[str, str | None]]:
    if config.LLM_PROVIDER == "vllm":
        text = generate_rag_answer(question, context, system_prompt=system_prompt, branch=branch)
        if text in (_user_facing_error(), USER_FACING_UNAVAILABLE, USER_FACING_LLM_UNAVAILABLE):
            yield ("error", text)
            return
        yield from _iter_fake_stream(text)
        return

    url = f"{config.OLLAMA_BASE_URL}/api/chat"
    payload: dict[str, Any] = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": (system_prompt or BASE_SYSTEM_PROMPT)},
            {"role": "user", "content": _rag_user_content(question, context)},
        ],
        "options": {
            "temperature": 0.2,
            "top_p": 0.9,
            "num_predict": rag_output_token_budget(),
        },
    }
    yield from iter_ollama_chat_stream(url, payload)


def iter_stream_general_answer(question: str, branch: str | None = None) -> Iterator[tuple[str, str | None]]:
    if config.LLM_PROVIDER == "vllm":
        text = generate_general_answer(question, branch=branch)
        if text in (_user_facing_error(), USER_FACING_UNAVAILABLE, USER_FACING_LLM_UNAVAILABLE):
            yield ("error", text)
            return
        yield from _iter_fake_stream(text)
        return

    branch_hint = f"(selected_branch={branch})" if branch else ""
    user_content = (
        f"{branch_hint}\n"
        f"사용자 메시지: {question}\n\n"
        "반드시 한국어(한글)로만 답변하라."
    ).strip()
    url = f"{config.OLLAMA_BASE_URL}/api/chat"
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
            "num_predict": rag_output_token_budget(),
        },
    }
    yield from iter_ollama_chat_stream(url, payload)


async def llm_health_status() -> dict[str, Any]:
    client = get_llm_client()
    return await client.health_status()
