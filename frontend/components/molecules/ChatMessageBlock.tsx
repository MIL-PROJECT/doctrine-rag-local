"use client";

import { AvatarCircle } from "@/components/atoms/AvatarCircle";
import { Icon } from "@/components/atoms/Icon";
import type { A2aLedgerChip, ChatMessage, StandardLedgerChip } from "@/lib/types";
import { useMemo, useState } from "react";
import styled, { css } from "styled-components";

const Row = styled.div<{ $divided: boolean }>`
  display: flex;
  gap: 1.25rem;

  ${({ $divided }) =>
    $divided &&
    css`
      border-top: 1px solid var(--border);
      padding-top: 2rem;
    `}
`;

const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

const Meta = styled.div`
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Role = styled.p`
  margin: 0;
  font-weight: 700;
  color: var(--link-accent);
`;

const Time = styled.span`
  font-size: 0.875rem;
  color: var(--text-muted);
`;

const Content = styled.p`
  margin: 0;
  white-space: pre-wrap;
  font-size: 1.125rem;
  line-height: 2rem;
  color: var(--text-primary);
`;

const CommonCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const CommonCardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const SummaryBar = styled.div`
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: #ffffff;
  padding: 0.75rem 0.875rem;
  display: grid;
  gap: 0.45rem;
`;

const SummaryTitle = styled.p`
  margin: 0;
  font-size: 1.12rem;
  font-weight: 1000;
  color: #111111;
`;

const SummaryItem = styled.p`
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #111111;
  white-space: pre-wrap;
`;

const CommonCard = styled.div<{ $branch: "육군" | "해군" | "공군" }>`
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: #ffffff;
  border-left-width: 4px;
  border-left-color: ${({ $branch }) =>
    $branch === "육군" ? "#22c55e" : $branch === "해군" ? "#3b82f6" : "#a855f7"};
`;

const CommonCardHeader = styled.button`
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-primary);
  padding: 0.75rem 0.875rem;
  text-align: left;
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
`;

const HeaderInline = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`;

const BranchIcon = styled.span<{ $branch: "육군" | "해군" | "공군" }>`
  width: 1.35rem;
  height: 1.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 900;
  color: #ffffff;
  background: ${({ $branch }) =>
    $branch === "육군" ? "#16a34a" : $branch === "해군" ? "#2563eb" : "#9333ea"};
`;

const CommonCardBody = styled.div`
  border-top: 1px solid var(--border);
  padding: 0.875rem;
  white-space: pre-wrap;
  font-size: 0.98rem;
  line-height: 1.7;
  color: var(--text-primary);
`;

type CommonSection = {
  label: "육군" | "해군" | "공군";
  body: string;
};

function parseCommonSections(content: string): CommonSection[] {
  const lines = content.split(/\r?\n/);
  const out: CommonSection[] = [];
  let current: CommonSection | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s*(육군|해군|공군)\s*$/);
    if (m) {
      if (current && current.body.trim()) out.push({ ...current, body: current.body.trim() });
      current = { label: m[1] as "육군" | "해군" | "공군", body: "" };
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current && current.body.trim()) out.push({ ...current, body: current.body.trim() });
  return out;
}

function summaryLine(label: "육군" | "해군" | "공군", body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return `${label}: ${compact || "요약 정보 없음"}`;
}

const LedgerStrip = styled.div`
  margin-top: 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px dashed color-mix(in srgb, var(--branch-accent) 50%, var(--border));
  background: color-mix(in srgb, var(--surface-muted) 90%, var(--branch-accent) 10%);
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
`;

function formatLedgerLine(chip: A2aLedgerChip): string {
  if (chip.skipped) {
    const r = chip.reason ?? "unknown";
    const ex = chip.error ? ` (${chip.error})` : "";
    return `로그: 건너뜀 · ${r}${ex}`;
  }
  const idx = chip.chainIndex != null ? `#${chip.chainIndex}` : "—";
  const h = chip.eventHash ? `${chip.eventHash.slice(0, 16)}…` : "—";
  const tc = chip.fromCache ? " · 캐시" : "";
  const tid = chip.taskId ? ` · task ${chip.taskId.slice(0, 8)}…` : "";
  return `로컬 해시 로그 ${idx} · event ${h}${tc}${tid}`;
}

function formatStandardLedgerLine(chip: StandardLedgerChip): string {
  const id = chip.chatId || "";
  const short = id.length > 12 ? `${id.slice(0, 8)}…` : id;
  return `해시 원장 기록 ID · chat ${short} · 로그 탭에서 단건 검증`;
}

type ChatMessageBlockProps = {
  message: ChatMessage;
  index: number;
};

export function ChatMessageBlock({ message, index }: ChatMessageBlockProps) {
  const sections = useMemo(() => (message.role === "assistant" ? parseCommonSections(message.content) : []), [message]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const orderedSections = useMemo(() => {
    const order: Array<"육군" | "해군" | "공군"> = ["육군", "해군", "공군"];
    return order
      .map((label) => sections.find((s) => s.label === label))
      .filter((v): v is CommonSection => Boolean(v));
  }, [sections]);
  const isCommonSplit = orderedSections.length >= 3;

  return (
    <Row $divided={index > 0}>
      <AvatarCircle tone={message.role === "user" ? "user" : "assistant"}>
        {message.role === "user" ? "U" : <Icon name="anchor" size={24} />}
      </AvatarCircle>
      <Body>
        <Meta>
          <Role>{message.role === "user" ? "사용자" : "어시스턴트"}</Role>
          <Time suppressHydrationWarning>{message.time}</Time>
        </Meta>
        {isCommonSplit ? (
          <CommonCards>
            <SummaryBar>
              <SummaryTitle>3군 비교 요약</SummaryTitle>
              {orderedSections.map((section) => (
                <SummaryItem key={`sum-${section.label}`}>{summaryLine(section.label, section.body)}</SummaryItem>
              ))}
            </SummaryBar>
            <CommonCardsGrid>
              {orderedSections.map((section) => {
                const isCollapsed = Boolean(collapsed[section.label]);
                return (
                  <CommonCard key={section.label} $branch={section.label}>
                    <CommonCardHeader
                      type="button"
                      onClick={() =>
                        setCollapsed((prev) => ({
                          ...prev,
                          [section.label]: !prev[section.label],
                        }))
                      }
                    >
                      <HeaderInline>
                        <BranchIcon $branch={section.label}>
                          {section.label === "육군" ? "A" : section.label === "해군" ? "N" : "AF"}
                        </BranchIcon>
                        {section.label} 답변 {isCollapsed ? "펼치기" : "접기"}
                      </HeaderInline>
                    </CommonCardHeader>
                    {!isCollapsed && <CommonCardBody>{section.body}</CommonCardBody>}
                  </CommonCard>
                );
              })}
            </CommonCardsGrid>
          </CommonCards>
        ) : (
          <Content>{message.content}</Content>
        )}
        {message.role === "assistant" && message.standardLedger ? (
          <LedgerStrip>{formatStandardLedgerLine(message.standardLedger)}</LedgerStrip>
        ) : null}
        {message.role === "assistant" && message.a2aLedger ? (
          <LedgerStrip>{formatLedgerLine(message.a2aLedger)}</LedgerStrip>
        ) : null}
      </Body>
    </Row>
  );
}
