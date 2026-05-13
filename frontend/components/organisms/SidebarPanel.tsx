"use client";

import { Icon } from "@/components/atoms/Icon";
import { ConversationRow } from "@/components/molecules/ConversationRow";
import type { DoctrineUser } from "@/lib/auth";
import type { Conversation, HealthPayload } from "@/lib/types";
import { useState } from "react";
import styled from "styled-components";

function userDisplayInitials(user: DoctrineUser): string {
  const name = user.name.trim();
  if (name.length >= 2) return name.slice(0, 2);
  if (name.length === 1) return `${name}${user.id.trim().charAt(0) || ""}`.slice(0, 2);
  const id = user.id.trim();
  if (id.length >= 2) return id.slice(0, 2).toUpperCase();
  return id.charAt(0).toUpperCase() || "?";
}

const Aside = styled.aside`
  border-right: none;
  box-shadow: 1px 0 0 0 var(--layout-divider);
  background: var(--surface);
  min-height: 0;
  overflow-y: auto;
`;

const NewChatWrap = styled.div`
  padding: 1.25rem;
  padding-bottom: 0.75rem;
`;

const UserCard = styled.div`
  margin: 0 1.25rem 1.1rem;
  position: relative;
  border-radius: 1rem;
  overflow: hidden;
  background: linear-gradient(180deg, var(--surface) 0%, var(--surface-muted) 100%);
  border: 1px solid var(--border);
  box-shadow: 0 12px 36px -16px rgb(15 23 42 / 0.2);
`;

const UserCardAccent = styled.div`
  height: 3px;
  width: 100%;
  background: linear-gradient(90deg, var(--branch-accent) 0%, rgb(148 163 184 / 0.35) 100%);
`;

const UserCardInner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  padding: 0.9rem 1rem 1.05rem;
`;

const UserAvatar = styled.div`
  flex-shrink: 0;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8125rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1;
  color: #fff;
  background: var(--branch-accent);
  box-shadow:
    0 4px 14px -3px rgb(15 23 42 / 0.35),
    inset 0 1px 0 0 rgb(255 255 255 / 0.22);
`;

const UserCardMain = styled.div`
  min-width: 0;
  flex: 1;
`;

const UserCardLabel = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.2rem;
  font-size: 0.625rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);

  svg {
    color: var(--branch-accent);
    opacity: 0.95;
  }
`;

const UserName = styled.p`
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.3;
  letter-spacing: -0.02em;
`;

const UserDetailRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin-top: 0.45rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-secondary);

  svg {
    flex-shrink: 0;
    margin-top: 0.15rem;
    color: var(--branch-accent);
    opacity: 0.88;
  }

  span {
    min-width: 0;
  }
`;

const UserDetailRowSecondary = styled(UserDetailRow)`
  margin-top: 0.35rem;
`;

const UserIdPill = styled.div`
  display: inline-flex;
  align-items: center;
  margin-top: 0.55rem;
  max-width: 100%;
  padding: 0.3rem 0.65rem;
  border-radius: 9999px;
  border: 1px solid var(--border);
  background: var(--rank-bg);
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

const LogoutButton = styled.button`
  width: 100%;
  margin-top: 0.25rem;
  border-radius: 0.75rem;
  border: 2px solid color-mix(in srgb, var(--text-primary) 10%, var(--border));
  background: transparent;
  padding: 0.65rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;

  &:hover {
    background: var(--control-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--branch-accent);
    outline-offset: 2px;
  }
`;

type SidebarPanelProps = {
  conversations: Conversation[];
  onSelectConversation?: (id: string) => void;
  health: HealthPayload | null;
  onNewChat?: () => void;
  darkMode: boolean;
  onDarkModeChange: (enabled: boolean) => void;
  sessionUser: DoctrineUser | null;
  onLogout: () => void;
};

export function SidebarPanel({
  conversations,
  onSelectConversation,
  health,
  onNewChat,
  darkMode,
  onDarkModeChange,
  sessionUser,
  onLogout,
}: SidebarPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isAdmin = Boolean(sessionUser?.permissions.includes("ADMIN"));
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

      {sessionUser ? (
        <UserCard aria-label="로그인 사용자 정보">
          <UserCardAccent aria-hidden />
          <UserCardInner>
            <UserAvatar aria-hidden>{userDisplayInitials(sessionUser)}</UserAvatar>
            <UserCardMain>
              <UserCardLabel>
                <Icon name="user" size={14} />
                내 프로필
              </UserCardLabel>
              <UserName>{sessionUser.name}</UserName>
              <UserDetailRow>
                <Icon name="shield" size={15} />
                <span>
                  {sessionUser.rank} · {sessionUser.position}
                </span>
              </UserDetailRow>
              <UserDetailRowSecondary>
                <Icon name="file" size={15} />
                <span>군번 {sessionUser.militaryNumber}</span>
              </UserDetailRowSecondary>
              <UserIdPill title={`ID ${sessionUser.id}`}>ID · {sessionUser.id}</UserIdPill>
            </UserCardMain>
          </UserCardInner>
        </UserCard>
      ) : null}

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
          {isAdmin ? (
            <HealthHint style={{ marginTop: "0.35rem" }}>
              로그:{" "}
              {health?.blockchain?.error
                ? `조회 실패 (${health.blockchain.error.slice(0, 40)})`
                : health?.blockchain?.ledger_enabled
                  ? health.blockchain.chain_valid === false
                    ? "변조 의심(검증 실패)"
                    : `ON · 이벤트 ${health.blockchain.ledger_events ?? 0}건`
                  : "OFF"}
            </HealthHint>
          ) : null}
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
            <LogoutButton type="button" onClick={() => onLogout()}>
              로그아웃
            </LogoutButton>
          </SettingsPanel>
        ) : null}
      </FooterBlock>
    </Aside>
  );
}
