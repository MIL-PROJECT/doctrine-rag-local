import { NextRequest, NextResponse } from "next/server";
import { getInternalApiBaseUrl } from "@/lib/env";

type Ctx = { params: { agentId: string } };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const agentId = decodeURIComponent(params.agentId);
  const id = encodeURIComponent(agentId);
  const backend = getInternalApiBaseUrl();
  try {
    const res = await fetch(`${backend}/a2a/agents/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "백엔드에 연결할 수 없습니다." }, { status: 502 });
  }
}
