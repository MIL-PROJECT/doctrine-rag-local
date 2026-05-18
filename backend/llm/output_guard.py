"""LLM 출력 정제·검증 — 교리 RAG 전용 (사실 생성 금지, 형식 정규화만)."""

from __future__ import annotations

import re
from typing import Any

REQUIRED_SECTIONS: list[str] = [
    "## 개요",
    "## 핵심 원칙",
    "## 운용 절차",
    "## 지휘관 고려사항",
    "## 유의사항",
]

_MD_SECTION_HEADINGS: list[tuple[str, str]] = [
    ("개요", "## 개요"),
    ("핵심 원칙", "## 핵심 원칙"),
    ("핵심원칙", "## 핵심 원칙"),
    ("운용 절차", "## 운용 절차"),
    ("운용절차", "## 운용 절차"),
    ("지휘관 고려사항", "## 지휘관 고려사항"),
    ("지휘관고려사항", "## 지휘관 고려사항"),
    ("유의사항", "## 유의사항"),
    ("유의 사항", "## 유의사항"),
    ("근거", "## 근거"),
]

_THINKING_BLOCK_RE = re.compile(
    r"<(?:think|redacted_thinking)>.*?</(?:think|redacted_thinking)>",
    re.DOTALL | re.IGNORECASE,
)
_TEMPLATE_TOKEN_RE = re.compile(r"<\|[^|]+\|>", re.IGNORECASE)
_ASSISTANT_PREFIX_RE = re.compile(r"^\s*assistant\s*:\s*", re.IGNORECASE | re.MULTILINE)

_FAKE_REF_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bJP\s*\d+\s*[-–]\s*\d+\b", re.IGNORECASE),
    re.compile(r"\bFM\s*\d+\s*[-–]\s*\d+\b", re.IGNORECASE),
    re.compile(r"\bATP\s*\d+\s*[-–]\s*\d+\b", re.IGNORECASE),
    re.compile(r"\bAFDP\s*\d+[-–]\d+\b", re.IGNORECASE),
    re.compile(r"교범\s*제\s*\d+", re.IGNORECASE),
]


def _line_to_md_heading(line: str) -> str | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    core = re.sub(r"^(?:\d+[.)]\s*)+", "", stripped).strip()
    core = re.sub(r"^#+\s*", "", core).strip()
    core = re.sub(r"[:：]\s*$", "", core).strip()
    for name, heading in _MD_SECTION_HEADINGS:
        if core == name or core == heading.replace("## ", ""):
            return heading
    return None


_SENTENCE_SPLIT_RE = re.compile(
    r"(?<=[.!?…])\s+|(?<=[다요음함됨임]\.)\s*|(?<=\n)\s*"
)


def clean_model_output(text: str) -> str:
    if not text:
        return ""
    cleaned = _THINKING_BLOCK_RE.sub("", text)
    cleaned = re.sub(r"</?(?:think|redacted_thinking)[^>]*>", "", cleaned, flags=re.I)
    cleaned = cleaned.replace("</think>", "").replace("<think>", "")
    cleaned = _TEMPLATE_TOKEN_RE.sub("", cleaned)
    cleaned = _ASSISTANT_PREFIX_RE.sub("", cleaned)
    for closer in ("</think>", "</think>"):
        if closer.lower() in cleaned.lower():
            parts = re.split(re.escape(closer), cleaned, flags=re.IGNORECASE)
            cleaned = parts[-1]
    return cleaned.strip()


def _normalize_line_key(line: str) -> str:
    s = re.sub(r"\s+", " ", (line or "").strip().lower())
    s = re.sub(r"\[\d+\]", "", s)
    return s.strip(" -•\t#")


def remove_duplicate_lines(text: str) -> str:
    if not text:
        return text
    out: list[str] = []
    seen: set[str] = set()
    blank_run = 0
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            blank_run += 1
            if blank_run <= 2:
                out.append(line)
            continue
        blank_run = 0
        key = _normalize_line_key(stripped)
        if len(key) >= 12 and key in seen:
            continue
        if len(key) >= 12:
            seen.add(key)
        out.append(line)
    return "\n".join(out).strip()


def _sentence_key(sentence: str) -> str:
    s = re.sub(r"\s+", " ", sentence.strip().lower())
    return s[:200]


