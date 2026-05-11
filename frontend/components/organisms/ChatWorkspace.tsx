"use client";

import { ChatMessageBlock } from "@/components/molecules/ChatMessageBlock";
import { PromptComposer } from "@/components/molecules/PromptComposer";
import type { ChatMessage, ChatMode, ChatResponseMode } from "@/lib/types";
import { FormEvent } from "react";
import styled from "styled-components";

const Section = styled.section`
  background: var(--surface);
  padding: 1.75rem 2rem;
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
  font-weight: 700;
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

  &:hover {
    background: var(--control-hover);
  }
`;

const MessageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
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
`;

const ModeBadge = styled.p`
  margin: 1rem 0 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--mode-success);
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
}: ChatWorkspaceProps) {
  return (
    <Section>
      <Toolbar>
        <Title>{title}</Title>
        <ToolButtons>
          <ModeSelect value={mode} onChange={(e) => onModeChange(e.target.value as ChatMode)} aria-label="응답 모드">
            <option value="auto">자동</option>
            <option value="rag">교리 RAG</option>
            <option value="general">일반 채팅</option>
          </ModeSelect>
          <ToolButton type="button" onClick={onNewChat}>새 대화</ToolButton>
        </ToolButtons>
      </Toolbar>

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

      <PromptComposer value={input} onChange={onInputChange} onSubmit={onSubmit} disabled={busy} />
    </Section>
  );
}
