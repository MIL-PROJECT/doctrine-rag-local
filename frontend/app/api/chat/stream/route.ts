import { NextRequest, NextResponse } from "next/server";
import { getInternalApiBaseUrl, getTopKMaxForRoutes } from "@/lib/env";

/**
 * FastAPI `/chat/stream` NDJSON 프록시. 브라우저는 한 줄씩 JSON(meta → delta* → done)을 읽습니다.
 */
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

  let upstream: Response;
  try {
    upstream = await fetch(`${backend}/chat/stream`, {
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
  } catch {
    return NextResponse.json(
      { detail: "백엔드에 연결할 수 없습니다. API URL과 서버 기동을 확인하세요." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new NextResponse(text || upstream.statusText, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "text/plain; charset=utf-8" },
    });
  }

  const chatIdHdr = upstream.headers.get("x-chat-id");
  const outHeaders: Record<string, string> = {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
  if (chatIdHdr) {
    outHeaders["X-Chat-Id"] = chatIdHdr;
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: outHeaders,
  });
}