def remove_duplicate_sentences(text: str) -> str:
    if not text:
        return text
    paragraphs: list[str] = []
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        if "\n" in para and para.lstrip().startswith(("-", "*", "1.", "2.", "3.", "4.", "5.")):
            paragraphs.append(para)
            continue
        parts = [p.strip() for p in _SENTENCE_SPLIT_RE.split(para) if p.strip()]
        if len(parts) <= 1:
            paragraphs.append(para)
            continue
        seen: set[str] = set()
        kept: list[str] = []
        for part in parts:
            key = _sentence_key(part)
            if len(key) < 8:
                kept.append(part)
                continue
            if key in seen:
                continue
            seen.add(key)
            kept.append(part)
        paragraphs.append(" ".join(kept) if kept else para)
    return "\n\n".join(paragraphs)


def normalize_required_sections(text: str) -> str:
    """섹션 제목을 ## Markdown h2로 통일. 없는 섹션 본문은 생성하지 않음."""
    out_lines: list[str] = []
    for line in text.splitlines():
        heading = _line_to_md_heading(line)
        if heading:
            out_lines.append(heading)
            continue
        if re.match(r"^#{1,6}\s", line.strip()):
            out_lines.append(re.sub(r"^#{3,6}\s", "## ", line.strip()).rstrip())
            continue
        m = re.match(r"^(\d+)\.\s+(.+)$", line.strip())
        if m and _line_to_md_heading(m.group(2)):
            out_lines.append(_line_to_md_heading(m.group(2)) or line)
            continue
        out_lines.append(line)
    return "\n".join(out_lines)


def _collapse_comma_repeats(text: str) -> str:
    """한 줄 안 'A, A, A' 반복 축소."""
    out: list[str] = []
    for line in text.splitlines():
        if line.count(",") + line.count("，") < 2:
            out.append(re.sub(r"(.{4,35}?)(?:\s*[,，]\s*\1){2,}", r"\1", line))
            continue
        parts = [p.strip() for p in re.split(r"[,，]\s*", line) if p.strip()]
        deduped: list[str] = []
        for p in parts:
            if deduped and p == deduped[-1]:
                continue
            if p in deduped:
                continue
            deduped.append(p)
        prefix_m = re.match(r"^(\s*[-*•]?\s*)", line)
        prefix = prefix_m.group(1) if prefix_m else ""
        body = ", ".join(deduped) if len(deduped) < len(parts) else line
        out.append(prefix + body if prefix and body != line else body)
    return "\n".join(out)


def postprocess_answer(text: str) -> str:
    text = clean_model_output(text)
    text = normalize_required_sections(text)
    text = remove_duplicate_lines(text)
    text = _collapse_comma_repeats(text)
    text = remove_duplicate_sentences(text)
    return text.strip()


def _section_present(text: str, section_title: str) -> bool:
    core = section_title.lstrip("#").strip()
    patterns = [
        re.escape(section_title),
        re.escape(core),
        re.escape(core.replace(" ", r"\s*")),
    ]
    for pat in patterns:
        if re.search(pat, text, re.IGNORECASE):
            return True
    return False


def _repetition_ratio(text: str) -> float:
    lines = [_normalize_line_key(ln) for ln in text.splitlines() if len(ln.strip()) >= 16]
    if len(lines) < 2:
        return 0.0
    unique = len(set(lines))
    return 1.0 - (unique / len(lines))


def validate_answer(text: str) -> dict[str, Any]:
    body = text or ""
    has_required = all(_section_present(body, sec) for sec in REQUIRED_SECTIONS)
    fake_hits = [p.pattern for p in _FAKE_REF_PATTERNS if p.search(body)]
    rep_ratio = _repetition_ratio(body)
    return {
        "has_think_tag": bool(
            re.search(r"<(?:think|redacted_thinking)", body, re.I)
            or "redacted_thinking" in body.lower()
        ),
        "has_chat_template_token": bool(_TEMPLATE_TOKEN_RE.search(body)),
        "has_required_sections": has_required,
        "possible_fake_reference": bool(fake_hits),
        "possible_fake_reference_patterns": fake_hits[:5],
        "repetition_ratio": round(rep_ratio, 4),
        "length": len(body),
    }


_CIRCLED_NUM_RE = re.compile(r"[①②③④⑤⑥⑦⑧⑨⑩]")
_JOINT_PREFIX_RE = re.compile(
    r"^(?:공통|육군|해군|공군|합동)\s*(?:교리\s*요지|관점\s*한\s*줄)?\s*[:：]?\s*",
    re.IGNORECASE,
)
_EXPECTED_JOINT_PREFIXES = ("공통:", "육군:", "해군:", "공군:", "합동:")


