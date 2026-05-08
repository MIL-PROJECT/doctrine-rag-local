"""Hybrid query router: decide rag vs general."""

from __future__ import annotations

from typing import Any
import re

import config
from embeddings import embed_query
import vector_store

GENERAL_KEYWORDS = (
    "저녁",
    "점심",
    "아침",
    "밥",
    "음식",
    "메뉴",
    "맛집",
    "영화",
    "드라마",
    "노래",
    "음악",
    "여행",
    "운동",
    "헬스",
    "다이어트",
    "공부법",
    "연애",
    "고민",
    "상담",
    "일상",
    "날씨",
    "기분",
    "농담",
    "jokes",
    "joke",
    "코딩",
    "파이썬",
    "javascript",
    "react",
    "docker",
    "안녕",
    "하이",
    "hello",
    "hi",
    "너는 누구",
    "넌 누구",
    "이름",
    "자기소개",
    "정체",
    "무엇을 할 수",
    "뭐 할 수",
    "사용법",
    "도움말",
    "who are you",
    "your name",
    "what is your name",
    "introduce yourself",
    "what can you do",
)

DOCTRINE_KEYWORDS = (
    "교리",
    "작전",
    "전술",
    "전략",
    "지휘통제",
    "c2",
    "임무",
    "방어",
    "공격",
    "기동",
    "화력",
    "isr",
    "감시정찰",
    "공중작전",
    "해상작전",
    "지상작전",
    "상륙작전",
    "공역",
    "항공우세",
    "해양통제",
    "함대",
    "전투력",
    "합동",
    "연합",
    "군수",
    "작전통제",
    "작전술",
    "육군",
    "해군",
    "공군",
    "army",
    "navy",
    "air force",
    "doctrine",
    "operation",
    "operations",
    "command and control",
)

STRONG_DOCTRINE_INTENT = ("교리", "개념", "설명", "작전", "비교", "근거", "정의", "원칙")

_ROUTER_TOP_K = max(1, int((__import__("os").getenv("QUERY_ROUTER_TOP_K", "5"))))
_GENERAL_META_PATTERNS = (
    r"너(의)?\s*이름",
    r"(너|넌)\s*누구",
    r"자기소개",
    r"정체가?\s*뭐",
    r"무엇을?\s*할\s*수\s*있",
    r"뭐\s*할\s*수\s*있",
    r"who\s+are\s+you",
    r"(what'?s|what\s+is)\s+your\s+name",
    r"your\s+name",
    r"introduce\s+yourself",
    r"what\s+can\s+you\s+do",
)

# 짧은 확인·백채널(ㅇㅇ, 응, ok 등)은 교리 질의가 아님. 임베딩 검색만 하면 무작위 청크가
# 걸려 RAG가 이상한 장문을 만들 수 있으므로 retrieval 전에 general 로 고정.
_CASUAL_ACK_EXACT = frozenset(
    {
        "ㅇ",
        "ㅇㅇ",
        "ㅇㅇㅇ",
        "ㅇㅋ",
        "ㅇㅋㅇ",
        "ㅎ",
        "ㅎㅎ",
        "ㅎㅎㅎ",
        "응",
        "응응",
        "네",
        "넵",
        "네네",
        "y",
        "ok",
        "okay",
        "yes",
        "yeah",
        "yep",
        "k",
        "👍",
        "👌",
    }
)


def _is_casual_backchannel(question: str) -> bool:
    compact = re.sub(r"\s+", "", question.strip().lower())
    if not compact:
        return True
    if compact in _CASUAL_ACK_EXACT:
        return True
    # 6자 이하이고 ㅇ/ㅋ/ㅎ/ㄴ 등 채팅용 자모만 반복
    if len(compact) <= 6 and re.fullmatch(r"[ㅇㅋㅎㄴㅂy]+", compact):
        return True
    return False


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _count_matches(q: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for kw in keywords if kw in q)


def route_question(question: str, branch: str | None = None) -> dict[str, Any]:
    if _is_casual_backchannel(question):
        return {"route": "general", "reason": "casual_backchannel", "confidence": 0.97}
    q = _normalize(question)
    if not q:
        return {"route": "general", "reason": "empty_question", "confidence": 1.0}
    if any(re.search(p, q) for p in _GENERAL_META_PATTERNS):
        return {"route": "general", "reason": "meta_identity_or_capability", "confidence": 0.98}

    general_score = _count_matches(q, GENERAL_KEYWORDS)
    doctrine_score = _count_matches(q, DOCTRINE_KEYWORDS)

    # Step 1/2: obvious routing by lexical intent
    if general_score > 0 and doctrine_score == 0:
        return {
            "route": "general",
            "reason": f"keyword_general_only(g={general_score})",
            "confidence": min(0.99, 0.7 + 0.1 * general_score),
        }
    if doctrine_score > 0 and general_score == 0:
        return {
            "route": "rag",
            "reason": f"keyword_doctrine_only(d={doctrine_score})",
            "confidence": min(0.99, 0.72 + 0.08 * doctrine_score),
        }
    if general_score > 0 and doctrine_score > 0:
        if any(w in q for w in STRONG_DOCTRINE_INTENT):
            return {
                "route": "rag",
                "reason": f"mixed_keywords_but_strong_doctrine_intent(g={general_score},d={doctrine_score})",
                "confidence": 0.8,
            }
        return {
            "route": "general",
            "reason": f"mixed_keywords_casual_primary(g={general_score},d={doctrine_score})",
            "confidence": 0.72,
        }

    # Step 3: ambiguous => retrieval confidence
    if not branch or branch not in config.SERVICE_BRANCHES:
        return {"route": "general", "reason": "ambiguous_no_valid_branch", "confidence": 0.6}

    collection = config.COLLECTION_MAP[branch]
    if vector_store.collection_count(collection) == 0:
        return {"route": "general", "reason": "ambiguous_no_indexed_docs", "confidence": 0.66}

    q_emb = embed_query(q)
    retrieved = vector_store.search(collection, q_emb, top_k=_ROUTER_TOP_K)
    if not retrieved:
        return {"route": "general", "reason": "ambiguous_no_retrieval_hits", "confidence": 0.68}

    best_distance = min(float(item.get("distance", 1.0) or 1.0) for item in retrieved)
    threshold = config.RETRIEVAL_MAX_DISTANCE
    if best_distance <= threshold:
        conf = min(0.95, 0.6 + (threshold - best_distance + 0.05))
        return {
            "route": "rag",
            "reason": f"ambiguous_retrieval_strong(best_distance={best_distance:.4f},threshold={threshold:.4f})",
            "confidence": round(conf, 3),
            "retrieved_chunks": retrieved,
            "best_distance": best_distance,
        }

    conf = min(0.93, 0.6 + (best_distance - threshold))
    return {
        "route": "general",
        "reason": f"ambiguous_retrieval_weak(best_distance={best_distance:.4f},threshold={threshold:.4f})",
        "confidence": round(conf, 3),
        "best_distance": best_distance,
    }

