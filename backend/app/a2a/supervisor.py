"""A2A Supervisor — 질문 분석, 3군 에이전트 위임, 답변 종합"""
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.a2a.agents import air_agent, army_agent, navy_agent
from app.a2a.audit import emit_blockchain_event, record


class A2AState(TypedDict):
    question: str
    top_k: int
    target_branches: list[str]
    answers: dict[str, dict]
    final_answer: str
    task_id: str
    user_id: str
    military_number: str


ARMY_KEYWORDS = ["육군", "지상작전", "MDMP", "D3A", "ARMY", "FM "]
NAVY_KEYWORDS = ["해군", "해상", "함대", "해양", "NAVY", "JP 3-0", "JP "]
AIR_KEYWORDS = ["공군", "항공", "F2T2EA", "AIR", "JFACC", "AFDP", "공역", "ATO"]
# 화력·기동 등은 3군 공통 주제 — 단일 군으로 오인 라우팅 방지
JOINT_KEYWORDS = ["3군", "삼군", "육해공", "합동", "전군", "비교 요약", "비교분석", "종합"]


def _actor_audit(user_id: str, military_number: str) -> dict[str, str]:
    return {"user_id": user_id, "military_number": military_number}


def _attach_blockchain(
    response: dict[str, Any],
    task_id: str,
    question: str,
    user_id: str,
    military_number: str,
) -> None:
    try:
        from app.blockchain.audit_event import build_task_event

        bc_event = build_task_event(
            task_id=task_id,
            question=question,
            final_answer=str(response.get("final_answer", "")),
            branches_consulted=list(response.get("branches_consulted") or []),
            answers_by_branch=dict(response.get("answers_by_branch") or {}),
            all_sources=list(response.get("all_sources") or []),
            from_cache=bool(response.get("from_cache", False)),
            user_id=user_id or None,
            military_number=military_number or None,
        )
        bc_result = emit_blockchain_event(bc_event)
        if not bc_result.get("skipped"):
            integ = bc_result.get("integrity") or {}
            response["blockchain"] = {
                "chain_index": integ.get("chain_index"),
                "event_hash": integ.get("event_hash"),
                "previous_hash": integ.get("previous_hash"),
            }
        else:
            response["blockchain"] = {
                "skipped": True,
                "reason": str(bc_result.get("reason", "unknown")),
                **({"error": bc_result["error"]} if bc_result.get("error") else {}),
            }
    except Exception as e:
        record("blockchain_hook_failed", {"task_id": task_id, "error": str(e)[:200]})
        response["blockchain"] = {"skipped": True, "reason": "exception", "error": str(e)[:200]}


def analyze_question(state: A2AState) -> A2AState:
    q = state["question"]
    targets: list[str] = []

    if any(kw in q for kw in JOINT_KEYWORDS):
        targets = ["army", "navy", "air_force"]
    else:
        if any(kw in q for kw in ARMY_KEYWORDS):
            targets.append("army")
        if any(kw in q for kw in NAVY_KEYWORDS):
            targets.append("navy")
        if any(kw in q for kw in AIR_KEYWORDS):
            targets.append("air_force")

    if not targets:
        targets = ["army", "navy", "air_force"]

    record(
        "supervisor_analyzed",
        {
            "task_id": state["task_id"],
            "question": q,
            "target_branches": targets,
            **_actor_audit(state["user_id"], state["military_number"]),
        },
    )

    return {**state, "target_branches": targets, "answers": {}}


def invoke_agents(state: A2AState) -> A2AState:
    answers = {}
    branch_map = {"army": army_agent, "navy": navy_agent, "air_force": air_agent}
    payload = {
        "user_id": state["user_id"],
        "military_number": state["military_number"],
    }

    for branch in state["target_branches"]:
        agent = branch_map[branch]
        result = agent.invoke(
            {
                "question": state["question"],
                "top_k": state["top_k"],
                **payload,
            }
        )
        answers[branch] = result

    return {**state, "answers": answers}


