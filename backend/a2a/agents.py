"""3군 에이전트를 LangChain Runnable로 래핑 — 내부적으로 기존 ask_question() 호출"""
from typing import Any
from langchain_core.runnables import RunnableLambda
from rag_service import ask_question
from a2a.audit import record


def _make_branch_runnable(branch: str):
    """특정 군의 RAG를 호출하는 Runnable 생성."""
    def _invoke(inputs: dict[str, Any]) -> dict[str, Any]:
        question = inputs["question"]
        top_k = inputs.get("top_k", 10)

        record("agent_invoked", {
            "branch": branch,
            "question": question,
            "top_k": top_k,
            "user_id": str(inputs.get("user_id") or ""),
            "military_number": str(inputs.get("military_number") or ""),
        })

        result = ask_question(
            question=question,
            branch=branch,
            top_k=top_k,
            mode="rag",
        )

        record("agent_responded", {
            "branch": branch,
            "answer_length": len(result.get("answer", "")),
            "sources_count": len(result.get("sources", [])),
            "mode": result.get("mode"),
            "user_id": str(inputs.get("user_id") or ""),
            "military_number": str(inputs.get("military_number") or ""),
        })

        return {
            "branch": branch,
            "answer": result.get("answer", ""),
            "sources": result.get("sources", []),
            "mode": result.get("mode"),
        }

    return RunnableLambda(_invoke)


army_agent = _make_branch_runnable("army")
navy_agent = _make_branch_runnable("navy")
air_agent = _make_branch_runnable("air_force")
