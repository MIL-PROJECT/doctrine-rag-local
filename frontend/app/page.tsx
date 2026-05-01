"use client";

import { useCallback, useEffect, useState } from "react";

type Source = {
  source: string;
  chunk_index: number;
  distance: number | null;
  preview: string;
};

type Health = {
  status?: string;
  chroma_documents?: number;
  ollama_reachable?: boolean;
  ollama_model?: string;
  ingest_flag?: boolean;
};

export default function HomePage() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState<Health | null>(null);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/health`);
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ status: "error" });
    }
  }, [API_URL]);

  useEffect(() => {
    refreshHealth();
    const t = setInterval(refreshHealth, 15000);
    return () => clearInterval(t);
  }, [refreshHealth]);

  async function submitQuestion() {
    if (!question.trim()) return;

    setLoading(true);
    setAnswer("");
    setSources([]);
    setStatus("답변 생성 중...");

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), top_k: 5 })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "요청 실패");
      }

      setAnswer(data.answer || "");
      setSources(data.sources || []);
      setStatus("완료");
      await refreshHealth();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: "32px" }}>
      <section
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          background: "white",
          borderRadius: "20px",
          padding: "28px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)"
        }}
      >
        <h1 style={{ margin: 0, fontSize: "32px" }}>DoctrineRAG · Ollama</h1>
        <p style={{ color: "#6b7280" }}>
          로컬 임베딩(SentenceTransformers) + Chroma + Ollama — 문서는 배포 전{" "}
          <code>backend/data/doctrine/</code>에 사전 적재
        </p>

        <div
          style={{
            marginTop: "20px",
            padding: "16px",
            background: "#f9fafb",
            borderRadius: "12px",
            fontSize: "14px"
          }}
        >
          <strong>시스템 상태</strong>
          {health ? (
            <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
              <li>API: {health.status === "ok" ? "정상" : health.status || "알 수 없음"}</li>
              <li>인덱스 청크 수: {health.chroma_documents ?? "—"}</li>
              <li>Ollama 연결: {health.ollama_reachable ? "가능" : "불가"}</li>
              <li>모델: {health.ollama_model ?? "—"}</li>
              <li>인제스트 플래그: {health.ingest_flag ? "있음" : "없음"}</li>
            </ul>
          ) : (
            <p style={{ margin: "8px 0 0" }}>불러오는 중...</p>
          )}
        </div>

        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            border: "1px solid #e5e7eb",
            borderRadius: "16px"
          }}
        >
          <h2 style={{ marginTop: 0 }}>질문하기</h2>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="예: 방어작전에서 예비대의 역할은 무엇인가?"
            disabled={loading}
            style={{
              width: "100%",
              height: "120px",
              padding: "14px",
              border: "1px solid #d1d5db",
              borderRadius: "12px",
              fontSize: "16px"
            }}
          />
          <button
            type="button"
            onClick={submitQuestion}
            disabled={loading || !question.trim()}
            style={{
              marginTop: "12px",
              padding: "10px 18px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "10px",
              cursor: loading ? "wait" : "pointer"
            }}
          >
            질문하기
          </button>
        </div>

        {status && (
          <p style={{ marginTop: "18px", color: loading ? "#2563eb" : "#374151" }}>{status}</p>
        )}

        {answer && (
          <div
            style={{
              marginTop: "24px",
              padding: "20px",
              border: "1px solid #e5e7eb",
              borderRadius: "16px"
            }}
          >
            <h2>답변</h2>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{answer}</p>
          </div>
        )}

        {sources.length > 0 && (
          <div
            style={{
              marginTop: "24px",
              padding: "20px",
              border: "1px solid #e5e7eb",
              borderRadius: "16px"
            }}
          >
            <h2>출처</h2>
            {sources.map((src, idx) => (
              <div
                key={idx}
                style={{
                  marginTop: "12px",
                  padding: "14px",
                  background: "#f9fafb",
                  borderRadius: "12px"
                }}
              >
                <strong>
                  {src.source} / chunk {src.chunk_index}
                </strong>
                <p style={{ color: "#6b7280", fontSize: "14px" }}>
                  distance: {src.distance === null ? "N/A" : String(src.distance)}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>{src.preview}...</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
