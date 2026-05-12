"use client";

import { DoctrineRagTemplate } from "@/components/templates/DoctrineRagTemplate";
import { getCurrentUser, logout, type DoctrineUser } from "@/lib/auth";
import { mapBackendSourcesToRows } from "@/lib/map-backend-source";
import type {
  BackendSource,
  BranchId,
  ChatMessage,
  ChatMode,
  ChatResponseMode,
  ChatSourceRow,
  Conversation,
  HealthPayload,
} from "@/lib/types";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type ChatSession = {
  messages: ChatMessage[];
  sources: ChatSourceRow[];
  chatTitle: string;
  lastResponseMode: ChatResponseMode | null;
};

function timeLabel() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ChatPage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<DoctrineUser | null>(null);
  const [activeTab, setActiveTab] = useState("채팅");
  const [branch, setBranch] = useState<BranchId>("navy");
  const [input, setInput] = useState("");
  const [chatTitle, setChatTitle] = useState("새 대화");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "DoctrineRAG에 오신 것을 환영합니다. 아래 입력창에 교리 관련 질문을 입력하면 로컬 Chroma 인덱스와 Ollama가 답변을 생성합니다.",
      time: "",
    },
  ]);
  const [sources, setSources] = useState<ChatSourceRow[]>([]);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("auto");
  const [lastResponseMode, setLastResponseMode] = useState<ChatResponseMode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
  const [searchSearched, setSearchSearched] = useState(false);
  const [sourceDocumentQuery, setSourceDocumentQuery] = useState("");
  const [selectedPdfFileName, setSelectedPdfFileName] = useState<string | undefined>(undefined);
  const [sourceResetKey, setSourceResetKey] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, ChatSession>>({});

  useEffect(() => {
    setSessionUser(getCurrentUser());
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    router.replace("/login");
  }, [router]);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const data = (await res.json()) as HealthPayload;
      setHealth(data);
    } catch {
      setHealth({ status: "error" });
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    const t = setInterval(refreshHealth, 15000);
    return () => clearInterval(t);
  }, [refreshHealth]);

  useEffect(() => {
    setMessages((prev) => {
      if (!prev.length) return prev;
      if (prev[0].time) return prev;
      const next = [...prev];
      next[0] = { ...next[0], time: timeLabel() };
      return next;
    });
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    setSessions((prev) => ({
      ...prev,
      [activeConversationId]: {
        messages,
        sources,
        chatTitle,
        lastResponseMode,
      },
    }));
  }, [activeConversationId, messages, sources, chatTitle, lastResponseMode]);

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    const t = timeLabel();
    setInput("");
    const titleShort = question.length > 42 ? `${question.slice(0, 42)}…` : question;
    setChatTitle(titleShort);

    let sessionId = activeConversationId;
    if (sessionId === null) {
      const newSessionId = newId();
      sessionId = newSessionId;
      setActiveConversationId(newSessionId);
      setConversations((prev) => [
        { id: newSessionId, title: titleShort, time: t, active: true },
        ...prev.map((c) => ({ ...c, active: false })),
      ]);
    } else {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === sessionId ? { ...c, title: titleShort, time: t, active: true } : { ...c, active: false },
        ),
      );
    }

    setMessages((prev) => [...prev, { role: "user", content: question, time: t }]);
    setBusy(true);

    const assistantTime = timeLabel();
    setMessages((prev) => [...prev, { role: "assistant", content: "", time: assistantTime }]);

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, question, top_k: 5, mode: chatMode }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let msg = "요청 실패";
        try {
          const j = JSON.parse(errText) as { detail?: string };
          if (typeof j.detail === "string") msg = j.detail;
        } catch {
          if (errText) msg = errText.slice(0, 500);
        }
        setLastResponseMode(null);
        setSources([]);
        setMessages((prev) => {
          const n = [...prev];
          n[n.length - 1] = { role: "assistant", content: msg, time: timeLabel() };
          return n;
        });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("no body");
      }
      const dec = new TextDecoder();
      let buf = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { type?: string; text?: string; detail?: string; mode?: ChatResponseMode; sources?: BackendSource[]; branch?: string };
          try {
            ev = JSON.parse(line) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === "meta") {
            setLastResponseMode(ev.mode ?? null);
            setSources(mapBackendSourcesToRows(ev.sources ?? []));
          } else if (ev.type === "delta" && typeof ev.text === "string") {
            accumulated += ev.text;
            setMessages((prev) => {
              const n = [...prev];
              n[n.length - 1] = { role: "assistant", content: accumulated, time: assistantTime };
              return n;
            });
          } else if (ev.type === "error") {
            const detail = typeof ev.detail === "string" ? ev.detail : "스트림 오류";
            setLastResponseMode(null);
            setSources([]);
            setMessages((prev) => {
              const n = [...prev];
              n[n.length - 1] = { role: "assistant", content: detail, time: timeLabel() };
              return n;
            });
            return;
          }
        }
      }

      if (buf.trim()) {
        try {
          const ev = JSON.parse(buf) as { type?: string; text?: string };
          if (ev.type === "delta" && typeof ev.text === "string") {
            accumulated += ev.text;
            setMessages((prev) => {
              const n = [...prev];
              n[n.length - 1] = { role: "assistant", content: accumulated, time: assistantTime };
              return n;
            });
          }
        } catch {
          /* ignore trailing partial */
        }
      }

      if (!accumulated.trim()) {
        setMessages((prev) => {
          const n = [...prev];
          n[n.length - 1] = {
            role: "assistant",
            content: "응답 본문이 비어 있습니다. 백엔드 로그와 Ollama 연결을 확인하세요.",
            time: timeLabel(),
          };
          return n;
        });
      }
    } catch {
      setLastResponseMode(null);
      setSources([]);
      setMessages((prev) => {
        const n = [...prev];
        n[n.length - 1] = {
          role: "assistant",
          content: "API 호출 중 오류가 발생했습니다. Next 서버와 FastAPI 백엔드 연결을 확인하세요.",
          time: timeLabel(),
        };
        return n;
      });
    } finally {
      setBusy(false);
      await refreshHealth();
    }
  }

  function handleDoctrineSearch() {
    const keyword = searchQuery.trim();
    if (!keyword) return;
    setSubmittedSearchQuery(keyword);
    setSearchSearched(true);
  }

  function handleSourcePdfSelect(file: File) {
    setSelectedPdfFileName(file.name);
  }

  function resetDoctrineSearchPage() {
    setSearchQuery("");
    setSubmittedSearchQuery("");
    setSearchSearched(false);
  }

  function resetSourceDocumentsPage() {
    setSourceDocumentQuery("");
    setSelectedPdfFileName(undefined);
    setSourceResetKey((key) => key + 1);
  }

  function handleTabChange(tab: string) {
    if (tab === "교범 검색") {
      resetDoctrineSearchPage();
    }

    if (tab === "출처 문서") {
      resetSourceDocumentsPage();
    }

    setActiveTab(tab);
  }

  function handleNewChat() {
    setActiveTab("채팅");
    setActiveConversationId(null);
    setConversations((prev) => prev.map((c) => ({ ...c, active: false })));
    setChatTitle("새 대화");
    setSources([]);
    setLastResponseMode(null);
    setInput("");
    setMessages([
      {
        role: "assistant",
        content:
          "DoctrineRAG에 오신 것을 환영합니다. 아래 입력창에 교리 관련 질문을 입력하면 로컬 Chroma 인덱스와 Ollama가 답변을 생성합니다.",
        time: timeLabel(),
      },
    ]);
  }

  function handleSelectConversation(id: string) {
    const snap = sessions[id];
    if (!snap) return;
    setActiveTab("채팅");
    setActiveConversationId(id);
    setConversations((prev) => prev.map((c) => ({ ...c, active: c.id === id })));
    setMessages(snap.messages);
    setSources(snap.sources);
    setChatTitle(snap.chatTitle);
    setLastResponseMode(snap.lastResponseMode);
    setInput("");
  }

  return (
    <DoctrineRagTemplate
      activeTab={activeTab}
      onTabChange={handleTabChange}
      branch={branch}
      onBranchChange={setBranch}
      conversations={conversations}
      onSelectConversation={handleSelectConversation}
      health={health}
      chatTitle={chatTitle}
      messages={messages}
      sources={sources}
      input={input}
      onInputChange={setInput}
      onChatSubmit={handleChatSubmit}
      chatBusy={busy}
      onNewChat={handleNewChat}
      chatMode={chatMode}
      onChatModeChange={setChatMode}
      lastResponseMode={lastResponseMode}
      searchQuery={searchQuery}
      submittedSearchQuery={submittedSearchQuery}
      searchSearched={searchSearched}
      onSearchQueryChange={setSearchQuery}
      onDoctrineSearch={handleDoctrineSearch}
      sourceDocumentQuery={sourceDocumentQuery}
      selectedPdfFileName={selectedPdfFileName}
      sourceResetKey={sourceResetKey}
      onSourceDocumentQueryChange={setSourceDocumentQuery}
      onSourcePdfSelect={handleSourcePdfSelect}
      darkMode={darkMode}
      onDarkModeChange={setDarkMode}
      sessionUser={sessionUser}
      onLogout={handleLogout}
    />
  );
}
