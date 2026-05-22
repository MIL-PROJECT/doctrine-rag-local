"use client";

import { AppHeader } from "@/components/organisms/AppHeader";
import { ChatWorkspace } from "@/components/organisms/ChatWorkspace";
import { ReferenceSourcesPanel } from "@/components/organisms/ReferenceSourcesPanel";
import { SidebarPanel } from "@/components/organisms/SidebarPanel";
import { DoctrineSearchWorkspace } from "@/components/organisms/DoctrineSearchWorkspace";
import { LedgerWorkspace } from "@/components/organisms/LedgerWorkspace";
import { SourceDocumentsWorkspace } from "@/components/organisms/SourceDocumentsWorkspace";
import { bp } from "@/lib/breakpoints";
import type { DoctrineUser } from "@/lib/auth";
import type { BranchId, ChatMessage, ChatMode, ChatPipeline, ChatResponseMode, ChatSourceRow, Conversation, HealthPayload } from "@/lib/types";
import { FormEvent } from "react";
import styled from "styled-components";

const Page = styled.main<{ $darkMode: boolean; $branch: BranchId }>`
  display: flex;
  height: 100dvh;
  min-height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  line-height: 1.5;

  ${({ $branch, $darkMode }) => {
    const t =
      $branch === "army"
        ? {
            a: "#15803d",
            aDark: "#4ade80",
            pageBgLight: "#ecfdf5",
            surfaceMutedLight: "#f0fdf4",
            borderLight: "#bbf7d0",
            pageBgDark: "#030806",
            surfaceDark: "#0f1a14",
            surfaceMutedDark: "#14261c",
            borderDark: "#166534",
            gradLight: "linear-gradient(180deg, #ecfdf5 0%, #f1f5f9 38%, #f8fafc 100%)",
            gradDark: "linear-gradient(180deg, #052e16 0%, #020a06 22%, #020617 55%)",
            convTimeLight: "rgba(255,255,255,0.88)",
            convTimeDark: "#bbf7d0",
            surfaceHoverLight: "#dcfce7",
          }
        : $branch === "navy"
          ? {
              a: "#1d4ed8",
              aDark: "#60a5fa",
              pageBgLight: "#eff6ff",
              surfaceMutedLight: "#eff6ff",
              borderLight: "#bfdbfe",
              pageBgDark: "#030712",
              surfaceDark: "#0f1729",
              surfaceMutedDark: "#152238",
              borderDark: "#1e40af",
              gradLight: "linear-gradient(180deg, #eff6ff 0%, #f1f5f9 40%, #f8fafc 100%)",
              gradDark: "linear-gradient(180deg, #0c1929 0%, #050c18 25%, #020617 55%)",
              convTimeLight: "rgba(255,255,255,0.9)",
              convTimeDark: "#bfdbfe",
              surfaceHoverLight: "#dbeafe",
            }
          : $branch === "air_force"
            ? {
              a: "#0369a1",
              aDark: "#67c3e8",
              pageBgLight: "#e8f4fc",
              surfaceMutedLight: "#d4ebf9",
              borderLight: "#a8d4f0",
              pageBgDark: "#062a40",
              surfaceDark: "#0a3f5c",
              surfaceMutedDark: "#124e63",
              borderDark: "#025a8a",
              gradLight: "linear-gradient(180deg, #e8f4fc 0%, #d4ebf9 42%, #f1f5f9 100%)",
              gradDark: "linear-gradient(180deg, #0a3f5c 0%, #062a40 28%, #020617 55%)",
              convTimeLight: "rgba(255,255,255,0.92)",
              convTimeDark: "#a8d4f0",
              surfaceHoverLight: "#a8d4f0",
            }
            : {
                a: "#6d28d9",
                aDark: "#a78bfa",
                pageBgLight: "#faf5ff",
                surfaceMutedLight: "#f5f3ff",
                borderLight: "#ddd6fe",
                pageBgDark: "#0a0612",
                surfaceDark: "#14121f",
                surfaceMutedDark: "#1e1b2e",
                borderDark: "#5b21b6",
                gradLight: "linear-gradient(180deg, #faf5ff 0%, #f1f5f9 38%, #f8fafc 100%)",
                gradDark: "linear-gradient(180deg, #2e1065 0%, #0f0a1a 22%, #020617 55%)",
                convTimeLight: "rgba(255,255,255,0.9)",
                convTimeDark: "#ddd6fe",
                surfaceHoverLight: "#ede9fe",
              };

    if ($darkMode) {
      return `
    --branch-accent: ${t.aDark};
    --branch-soft: ${t.aDark}26;
    --page-bg: ${t.pageBgDark};
    --surface: ${t.surfaceDark};
    --surface-muted: ${t.surfaceMutedDark};
    --surface-hover: #334155;
    --border: ${t.borderDark};
    --text-primary: #f1f5f9;
    --text-secondary: #cbd5e1;
    --text-secondary-contrast: #e2e8f0;
    --text-muted: #94a3b8;
    --text-subtle: #64748b;
    --link-accent: ${t.aDark};
    --input-bg: ${t.surfaceMutedDark};
    --control-bg: ${t.surfaceMutedDark};
    --control-hover: #3d4f60;
    --send-bg: ${t.aDark};
    --send-fg: #ffffff;
    --rank-bg: ${t.aDark}22;
    --shadow-raised: 0 1px 3px rgb(0 0 0 / 0.35);
    --conversation-active-bg: ${t.surfaceMutedDark};
    --conversation-active-fg: #f8fafc;
    --conversation-active-border: ${t.aDark};
    --conversation-time-active: ${t.convTimeDark};
    --sidebar-primary-btn-bg: ${t.aDark};
    --sidebar-primary-btn-fg: #ffffff;
    --sidebar-primary-btn-border: transparent;
    --avatar-user: ${t.aDark};
    --avatar-assistant: #4b5563;
    --mode-success: #5eead4;
    --switch-on-bg: ${t.aDark};
    --switch-on-border: ${t.aDark};
    --switch-off-bg: #475569;
    --switch-off-border: #64748b;
    --layout-divider: rgba(148, 163, 184, 0.22);
    background: ${t.gradDark};
    background-color: ${t.pageBgDark};
    color: var(--text-primary);
    `;
    }

    return `
    --branch-accent: ${t.a};
    --branch-soft: ${t.surfaceMutedLight};
    --page-bg: ${t.pageBgLight};
    --surface: #ffffff;
    --surface-muted: ${t.surfaceMutedLight};
    --surface-hover: ${t.surfaceHoverLight};
    --border: ${t.borderLight};
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-secondary-contrast: #334155;
    --text-muted: #64748b;
    --text-subtle: #94a3b8;
    --link-accent: ${t.a};
    --input-bg: #ffffff;
    --control-bg: #ffffff;
    --control-hover: ${t.surfaceMutedLight};
    --send-bg: ${t.a};
    --send-fg: #ffffff;
    --rank-bg: ${t.surfaceMutedLight};
    --shadow-raised: 0 1px 2px rgb(15 23 42 / 0.07);
    --conversation-active-bg: ${t.a};
    --conversation-active-fg: #ffffff;
    --conversation-active-border: transparent;
    --conversation-time-active: ${t.convTimeLight};
    --sidebar-primary-btn-bg: ${t.a};
    --sidebar-primary-btn-fg: #ffffff;
    --sidebar-primary-btn-border: transparent;
    --avatar-user: ${t.a};
    --avatar-assistant: #0f172a;
    --mode-success: #0f766e;
    --switch-on-bg: ${t.a};
    --switch-on-border: ${t.a};
    --switch-off-bg: #cbd5e1;
    --switch-off-border: #cbd5e1;
    --layout-divider: rgba(15, 23, 42, 0.07);
    background: ${t.gradLight};
    background-color: ${t.pageBgLight};
    color: var(--text-primary);
    `;
  }}
`;

