import "./globals.css";

export const metadata = {
  title: "DoctrineRAG · Ollama",
  description: "로컬 Ollama + RAG 교리 Q&A"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
