import { NextRequest, NextResponse } from "next/server";
import { getInternalApiBaseUrl } from "@/lib/env";

export async function GET(request: NextRequest) {
  const branch = (request.nextUrl.searchParams.get("branch") ?? "navy").trim() || "navy";
  const backend = getInternalApiBaseUrl();

  try {
    const res = await fetch(`${backend}/source-documents?branch=${encodeURIComponent(branch)}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      indexed?: boolean;
      documents?: Array<{
        doc_id?: string;
        title?: string;
        source?: string | null;
        document_no?: string;
        chunk_count?: number;
        keywords?: string[];
      }>;
      detail?: string;
    };

    if (!res.ok) {
      return NextResponse.json(
        {
          branch,
          indexed: false,
          documents: [],
          error: typeof data.detail === "string" ? data.detail : "backend_error",
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      branch,
      indexed: data.indexed !== false,
      documents: data.documents ?? [],
    });
  } catch {
    return NextResponse.json({ branch, indexed: false, documents: [], error: "unreachable" }, { status: 200 });
  }
}