const Grid = styled.div`
  display: grid;
  flex: 1;
  min-height: 0;
  width: 100%;
  min-width: 0;
  grid-template-columns: 1fr;
  overflow: hidden;
  box-shadow: inset 0 1px 0 0 var(--layout-divider);

  @media (min-width: ${bp.lg}) {
    grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr) minmax(16rem, 25rem);
  }
`;

const PlaceholderSection = styled.section`
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
`;

const PlaceholderTitle = styled.p`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
`;

const PlaceholderText = styled.p`
  margin: 0.5rem 0 0;
  max-width: 28rem;
  font-size: 0.875rem;
  color: var(--text-muted);
`;

type DoctrineRagTemplateProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  branch: BranchId;
  onBranchChange: (branch: BranchId) => void;
  conversations: Conversation[];
  onSelectConversation?: (id: string) => void;
  health: HealthPayload | null;
  chatTitle: string;
  messages: ChatMessage[];
  sources: ChatSourceRow[];
  input: string;
  onInputChange: (v: string) => void;
  onChatSubmit: (e: FormEvent<HTMLFormElement>) => void;
  chatBusy?: boolean;
  onNewChat?: () => void;
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
  chatPipeline: ChatPipeline;
  onChatPipelineChange: (p: ChatPipeline) => void;
  lastResponseMode: ChatResponseMode | null;
  searchQuery: string;
  submittedSearchQuery: string;
  searchSearched: boolean;
  onSearchQueryChange: (v: string) => void;
  onDoctrineSearch: () => void;
  sourceDocumentQuery: string;
  selectedPdfFileName?: string;
  sourceResetKey: number;
  onSourceDocumentQueryChange: (v: string) => void;
  onSourcePdfSelect: (file: File) => void;
  darkMode: boolean;
  onDarkModeChange: (enabled: boolean) => void;
  sessionUser: DoctrineUser | null;
  onLogout: () => void;
};