def synthesize_answer(state: A2AState) -> A2AState:
    answers = state["answers"]
    branch_ko = {"army": "육군", "navy": "해군", "air_force": "공군"}

    if len(answers) == 1:
        branch = list(answers.keys())[0]
        final = f"## {branch_ko.get(branch, branch)} 교리 답변\n\n{answers[branch]['answer']}"
        synthesis_mode = "single_branch"
    else:
        from app.llm.bridge import synthesize_joint_branch_comparison

        by_branch = {b: str((answers[b] or {}).get("answer") or "") for b in answers}
        joint_summary = synthesize_joint_branch_comparison(
            state["question"], by_branch, max_lines=3
        )
        parts = [joint_summary]
        for branch in ("army", "navy", "air_force"):
            if branch not in answers:
                continue
            label = branch_ko.get(branch, branch)
            parts.append(f"\n## {label}\n{answers[branch]['answer']}")
        final = "\n".join(parts)
        synthesis_mode = "llm_joint_summary"

    record(
        "supervisor_synthesized",
        {
            "task_id": state["task_id"],
            "branches_consulted": list(answers.keys()),
            "synthesis_mode": synthesis_mode,
            "final_answer_length": len(final),
            **_actor_audit(state["user_id"], state["military_number"]),
        },
    )

    return {**state, "final_answer": final}


def build_supervisor_graph():
    graph = StateGraph(A2AState)
    graph.add_node("analyzer", analyze_question)
    graph.add_node("invoker", invoke_agents)
    graph.add_node("synthesizer", synthesize_answer)

    graph.set_entry_point("analyzer")
    graph.add_edge("analyzer", "invoker")
    graph.add_edge("invoker", "synthesizer")
    graph.add_edge("synthesizer", END)

    return graph.compile()


supervisor = build_supervisor_graph()


def run_a2a_task(
    question: str,
    task_id: str,
    top_k: int = 10,
    user_id: str | None = None,
    military_number: str | None = None,
) -> dict[str, Any]:
    from app.a2a import cache

    uid = (user_id or "").strip()
    mid = (military_number or "").strip()
    act = _actor_audit(uid, mid)

    record("task_received", {"task_id": task_id, "question": question, **act})

    cached = cache.get(question, top_k)
    if cached is not None:
        record(
            "cache_hit",
            {
                "task_id": task_id,
                "question": question,
                **act,
            },
        )
        response = dict(cached["response"])
        response["task_id"] = task_id
        response["from_cache"] = True
        response["actor"] = {"user_id": uid, "military_number": mid}
        _attach_blockchain(response, task_id, question, uid, mid)
        return response

    result = supervisor.invoke(
        {
            "question": question,
            "top_k": top_k,
            "target_branches": [],
            "answers": {},
            "final_answer": "",
            "task_id": task_id,
            "user_id": uid,
            "military_number": mid,
        }
    )

    response = {
        "task_id": task_id,
        "status": "completed",
        "question": question,
        "actor": {"user_id": uid, "military_number": mid},
        "branches_consulted": result["target_branches"],
        "answers_by_branch": {
            br: {
                "answer": a["answer"],
                "sources_count": len(a["sources"]),
                "mode": a["mode"],
            }
            for br, a in result["answers"].items()
        },
        "final_answer": result["final_answer"],
        "all_sources": [src for a in result["answers"].values() for src in a["sources"]],
    }

    if result.get("answers"):
        cache.put(question, top_k, response)
        record(
            "cache_stored",
            {
                "task_id": task_id,
                "question": question,
                **act,
            },
        )

    _attach_blockchain(response, task_id, question, uid, mid)

    record(
        "task_completed",
        {
            "task_id": task_id,
            "branches_consulted": result["target_branches"],
            "total_sources": len(response["all_sources"]),
            **act,
        },
    )

    return response
