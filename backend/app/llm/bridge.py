"""고수준 LLM 호출 — RAG / 일반 / 스트리밍 / A2A (기존 llm.py API 호환)."""

from __future__ import annotations

import logging
import re
from typing import Any, Iterator

from app.core import config
from app.llm._utils import answer_has_degeneration, answer_lacks_korean, count_hangul, run_async
from app.llm.output_guard import polish_joint_summary
from app.llm.factory import get_llm_client, resolve_chat_model
from app.llm.ollama_client import iter_ollama_chat_stream
from app.llm.prompts import (
    BASE_SYSTEM_PROMPT,
    GENERAL_CHAT_SYSTEM_PROMPT,
    JOINT_COMPARISON_SYNTHESIS_PROMPT,
    SYNTHESIS_SYSTEM_PROMPT,
    build_rag_user_prompt,
    build_system_prompt,
    wrap_user_message,
)

_BRANCH_KO = {"army": "육군", "navy": "해군", "air_force": "공군"}

logger = logging.getLogger(__name__)

USER_FACING_UNAVAILABLE = (
    "Remote Ollama server is unavailable. Please check Colab and ngrok URL."
)
USER_FACING_LLM_UNAVAILABLE = (
    "LLM server is unavailable. Please check Colab/ngrok URL and LLM_PROVIDER settings."
)

_DEGEN_FALLBACK = (
    "## 개요\n"
    "- 검색된 교리 본문만으로는 질문에 맞는 상세 설명을 안정적으로 생성하지 못했습니다.\n\n"
    "## 유의사항\n"
    "- 질문을 더 구체적으로 입력해 주세요(문서명·장·절·주제).\n"
    "- 동일 구절 반복이 감지되어 답변을 중단했습니다."
)

_KOREAN_RETRY_USER = (
    "이전 답변이 영어였습니다. 동일 내용을 반드시 한국어(한글) Markdown으로만 다시 작성하세요. "
    "형식: ## 개요 ~ ## 유의사항, 본문은 - 불릿 Markdown. 영어 문장 금지."
)
_DEGEN_RETRY_USER = (
    "이전 답변이 같은 단어·구절을 반복했습니다. "
    "## 섹션 제목 + - 불릿 Markdown 형식, 각 섹션 1~2불릿만. "
    "쉼표로 같은 말 나열 금지."
)


def _user_facing_error() -> str:
    if config.LLM_PROVIDER == "vllm":
        return USER_FACING_LLM_UNAVAILABLE
    return USER_FACING_UNAVAILABLE


def rag_output_token_budget() -> int:
    return min(config.LLM_MAX_OUTPUT_TOKENS, config.RAG_MAX_OUTPUT_TOKENS, 900)


def _effective_max_tokens(messages: list[dict[str, str]], requested: int) -> int:
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


def _log_validation(result: dict[str, Any], *, branch: str, question: str = "") -> None:
    v = result.get("validation") or {}
    q_preview = (question[:100] + "…") if len(question) > 100 else question
    logger.info(
        "LLM validation | provider=%s branch=%s model=%s len=%s rep=%.3f "
        "think=%s sections=%s fake_ref=%s",
        result.get("provider"),
        branch,
        result.get("model"),
        v.get("length"),
        v.get("repetition_ratio", 0),
        v.get("has_think_tag"),
        v.get("has_required_sections"),
        v.get("possible_fake_reference"),
    )
    if q_preview:
        logger.debug("LLM validation question preview: %s", q_preview)
    raw = result.get("raw") or ""
    if raw and raw != result.get("answer"):
        logger.debug("LLM raw preview: %s", raw[:240])
    if v.get("repetition_ratio", 0) > 0.35 or v.get("has_think_tag"):
        logger.warning("LLM output guard flags: %s", v)


def _is_degenerate(result: dict[str, Any]) -> bool:
    answer = str(result.get("answer") or "")
    v = result.get("validation") or {}
    if answer_has_degeneration(answer):
        return True
    if float(v.get("repetition_ratio") or 0) > 0.4:
        return True
    return False