export function DoctrineRagTemplate({
  activeTab,
  onTabChange,
  branch,
  onBranchChange,
  conversations,
  onSelectConversation,
  health,
  chatTitle,
  messages,
  sources,
  input,
  onInputChange,
  onChatSubmit,
  chatBusy,
  onNewChat,
  chatMode,
  onChatModeChange,
  chatPipeline,
  onChatPipelineChange,
  lastResponseMode,
  searchQuery,
  submittedSearchQuery,
  searchSearched,
  onSearchQueryChange,
  onDoctrineSearch,
  sourceDocumentQuery,
  selectedPdfFileName,
  sourceResetKey,
  onSourceDocumentQueryChange,
  onSourcePdfSelect,
  darkMode,
  onDarkModeChange,
  sessionUser,
  onLogout,
}: DoctrineRagTemplateProps) {
  const isAdmin = Boolean(sessionUser?.permissions.includes("ADMIN"));
  return (
    <Page $darkMode={darkMode} $branch={branch}>
      <AppHeader
        activeTab={activeTab}
        onTabChange={onTabChange}
        branch={branch}
        onBranchChange={onBranchChange}
        showLogTab={isAdmin}
      />

      <Grid>
        <SidebarPanel
          conversations={conversations}
          onSelectConversation={onSelectConversation}
          health={health}
          onNewChat={onNewChat}
          darkMode={darkMode}
          onDarkModeChange={onDarkModeChange}
          sessionUser={sessionUser}
          onLogout={onLogout}
        />

        {activeTab === "채팅" ? (
          <ChatWorkspace
            title={chatTitle}
            messages={messages}
            input={input}
            onInputChange={onInputChange}
            onSubmit={onChatSubmit}
            busy={chatBusy}
            onNewChat={onNewChat}
            mode={chatMode}
            onModeChange={onChatModeChange}
            lastResponseMode={lastResponseMode}
            pipeline={chatPipeline}
            onPipelineChange={onChatPipelineChange}
            branch={branch}
          />
        ) : activeTab === "교범 검색" ? (
          <DoctrineSearchWorkspace
            query={searchQuery}
            submittedQuery={submittedSearchQuery}
            searched={searchSearched}
            onQueryChange={onSearchQueryChange}
            onSearch={onDoctrineSearch}
            branch={branch}
          />
        ) : activeTab === "출처 문서" ? (
          <SourceDocumentsWorkspace
            key={sourceResetKey}
            query={sourceDocumentQuery}
            branch={branch}
            selectedFileName={selectedPdfFileName}
            onQueryChange={onSourceDocumentQueryChange}
            onFileSelect={onSourcePdfSelect}
          />
        ) : activeTab === "로그" ? (
          <LedgerWorkspace />
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
