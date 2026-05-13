import { NextResponse } from "next/server";
import { getInternalApiBaseUrl } from "@/lib/env";

export async function GET() {
  const backend = getInternalApiBaseUrl();
  try {
    const res = await fetch(`${backend}/a2a/ledger/verify`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "백엔드에 연결할 수 없습니다." }, { status: 502 });
  }
}
