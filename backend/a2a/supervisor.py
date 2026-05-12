"""A2A Supervisor — 질문 분석, 3군 에이전트 위임, 답변 종합"""
import os
from typing import TypedDict, Any
from langgraph.graph import StateGraph, END
from a2a.agents import army_agent, navy_agent, air_agent
from a2a.audit import record
from llm import generate_synthesis_answer, USER_FACING_UNAVAILABLE, MODEL_NOT_FOUND_HINT


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
    question = state["question"]
    branch_labels = {"army": "육군", "navy": "해군", "air_force": "공군"}

    # 단일 군 = 그대로 반환 (LLM 호출 불필요)
    if len(answers) == 1:
        branch = list(answers.keys())[0]
        final = answers[branch]["answer"]
        record("supervisor_synthesized", {
            "task_id": state["task_id"],
            "branches_consulted": list(answers.keys()),
            "synthesis_mode": "passthrough",
            "final_answer_length": len(final),
        })
        return {**state, "final_answer": final}

    # 다중 군 = LLM 융합 호출
    sub_answers_text = ""
    for branch, result in answers.items():
        label = branch_labels.get(branch, branch.upper())
        sub_answers_text += f"\n[{label} 교리 답변]\n{result['answer']}\n"

    synthesis_prompt = f"""원 질문: {question}

각 군 답변:
{sub_answers_text}

위 답변들을 합동성 관점에서 통합하여 종합 답변을 작성하세요.
SYSTEM 지침의 헤더 형식(### 핵심 요약 / ### 군별 입장 비교 / ### 합동성 관점의 통합 결론)을 정확히 따르세요.
"""

    synthesis_max_tokens = int(os.getenv("SYNTHESIS_MAX_TOKENS", "4096"))

    synthesis_mode = "llm_fusion"
    final = ""
    try:
        final = generate_synthesis_answer(
            prompt=synthesis_prompt,
            max_tokens=synthesis_max_tokens,
        )
        # llm.py 는 실패 시 USER_FACING_UNAVAILABLE / MODEL_NOT_FOUND_HINT 문자열을
        # 그대로 반환하므로(예외 X) 폴백 트리거로 명시 검사
        if not final or not final.strip() or final in (USER_FACING_UNAVAILABLE, MODEL_NOT_FOUND_HINT):
            raise RuntimeError(f"synthesis_unusable: {final[:80]}")
    except Exception as e:
        record("synthesis_fallback", {
            "task_id": state["task_id"],
            "error": str(e),
        })
        parts = ["# 합동 교리 답변 (Joint Doctrine Response)\n"]
        for branch, result in answers.items():
            parts.append(f"\n## {branch_labels.get(branch, branch.upper())} 관점\n")
            parts.append(result["answer"])
        final = "\n".join(parts)
        synthesis_mode = "fallback_concat"

    record("supervisor_synthesized", {
        "task_id": state["task_id"],
        "branches_consulted": list(answers.keys()),
        "synthesis_mode": synthesis_mode,
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
    record("task_received", {"task_id": task_id, "question": question})

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

    record("task_completed", {
        "task_id": task_id,
        "branches_consulted": result["target_branches"],
        "total_sources": len(response["all_sources"]),
    })

    return response
