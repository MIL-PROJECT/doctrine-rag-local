"""LLM 패키지 공통 유틸."""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Coroutine, TypeVar

T = TypeVar("T")

_THINKING_BLOCK_RE = re.compile(
    r"<(?:think|redacted_thinking)>.*?</(?:think|redacted_thinking)>",
    re.DOTALL | re.IGNORECASE,
)
_HANGUL_RE = re.compile(r"[가-힣]")
# Qwen3 추론 블록 닫는 태그
_THINK_CLOSE_TAGS = ("</think>", "</" + "think>")


def finalize_llm_answer_text(text: str) -> str:
    """Qwen 추론 블록 제거 (레거시 호환 — 전체 후처리는 output_guard.postprocess_answer)."""
    from llm.output_guard import clean_model_output

    return clean_model_output(text)


def count_hangul(text: str) -> int:
    return len(_HANGUL_RE.findall(text or ""))


def _normalize_for_dedupe(line: str) -> str:
    s = re.sub(r"\s+", " ", (line or "").strip().lower())
    s = re.sub(r"\[\d+\]", "", s)
    return s.strip(" -•\t")


def _collapse_comma_phrase_repeats(line: str) -> str:
    """「A, A, A, …」형 인라인 반복을 한 번만 남김."""
    if line.count(",") + line.count("，") < 2:
        line = re.sub(r"(.{4,35}?)(?:\s*[,，]\s*\1){2,}", r"\1", line)
        return line
    parts = [p.strip() for p in re.split(r"[,，]\s*", line) if p.strip()]
    if len(parts) < 3:
        return re.sub(r"(.{4,35}?)(?:\s*[,，]\s*\1){2,}", r"\1", line)

    prefix_m = re.match(r"^(\s*[-*•]?\s*)", line)
    prefix = prefix_m.group(1) if prefix_m else ""
    body = line[len(prefix) :] if prefix else line
    if body != line:
        parts = [p.strip() for p in re.split(r"[,，]\s*", body) if p.strip()]

    deduped: list[str] = []
    for p in parts:
        if deduped and p == deduped[-1]:
            continue
        if p in deduped:
            continue
        deduped.append(p)
    if len(deduped) < len(parts):
        return prefix + ", ".join(deduped)
    return line


def collapse_inline_repetition(text: str, *, max_line_len: int = 420) -> str:
    """불릿 한 줄 안의 구절·단어 연속 반복 제거 및 과도한 길이 절단."""
    if not text:
        return text
    out: list[str] = []
    for line in text.splitlines():
        cleaned = _collapse_comma_phrase_repeats(line)
        if len(cleaned) > max_line_len:
            cut = cleaned[:max_line_len].rsplit(",", 1)[0].rsplit("，", 1)[0]
            cleaned = (cut or cleaned[:max_line_len]).rstrip() + " …(반복 생성으로 생략)"
        out.append(cleaned)
    return "\n".join(out)


def answer_has_degeneration(text: str) -> bool:
    """같은 구절을 쉼표로 수십 번 나열하는 등 모델 붕괴 패턴."""
    body = finalize_llm_answer_text(text)
    for line in body.splitlines():
        if len(line) < 120:
            continue
        parts = [p.strip() for p in re.split(r"[,，]\s*", line) if len(p.strip()) >= 4]
        if len(parts) >= 6:
            from collections import Counter

            top = Counter(parts).most_common(1)[0]
            if top[1] >= 5:
                return True
        if re.search(r"(.{6,30}?)(?:\s*[,，]\s*\1){4,}", line):
            return True
    return False


def sanitize_llm_answer_text(text: str) -> str:
    """output_guard 전체 후처리 (bridge 추가 안전망)."""
    from llm.output_guard import postprocess_answer

    return postprocess_answer(text)


def collapse_duplicate_answer_text(text: str, *, min_line_len: int = 24) -> str:
    """요약·근거 불릿/인용에서 동일·거의 동일 문장 제거."""
    if not text:
        return text
    out_lines: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            out_lines.append(line)
            continue
        is_list_line = stripped.startswith(("-", "*", "[")) or stripped[:2].isdigit()
        if is_list_line and len(stripped) >= min_line_len:
            key = _normalize_for_dedupe(stripped)
            if key in seen:
                continue
            seen.add(key)
        out_lines.append(line)
    return "\n".join(out_lines).strip()


def answer_lacks_korean(text: str, *, min_hangul: int = 35) -> bool:
    """영어 위주 응답이면 True — 재시도 트리거."""
    body = finalize_llm_answer_text(text)
    if count_hangul(body) >= min_hangul:
        return False
    eng_words = len(re.findall(r"\b[A-Za-z]{4,}\b", body))
    return eng_words >= 8 or count_hangul(body) < 12


def ngrok_request_headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
    }


def looks_like_html(body: str) -> bool:
    s = body.lstrip()[:500].lower()
    return s.startswith("<!doctype html") or s.startswith("<html") or "<head>" in s[:200]


def run_async(coro: Coroutine[Any, Any, T]) -> T:
    """동기 컨텍스트(rag_service 등)에서 async chat 호출."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def parse_openai_chat_content(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("vLLM response missing choices")
    first = choices[0]
    if not isinstance(first, dict):
        raise RuntimeError("vLLM response choices[0] is not an object")
    message = first.get("message")
    if not isinstance(message, dict):
        raise RuntimeError("vLLM response missing message")
    content = message.get("content")
    if content is None:
        raise RuntimeError("vLLM response missing message.content")
    return str(content).strip()


def parse_ollama_chat_content(data: dict[str, Any]) -> str:
    message = data.get("message") or {}
    if not isinstance(message, dict):
        raise RuntimeError("Ollama response missing message object")
    content = message.get("content")
    if content is None:
        raise RuntimeError("Ollama response missing message.content")
    return str(content).strip()
