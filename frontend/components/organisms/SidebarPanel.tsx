"use client";

import { Icon } from "@/components/atoms/Icon";
import { ConversationRow } from "@/components/molecules/ConversationRow";
import type { Conversation, HealthPayload } from "@/lib/types";
import { useState } from "react";
import styled from "styled-components";

const Aside = styled.aside`
  border-right: none;
  box-shadow: 1px 0 0 0 var(--layout-divider);
  background: var(--surface);
  min-height: 0;
  overflow-y: auto;
`;

const NewChatWrap = styled.div`
  padding: 1.25rem;
`;

const NewChatButton = styled.button`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  border: 1px solid var(--sidebar-primary-btn-border, transparent);
  border-radius: 0.75rem;
  background: var(--sidebar-primary-btn-bg, var(--branch-accent, #020617));
  padding: 0.75rem 1rem;
  font-weight: 600;
  color: var(--sidebar-primary-btn-fg, #fff);
  cursor: pointer;
  box-shadow: var(--shadow-raised);

  &:hover {
    filter: brightness(1.06);
  }
`;

const Section = styled.section`
  padding: 1rem 1.25rem;
`;

const SectionTitle = styled.p`
  margin: 0 0 1rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-muted);
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const MoreButton = styled.button`
  margin-top: 1rem;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  padding: 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--control-bg);
  cursor: pointer;

  &:hover {
    background: var(--control-hover);
  }
`;

const FooterBlock = styled.div`
  margin-top: 6rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0 1.25rem 1.25rem;
`;

const InfoCard = styled.div`
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  padding: 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  background: var(--surface-muted);
`;

const InfoTitle = styled.p`
  margin: 0 0 0.75rem;
  font-weight: 600;
`;

const ModelLine = styled.p`
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  color: var(--link-accent);
`;

const IndexTitle = styled.p`
  margin: 1rem 0 0.5rem;
  font-weight: 600;
`;

const IndexLine = styled.p`
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const HealthHint = styled.p`
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--text-subtle);
`;

const SettingsButton = styled.button`
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--control-bg);
  cursor: pointer;

  &:hover {
    background: var(--control-hover);
  }
`;

const SettingsPanel = styled.div`
  display: grid;
  gap: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  padding: 1rem;
`;

const SettingsTitle = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-weight: 800;
  color: var(--text-primary);
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
`;

const SwitchButton = styled.button<{ $on: boolean }>`
  position: relative;
  width: 3.25rem;
  height: 1.75rem;
  border: 1px solid ${({ $on }) => ($on ? "var(--switch-on-border)" : "var(--switch-off-border)")};
  border-radius: 9999px;
  background: ${({ $on }) => ($on ? "var(--switch-on-bg)" : "var(--switch-off-bg)")};
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;

  &::after {
    content: "";
    position: absolute;
    top: 0.1875rem;
    left: ${({ $on }) => ($on ? "1.6875rem" : "0.1875rem")};
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 9999px;
    background: #fff;
    box-shadow: 0 1px 3px rgb(15 23 42 / 0.22);
    transition: left 0.2s ease;
  }

  &:focus-visible {
    outline: 2px solid var(--branch-accent);
    outline-offset: 2px;
  }
`;

const SwitchText = styled.span`
  min-width: 2rem;
  text-align: right;
  font-size: 0.75rem;
  font-weight: 900;
  color: var(--text-muted);
`;

const SwitchWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

type SidebarPanelProps = {
  conversations: Conversation[];
  onSelectConversation?: (id: string) => void;
  health: HealthPayload | null;
  onNewChat?: () => void;
  darkMode: boolean;
  onDarkModeChange: (enabled: boolean) => void;
};

export function SidebarPanel({
  conversations,
  onSelectConversation,
  health,
  onNewChat,
  darkMode,
  onDarkModeChange,
}: SidebarPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const modelLabel = health?.ollama?.model ?? health?.ollama_model ?? "—";
  const ollamaReachable = health?.ollama?.reachable ?? health?.ollama_reachable;
  const chunkCount = health?.chroma_documents ?? health?.vector_db?.documents;

  return (
    <Aside>
      <NewChatWrap>
        <NewChatButton type="button" onClick={onNewChat}>
          <Icon name="plus" size={20} />
          새 채팅
        </NewChatButton>
      </NewChatWrap>

      <Section>
        <SectionTitle>최근 대화</SectionTitle>
        {conversations.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            새 채팅 후 질문을 보내면 여기에 쌓입니다.
          </p>
        ) : (
          <List>
            {conversations.map((item) => (
              <ConversationRow
                key={item.id}
                title={item.title}
                time={item.time}
                active={item.active}
                onClick={() => onSelectConversation?.(item.id)}
              />
            ))}
          </List>
        )}
        {conversations.length > 0 ? (
          <MoreButton type="button">
            더 보기 <span>⌄</span>
          </MoreButton>
        ) : null}
      </Section>

      <FooterBlock>
        <InfoCard>
          <InfoTitle>Ollama 모델</InfoTitle>
          <ModelLine>
            <Icon name="shield" size={16} />
            {modelLabel}
          </ModelLine>
          <IndexTitle>인덱스</IndexTitle>
          <IndexLine>
            <Icon name="file" size={16} />
            청크 수: {chunkCount === undefined ? "—" : String(chunkCount)}
          </IndexLine>
          <HealthHint>
            Ollama: {ollamaReachable === undefined ? "—" : ollamaReachable ? "연결됨" : "끊김"} · 인제스트 플래그:{" "}
            {health?.ingest_flag === undefined ? "—" : health.ingest_flag ? "있음" : "없음"}
          </HealthHint>
        </InfoCard>
        <SettingsButton type="button" onClick={() => setSettingsOpen((v) => !v)}>
          <Icon name="settings" size={20} />
          설정
        </SettingsButton>
        {settingsOpen ? (
          <SettingsPanel>
            <SettingsTitle>화면 설정</SettingsTitle>
            <ToggleRow>
              <span>다크 모드</span>
              <SwitchWrap>
                <SwitchText>{darkMode ? "ON" : "OFF"}</SwitchText>
                <SwitchButton
                  type="button"
                  $on={darkMode}
                  aria-label="다크 모드 전환"
                  aria-pressed={darkMode}
                  onClick={() => onDarkModeChange(!darkMode)}
                />
              </SwitchWrap>
            </ToggleRow>
          </SettingsPanel>
        ) : null}
      </FooterBlock>
    </Aside>
  );
}
