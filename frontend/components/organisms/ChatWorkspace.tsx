"use client";

import { ChatMessageBlock } from "@/components/molecules/ChatMessageBlock";
import { PromptComposer } from "@/components/molecules/PromptComposer";
import type { ChatMessage, ChatMode, ChatPipeline, ChatResponseMode } from "@/lib/types";
import { FormEvent, useEffect, useRef } from "react";
import styled from "styled-components";

const Section = styled.section`
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  background: var(--surface);
  padding: 1.25rem 1.5rem;
`;

const Toolbar = styled.div`
  margin-bottom: 1.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  border-bottom-color: color-mix(in srgb, var(--branch-accent) 45%, var(--border));
  padding-bottom: 1.5rem;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
`;

const ToolButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
`;

const ToolButton = styled.button`
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--control-bg);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--control-hover);
  }
`;

const MessageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const MessageViewport = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.25rem;
`;

const BusyText = styled.p`
  margin: 1.5rem 0 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--link-accent);
`;

const ModeSelect = styled.select`
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary-contrast);
  background: var(--input-bg);

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ModeBadge = styled.p`
  margin: 1rem 0 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--mode-success);
`;

const ComposerWrap = styled.div`
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
`;

type ChatWorkspaceProps = {
  title: string;
  messages: ChatMessage[];
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  onNewChat?: () => void;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  lastResponseMode: ChatResponseMode | null;
  pipeline: ChatPipeline;
  onPipelineChange: (p: ChatPipeline) => void;
};

export function ChatWorkspace({
  title,
  messages,
  input,
  onInputChange,
  onSubmit,
  busy,
  onNewChat,
  mode,
  onModeChange,
  lastResponseMode,
  pipeline,
  onPipelineChange,
}: ChatWorkspaceProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  return (
    <Section>
      <Toolbar>
        <Title>{title}</Title>
        <ToolButtons>
          <ModeSelect
            value={pipeline}
            onChange={(e) => onPipelineChange(e.target.value as ChatPipeline)}
            aria-label="채팅 파이프라인"
            title="표준: 단일 군 스트리밍 · A2A: 슈퍼바이저가 키워드로 군을 고른 뒤 합성"
          >
            <option value="standard">표준 (스트림)</option>
            <option value="a2a">A2A 합동</option>
          </ModeSelect>
          <ModeSelect
            value={mode}
            onChange={(e) => onModeChange(e.target.value as ChatMode)}
            aria-label="응답 모드"
            disabled={pipeline === "a2a"}
            title={pipeline === "a2a" ? "A2A는 군별 에이전트가 항상 교리 RAG로 응답합니다." : undefined}
          >
            <option value="auto">자동</option>
            <option value="rag">교리 RAG</option>
            <option value="general">일반 채팅</option>
          </ModeSelect>
          <ToolButton type="button" onClick={onNewChat}>새 대화</ToolButton>
        </ToolButtons>
      </Toolbar>

      <MessageViewport>
        <MessageList>
          {messages.map((message, index) => (
            <ChatMessageBlock key={`${message.role}-${index}-${message.time}`} message={message} index={index} />
          ))}
        </MessageList>
        {busy && <BusyText>답변 생성 중…</BusyText>}
        {!busy && lastResponseMode === "rag" && <ModeBadge>교리 RAG 응답</ModeBadge>}
        {!busy && lastResponseMode === "general" && (
          <ModeBadge>일반 채팅 응답 · 교리 문서 출처는 사용되지 않았습니다.</ModeBadge>
        )}
        {!busy && lastResponseMode === "a2a" && (
          <ModeBadge>
            A2A 슈퍼바이저 응답 · 다수 군 교리 출처가 병합되었을 수 있습니다. 상단「로그」탭에서 해시 체인 상태를 확인할 수 있습니다.
          </ModeBadge>
        )}
        <div ref={messagesEndRef} />
      </MessageViewport>

      <ComposerWrap>
        <PromptComposer
          value={input}
          onChange={onInputChange}
          onSubmit={onSubmit}
          disabled={busy}
          hint={
            pipeline === "a2a"
              ? "※ A2A: 질문에 육·해·공 키워드가 있으면 해당 군만, 없으면 3군 병렬 조회 후 합성합니다. 응답은 스트림이 아닌 한 번에 표시됩니다."
              : "※ 자동 모드에서는 질문 유형에 따라 교리 RAG 또는 일반 채팅으로 응답합니다."
          }
        />
      </ComposerWrap>
    </Section>
  );
}
