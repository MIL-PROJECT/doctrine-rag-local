import { NextRequest, NextResponse } from "next/server";
import { getInternalApiBaseUrl, getTopKMaxForRoutes } from "@/lib/env";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const branch = String(body.branch ?? "navy").trim() || "navy";
  const modeRaw = String(body.mode ?? "auto").trim().toLowerCase();
  const mode = modeRaw === "rag" || modeRaw === "general" || modeRaw === "auto" ? modeRaw : "auto";
  const question = String(body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ detail: "question이 비어 있습니다." }, { status: 400 });
  }

  const cap = getTopKMaxForRoutes();
  const raw = body.top_k;
  const top_k =
    typeof raw === "number" && raw >= 1 ? Math.min(Math.floor(raw), cap) : Math.min(5, cap);
  const backend = getInternalApiBaseUrl();
  const user_id = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const military_number = typeof body.military_number === "string" ? body.military_number.trim() : "";

  try {
    const res = await fetch(`${backend}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branch,
        question,
        top_k,
        mode,
        ...(user_id ? { user_id } : {}),
        ...(military_number ? { military_number } : {}),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "백엔드 요청 실패";
      return NextResponse.json({ detail }, { status: res.status });
    }

    return NextResponse.json({
      conversation_id: body.conversation_id ?? "conv-001",
      mode: String(data.mode ?? "general"),
      branch: String(data.branch ?? branch),
      question,
      answer: String(data.answer ?? ""),
      sources: Array.isArray(data.sources) ? data.sources : [],
      route_reason: typeof data.route_reason === "string" ? data.route_reason : undefined,
      route_confidence: typeof data.route_confidence === "number" ? data.route_confidence : undefined,
      chat_id: typeof data.chat_id === "string" ? data.chat_id : undefined,
    });
  } catch {
    return NextResponse.json({ detail: "백엔드에 연결할 수 없습니다. API URL과 서버 기동을 확인하세요." }, { status: 502 });
  }
}
