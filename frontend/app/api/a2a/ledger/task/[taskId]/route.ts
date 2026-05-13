import { NextResponse } from "next/server";
import { getInternalApiBaseUrl } from "@/lib/env";

type Ctx = { params: { taskId: string } };

export async function GET(_request: Request, { params }: Ctx) {
  const taskId = decodeURIComponent(params.taskId || "").trim();
  if (!taskId) {
    return NextResponse.json({ detail: "taskId가 필요합니다." }, { status: 400 });
  }

  const backend = getInternalApiBaseUrl();
  const encoded = encodeURIComponent(taskId);
  try {
    const res = await fetch(`${backend}/a2a/ledger/task/${encoded}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "백엔드에 연결할 수 없습니다." }, { status: 502 });
  }
}