def _chat_once(
    client: Any,
    messages: list[dict[str, str]],
    *,
    model: str,
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    out_tokens = _effective_max_tokens(messages, max_tokens)
    return run_async(
        client.chat(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=out_tokens,
            postprocess=True,
        )
    )


def _retry_compact_answer(
    client: Any,
    messages: list[dict[str, str]],
    *,
    model: str,
    suffix: str,
    max_tokens: int,
) -> dict[str, Any] | None:
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
    branch: str = "",
    question: str = "",
) -> str:
    client = get_llm_client()
    try:
        result = _chat_once(
            client, messages, model=model, temperature=temperature, max_tokens=max_tokens
        )
        _log_validation(result, branch=branch, question=question)

        if _is_degenerate(result):
            logger.warning("LLM answer degeneration; retrying with compact prompt")
            retried = _retry_compact_answer(
                client,
                messages,
                model=model,
                suffix=_DEGEN_RETRY_USER,
                max_tokens=min(max_tokens, 400),
            )
            if retried and not _is_degenerate(retried):
                _log_validation(retried, branch=branch, question=question)
                result = retried
            else:
                return _DEGEN_FALLBACK

        answer = str(result.get("answer") or "")
        if answer_lacks_korean(answer):
            logger.warning("LLM answer lacks Korean; retrying")
            retried = _retry_compact_answer(
                client,
                messages,
                model=model,
                suffix=_KOREAN_RETRY_USER,
                max_tokens=min(max_tokens, max(600, config.VLLM_MIN_OUTPUT_TOKENS)),
            )
            if retried and count_hangul(str(retried.get("answer") or "")) >= count_hangul(answer):
                _log_validation(retried, branch=branch, question=question)
                return str(retried["answer"])
        return answer
    except RuntimeError as e:
        logger.error("LLM chat failed (%s): %s", config.LLM_PROVIDER, e)
        return _user_facing_error()
    except Exception:
        logger.exception("LLM chat unexpected error")
        return _user_facing_error()


def _rag_messages(
    question: str, context: str, branch: str, system_prompt: str | None
) -> list[dict[str, str]]:
    sys = system_prompt or build_system_prompt(branch)
    user = wrap_user_message(build_rag_user_prompt(question, context))
    return [
        {"role": "system", "content": sys},
        {"role": "user", "content": user},
    ]


async def generate_branch_answer(
    branch: str,
    question: str,
    context: str,
    temperature: float = 0.2,
    max_tokens: int = 900,
    system_prompt: str | None = None,
) -> dict[str, Any]:
    """군별 LoRA / Ollama RAG 답변 — raw·answer·validation 분리 (A2A·Supervisor 재사용)."""
    model = resolve_chat_model(branch)
    messages = _rag_messages(question, context, branch, system_prompt)
    client = get_llm_client()
    result = await client.chat(
        messages,
        model=model,
        temperature=temperature,
        max_tokens=_effective_max_tokens(messages, max_tokens),
        postprocess=True,
    )
    _log_validation(result, branch=branch, question=question)
    return result


def generate_rag_answer(
    question: str,
    context: str,
    system_prompt: str | None = None,
    branch: str = "navy",
) -> str:
    messages = _rag_messages(question, context, branch, system_prompt)
    return _safe_chat(
        messages,
        model=resolve_chat_model(branch),
        temperature=0.2,
        max_tokens=rag_output_token_budget(),
        branch=branch,
        question=question,
    )


def generate_answer(
    question: str, context: str, system_prompt: str | None = None, branch: str = "navy"
) -> str:
    return generate_rag_answer(question, context, system_prompt=system_prompt, branch=branch)


def generate_general_answer(question: str, branch: str | None = None) -> str:
    branch_hint = f"(selected_branch={branch})" if branch else ""
    user_content = wrap_user_message(
        f"{branch_hint}\n"
        f"사용자 메시지: {question}\n\n"
        "반드시 한국어(한글)로만 답변하라. 일상/메타 질문은 6~10문장으로 간결히 작성."
    )
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
        branch=branch or "",
        question=question,
    )


