"use client";

import { AppHeader } from "@/components/organisms/AppHeader";
import { ChatWorkspace } from "@/components/organisms/ChatWorkspace";
import { ReferenceSourcesPanel } from "@/components/organisms/ReferenceSourcesPanel";
import { SidebarPanel } from "@/components/organisms/SidebarPanel";
import { bp } from "@/lib/breakpoints";
import type { ChatMessage, ChatSourceRow, Conversation, HealthPayload } from "@/lib/types";
import { FormEvent } from "react";
import styled from "styled-components";

const Page = styled.main`
  min-height: 100vh;
  background: #f8fafc;
  color: #0f172a;
`;

const Grid = styled.div`
  display: grid;
  min-height: calc(100dvh - 10rem);
  width: 100%;
  min-width: 0;
  grid-template-columns: 1fr;

  @media (min-width: ${bp.lg}) {
    min-height: calc(100dvh - 5rem);
    grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr) minmax(14rem, 22.5rem);
  }
`;

const PlaceholderSection = styled.section`
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  padding: 2rem;
  text-align: center;
  color: #475569;
`;

const PlaceholderTitle = styled.p`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
`;

const PlaceholderText = styled.p`
  margin: 0.5rem 0 0;
  max-width: 28rem;
  font-size: 0.875rem;
`;

type DoctrineRagTemplateProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  conversations: Conversation[];
  health: HealthPayload | null;
  chatTitle: string;
  messages: ChatMessage[];
  sources: ChatSourceRow[];
  input: string;
  onInputChange: (v: string) => void;
  onChatSubmit: (e: FormEvent<HTMLFormElement>) => void;
  chatBusy?: boolean;
  onNewChat?: () => void;
};

export function DoctrineRagTemplate({
  activeTab,
  onTabChange,
  conversations,
  health,
  chatTitle,
  messages,
  sources,
  input,
  onInputChange,
  onChatSubmit,
  chatBusy,
  onNewChat,
}: DoctrineRagTemplateProps) {
  return (
    <Page>
      <AppHeader activeTab={activeTab} onTabChange={onTabChange} />

      <Grid>
        <SidebarPanel conversations={conversations} health={health} onNewChat={onNewChat} />

        {activeTab === "채팅" ? (
          <ChatWorkspace
            title={chatTitle}
            messages={messages}
            input={input}
            onInputChange={onInputChange}
            onSubmit={onChatSubmit}
            busy={chatBusy}
          />
        ) : (
          <PlaceholderSection>
            <div>
              <PlaceholderTitle>{activeTab}</PlaceholderTitle>
              <PlaceholderText>이 탭은 UI 자리입니다. 필요하면 같은 atomic 폴더에 화면을 추가하면 됩니다.</PlaceholderText>
            </div>
          </PlaceholderSection>
        )}

        <ReferenceSourcesPanel sources={sources} />
      </Grid>
    </Page>
  );
}
