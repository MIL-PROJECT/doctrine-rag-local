import { NextRequest, NextResponse } from "next/server";
import { getInternalApiBaseUrl, getTopKMaxForRoutes } from "@/lib/env";

const searchDefaultTopK = () => Math.min(8, getTopKMaxForRoutes());

/**
 * Chroma 검색만 수행 (백엔드 POST /retrieve). LLM·Ollama를 호출하지 않습니다.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const branch = (request.nextUrl.searchParams.get("branch") ?? "navy").trim() || "navy";
  if (!q) {
    return NextResponse.json({ query: "", results: [], error: "empty_query" }, { status: 200 });
  }

  const topParam = request.nextUrl.searchParams.get("top_k");
  const max = getTopKMaxForRoutes();
  const defaultK = searchDefaultTopK();
  const parsed = topParam ? Number(topParam) : defaultK;
  const top_k =
    Number.isFinite(parsed) && parsed >= 1 ? Math.min(Math.floor(parsed), max) : defaultK;

  const backend = getInternalApiBaseUrl();

  try {
    const res = await fetch(`${backend}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, question: q, top_k }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      sources?: Array<{
        source?: string | null;
        preview?: string | null;
        distance?: number | null;
        document_title?: string | null;
        document_id?: string | null;
      }>;
      indexed?: boolean;
      hint?: string;
      detail?: string;
    };

    if (!res.ok) {
      const msg = typeof data.detail === "string" ? data.detail : "backend_error";
      return NextResponse.json({ query: q, results: [], error: msg, indexed: data.indexed }, { status: 200 });
    }

    const rows = (data.sources ?? []).map((s, i) => ({
      doc_id: String(s.document_id ?? s.source ?? `hit-${i + 1}`),
      title: String(s.document_title ?? s.source ?? "출처"),
      year: "—",
      page: `유사도 ${i + 1}`,
      snippet: String(s.preview ?? "").slice(0, 280),
      score: s.distance === null || s.distance === undefined ? null : s.distance,
    }));

    return NextResponse.json({
      branch,
      query: q,
      results: rows,
      indexed: data.indexed !== false,
      hint: data.hint,
    });
  } catch {
    return NextResponse.json({ branch, query: q, results: [], error: "unreachable" }, { status: 200 });
  }
}
