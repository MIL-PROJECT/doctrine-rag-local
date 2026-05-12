"""A2A Supervisor — 질문 분석, 3군 에이전트 위임, 답변 종합"""
from typing import TypedDict, Any
from langgraph.graph import StateGraph, END
from a2a.agents import army_agent, navy_agent, air_agent
from a2a.audit import record


class A2AState(TypedDict):
    question: str
    top_k: int
    target_branches: list[str]
    answers: dict[str, dict]
    final_answer: str
    task_id: str


ARMY_KEYWORDS = ["육군", "지상작전", "MDMP", "D3A", "ARMY", "기동", "화력", "FM "]
NAVY_KEYWORDS = ["해군", "해상", "함대", "해양", "NAVY", "JP 3-0", "합동작전", "JP "]
AIR_KEYWORDS = ["공군", "항공", "F2T2EA", "AIR", "JFACC", "AFDP", "공역", "ATO"]


def analyze_question(state: A2AState) -> A2AState:
    q = state["question"]
    targets = []

    if any(kw in q for kw in ARMY_KEYWORDS):
        targets.append("army")
    if any(kw in q for kw in NAVY_KEYWORDS):
        targets.append("navy")
    if any(kw in q for kw in AIR_KEYWORDS):
        targets.append("air_force")

    if not targets:
        targets = ["army", "navy", "air_force"]

    record("supervisor_analyzed", {
        "task_id": state["task_id"],
        "question": q,
        "target_branches": targets,
    })

    return {**state, "target_branches": targets, "answers": {}}


def invoke_agents(state: A2AState) -> A2AState:
    answers = {}
    branch_map = {"army": army_agent, "navy": navy_agent, "air_force": air_agent}

    for branch in state["target_branches"]:
        agent = branch_map[branch]
        result = agent.invoke({
            "question": state["question"],
            "top_k": state["top_k"],
        })
        answers[branch] = result

    return {**state, "answers": answers}


def synthesize_answer(state: A2AState) -> A2AState:
    answers = state["answers"]

    if len(answers) == 1:
        branch = list(answers.keys())[0]
        final = f"## {branch.upper()} 교리 답변\n\n{answers[branch]['answer']}"
    else:
        parts = ["# 합동 교리 답변 (Joint Doctrine Response)\n"]
        branch_labels = {"army": "ARMY", "navy": "NAVY", "air_force": "AIR_FORCE"}
        for branch, result in answers.items():
            label = branch_labels.get(branch, branch.upper())
            parts.append(f"\n## {label} 관점\n")
            parts.append(result["answer"])
        final = "\n".join(parts)

    record("supervisor_synthesized", {
        "task_id": state["task_id"],
        "branches_consulted": list(answers.keys()),
        "synthesis_mode": "concat",
        "final_answer_length": len(final),
    })

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


def run_a2a_task(question: str, task_id: str, top_k: int = 10) -> dict[str, Any]:
    from a2a import cache

    record("task_received", {"task_id": task_id, "question": question})

    cached = cache.get(question, top_k)
    if cached is not None:
        record("cache_hit", {
            "task_id": task_id,
            "question": question,
        })
        response = dict(cached["response"])
        response["task_id"] = task_id
        response["from_cache"] = True

        # === Phase 2a: Blockchain Audit Hook (cache hit) ===
        # BLOCKCHAIN_ENABLED=false 시 no-op, 실패해도 메인 작업 영향 없음
        try:
            from blockchain.audit_event import build_task_event
            from a2a.audit import emit_blockchain_event

            bc_event = build_task_event(
                task_id=task_id,
                question=question,
                final_answer=response["final_answer"],
                branches_consulted=response["branches_consulted"],
                answers_by_branch=response["answers_by_branch"],
                all_sources=response["all_sources"],
                from_cache=True,
            )
            bc_result = emit_blockchain_event(bc_event)

            if not bc_result.get("skipped"):
                response["blockchain"] = {
                    "chain_index": bc_result.get("integrity", {}).get("chain_index"),
                    "event_hash": bc_result.get("integrity", {}).get("event_hash"),
                }
        except Exception as e:
            record("blockchain_hook_failed", {
                "task_id": task_id,
                "error": str(e)[:200],
            })
        # === End Phase 2a Hook ===

        return response

    result = supervisor.invoke({
        "question": question,
        "top_k": top_k,
        "target_branches": [],
        "answers": {},
        "final_answer": "",
        "task_id": task_id,
    })

    response = {
        "task_id": task_id,
        "status": "completed",
        "question": question,
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
        "all_sources": [
            src for a in result["answers"].values() for src in a["sources"]
        ],
    }

    if result.get("answers"):
        cache.put(question, top_k, response)
        record("cache_stored", {
            "task_id": task_id,
            "question": question,
        })

    # === Phase 2a: Blockchain Audit Hook ===
    # BLOCKCHAIN_ENABLED=false 시 no-op, 실패해도 메인 작업 영향 없음
    try:
        from blockchain.audit_event import build_task_event
        from a2a.audit import emit_blockchain_event

        bc_event = build_task_event(
            task_id=task_id,
            question=question,
            final_answer=response["final_answer"],
            branches_consulted=response["branches_consulted"],
            answers_by_branch=response["answers_by_branch"],
            all_sources=response["all_sources"],
            from_cache=response.get("from_cache", False),
        )
        bc_result = emit_blockchain_event(bc_event)

        if not bc_result.get("skipped"):
            response["blockchain"] = {
                "chain_index": bc_result.get("integrity", {}).get("chain_index"),
                "event_hash": bc_result.get("integrity", {}).get("event_hash"),
            }
    except Exception as e:
        record("blockchain_hook_failed", {
            "task_id": task_id,
            "error": str(e)[:200],
        })
    # === End Phase 2a Hook ===

    record("task_completed", {
        "task_id": task_id,
        "branches_consulted": result["target_branches"],
        "total_sources": len(response["all_sources"]),
    })

    return response
