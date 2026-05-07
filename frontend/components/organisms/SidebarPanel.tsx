"use client";

import { Icon } from "@/components/atoms/Icon";
import { ConversationRow } from "@/components/molecules/ConversationRow";
import type { Conversation, HealthPayload } from "@/lib/types";
import styled from "styled-components";

const Aside = styled.aside`
  border-right: 1px solid #e2e8f0;
  background: #fff;
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
  border: none;
  border-radius: 0.75rem;
  background: #020617;
  padding: 0.75rem 1rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);

  &:hover {
    background: #172554;
  }
`;

const Section = styled.section`
  padding: 1rem 1.25rem;
`;

const SectionTitle = styled.p`
  margin: 0 0 1rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #475569;
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
  border: 1px solid #e2e8f0;
  padding: 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #475569;
  background: #fff;
  cursor: pointer;

  &:hover {
    background: #f8fafc;
  }
`;

const FooterBlock = styled.div`
  margin-top: 6rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0 1.25rem;
`;

const InfoCard = styled.div`
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 1rem;
  font-size: 0.875rem;
  color: #475569;
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
  color: #1e3a8a;
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
  color: #64748b;
`;

const SettingsButton = styled.button`
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #475569;
  background: #fff;
  cursor: pointer;

  &:hover {
    background: #f8fafc;
  }
`;

type SidebarPanelProps = {
  conversations: Conversation[];
  health: HealthPayload | null;
  onNewChat?: () => void;
};

export function SidebarPanel({ conversations, health, onNewChat }: SidebarPanelProps) {
  const modelLabel = health?.ollama?.model ?? health?.ollama_model ?? "—";
  const ollamaReachable = health?.ollama?.reachable ?? health?.ollama_reachable;
  const chunkCount = health?.chroma_documents;

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
        <List>
          {conversations.map((item) => (
            <ConversationRow key={item.id} title={item.title} time={item.time} active={item.active} />
          ))}
        </List>
        <MoreButton type="button">
          더 보기 <span>⌄</span>
        </MoreButton>
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
        <SettingsButton type="button">
          <Icon name="settings" size={20} />
          설정
        </SettingsButton>
      </FooterBlock>
    </Aside>
  );
}