def polish_joint_summary(raw: str, *, max_lines: int = 5, max_chars_per_line: int = 130) -> str:
    """3군 비교 요약 전용 — 원문자 번호·한 줄 뭉침·미완결 문장 정리."""
    if not raw:
        return ""
    text = clean_model_output(raw)
    text = _CIRCLED_NUM_RE.sub("\n", text)
    text = re.sub(r"\s{2,}", " ", text)

    lines: list[str] = []
    for chunk in re.split(r"\n+", text):
        chunk = chunk.strip()
        if not chunk:
            continue
        chunk = re.sub(r"^[-*•\d.]+\s*", "", chunk)
        chunk = _JOINT_PREFIX_RE.sub("", chunk)
        m = re.match(r"^(공통|육군|해군|공군|합동)\s*[:：]\s*(.+)$", chunk, re.I)
        if m:
            label = m.group(1)
            body = m.group(2).strip()
            prefix = {"공통": "공통", "육군": "육군", "해군": "해군", "공군": "공군", "합동": "합동"}[
                label
            ]
            chunk = f"{prefix}: {body}"
        elif chunk.startswith(("공통", "육군", "해군", "공군", "합동")):
            chunk = re.sub(r"^(공통|육군|해군|공군|합동)\s*", r"\1: ", chunk, count=1)
        lines.append(chunk)

    if len(lines) == 1 and len(lines[0]) > max_chars_per_line:
        one = lines[0]
        for sep in (" 육군:", " 해군:", " 공군:", " 합동:", "②", "③", "④", "⑤"):
            if sep in one:
                parts = re.split(r"(?=\s*(?:육군|해군|공군|합동)\s*[:：])", one)
                lines = [p.strip() for p in parts if p.strip()]
                break

    polished: list[str] = []
    for ln in lines:
        ln = re.sub(r"\s+", " ", ln).strip()
        if not ln:
            continue
        if not re.match(r"^(공통|육군|해군|공군|합동)\s*:", ln):
            if len(polished) == 0:
                ln = f"공통: {ln}"
            elif len(polished) == 1:
                ln = f"육군: {ln}"
            elif len(polished) == 2:
                ln = f"해군: {ln}"
            elif len(polished) == 3:
                ln = f"공군: {ln}"
            else:
                ln = f"합동: {ln}"
        if len(ln) > max_chars_per_line:
            cut = ln[:max_chars_per_line]
            if "。" in cut or "." in cut:
                last = max(cut.rfind("."), cut.rfind("。"))
                if last > 40:
                    cut = cut[: last + 1]
            else:
                cut = cut.rsplit(" ", 1)[0] if " " in cut[60:] else cut
            ln = cut.rstrip() + "…"
        if ln[-1] not in ".!?。…":
            ln += "."
        polished.append(ln)
        if len(polished) >= max_lines:
            break

    if not polished:
        return text[: max_chars_per_line * max_lines]

    def _sort_key(line: str) -> int:
        head = line.split(":", 1)[0].strip() + ":"
        order = {"공통:": 0, "육군:": 1, "해군:": 2, "공군:": 3, "합동:": 4}
        return order.get(head, 99)

    polished.sort(key=_sort_key)

    bullets: list[str] = []
    for ln in polished[:max_lines]:
        m = re.match(r"^(공통|육군|해군|공군|합동)\s*[:：]\s*(.+)$", ln)
        if m:
            bullets.append(f"- **{m.group(1)}:** {m.group(2).strip()}")
        elif ln.startswith("- "):
            bullets.append(ln)
        else:
            bullets.append(f"- {ln}")

    if re.search(r"^##\s*합동\s*비교\s*종합", text, re.MULTILINE | re.IGNORECASE):
        return text.strip()

    return "## 합동 비교 종합\n\n" + "\n".join(bullets)


def pack_chat_result(
    raw: str,
    *,
    model: str,
    provider: str,
    postprocess: bool,
) -> dict[str, Any]:
    answer = postprocess_answer(raw) if postprocess else clean_model_output(raw)
    validation = validate_answer(answer)
    return {
        "raw": raw,
        "answer": answer,
        "validation": validation,
        "model": model,
        "provider": provider,
    }