def generate_synthesis_answer(
    prompt: str,
    max_tokens: int | None = None,
    *,
    system_prompt: str | None = None,
) -> str:
    model = resolve_chat_model("army") if config.LLM_PROVIDER == "vllm" else config.OLLAMA_MODEL
    messages = [
        {"role": "system", "content": system_prompt or SYNTHESIS_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    return _safe_chat(
        messages,
        model=model,
        temperature=0.3,
        max_tokens=max_tokens if max_tokens is not None else config.SYNTHESIS_MAX_TOKENS,
    )


def synthesize_joint_branch_comparison(
    question: str,
    answers_by_branch: dict[str, str],
    *,
    max_lines: int = 3,
) -> str:
    """육·해·공 RAG 답변을 군별 1문장(3줄) 합동 비교 요약으로 압축."""
    blocks: list[str] = []
    for b in ("army", "navy", "air_force"):
        label = _BRANCH_KO.get(b, b)
        body = (answers_by_branch.get(b) or "").strip()
        if len(body) > 2200:
            body = body[:2200] + "\n...(이하 생략)"
        blocks.append(f"[{label} 교리 답변]\n{body or '(답변 없음)'}")

    user_prompt = (
        f"질문: {question.strip()}\n\n"
        "아래 3개 군 RAG 답변을 비교·분석해 합동 참모 Markdown 요약을 작성하라.\n"
        "형식: ## 합동 비교 종합 + **육군:** / **해군:** / **공군:** 불릿 3개만. "
        "각각 별도 줄·한 문장·80자 이내. 한 줄에 3군 묶어 쓰기 금지.\n\n"
        + "\n\n".join(blocks)
    )
    try:
        client = get_llm_client()
        model = resolve_chat_model("army") if config.LLM_PROVIDER == "vllm" else config.OLLAMA_MODEL
        messages = [
            {"role": "system", "content": JOINT_COMPARISON_SYNTHESIS_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
        result = run_async(
            client.chat(
                messages,
                model=model,
                temperature=0.25,
                max_tokens=_effective_max_tokens(messages, 480),
                postprocess=True,
            )
        )
        raw = str(result.get("answer") or "")
        _log_validation(result, branch="common", question=question)
        if raw in (_user_facing_error(), USER_FACING_UNAVAILABLE, USER_FACING_LLM_UNAVAILABLE):
            raise RuntimeError(raw)
        polished = polish_joint_summary(raw, max_lines=max_lines)
        if polished.strip():
            return polished
    except Exception:
        logger.exception("joint comparison synthesis failed; using fallback")

    fallback: list[str] = []
    for b in ("army", "navy", "air_force"):
        label = _BRANCH_KO[b]
        fallback.append(f"{label}: {_branch_one_liner(answers_by_branch.get(b) or '')}")
    return polish_joint_summary("\n".join(fallback), max_lines=max_lines)


def _branch_one_liner(answer: str, *, max_chars: int = 96) -> str:
    """군별 RAG 본문에서 개요 우선 1문장 추출 (3군 비교 요약 폴백)."""
    if not (answer or "").strip():
        return "제공된 문서 근거가 부족합니다."
    m = re.search(r"##\s*개요\s*\n([\s\S]*?)(?=\n##\s|$)", answer, re.IGNORECASE)
    raw = (m.group(1) if m else answer).replace("\n", " ")
    raw = re.sub(r"^#+\s*\S+\s*", "", raw)
    raw = re.sub(r"^[-*•]\s*", "", raw)
    raw = re.sub(
        r"(?:개요|핵심\s*원칙|운용\s*절차|지휘관\s*고려\s*사항|유의\s*사항|근거)\s*[:：]?\s*",
        "",
        raw,
        flags=re.IGNORECASE,
    )
    raw = re.sub(r"\s+", " ", raw).strip()
    parts = [p.strip() for p in re.split(r"(?<=[.!?。])\s+", raw) if p.strip()]
    one = parts[0] if parts else raw
    if len(one) > max_chars:
        cut = one[:max_chars]
        last = max(cut.rfind("."), cut.rfind(" "), cut.rfind("。"))
        one = (cut[: last + 1] if last > 40 else cut).rstrip() + "…"
    if one and one[-1] not in ".!?。…":
        one += "."
    return one or "제공된 문서 근거가 부족합니다."


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

    sys = system_prompt or build_system_prompt(branch)
    url = f"{config.OLLAMA_BASE_URL}/api/chat"
    payload: dict[str, Any] = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": wrap_user_message(build_rag_user_prompt(question, context))},
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


def _iter_fake_stream(text: str, step: int = 72) -> Iterator[tuple[str, str | None]]:
    for i in range(0, len(text), step):
        yield ("delta", text[i : i + step])
    yield ("done", None)


async def llm_health_status() -> dict[str, Any]:
    client = get_llm_client()
    return await client.health_status()
