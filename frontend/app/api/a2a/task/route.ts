import { NextRequest, NextResponse } from "next/server";
import { getInternalApiBaseUrl, getTopKMaxForRoutes } from "@/lib/env";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ detail: "question이 비어 있습니다." }, { status: 400 });
  }

  const cap = getTopKMaxForRoutes();
  const raw = body.top_k;
  const top_k =
    typeof raw === "number" && raw >= 1 ? Math.min(Math.floor(raw), cap) : Math.min(10, cap);
  const task_id = typeof body.task_id === "string" && body.task_id.trim() ? body.task_id.trim() : undefined;
  const user_id = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const military_number = typeof body.military_number === "string" ? body.military_number.trim() : "";

  const backend = getInternalApiBaseUrl();
  try {
    const res = await fetch(`${backend}/a2a/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        top_k,
        ...(task_id ? { task_id } : {}),
        user_id: user_id || undefined,
        military_number: military_number || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "백엔드에 연결할 수 없습니다." }, { status: 502 });
  }
}
