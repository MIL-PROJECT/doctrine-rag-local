"use client";

import { AvatarCircle } from "@/components/atoms/AvatarCircle";
import { Icon } from "@/components/atoms/Icon";
import { MarkdownContent } from "@/components/atoms/MarkdownContent";
import { BranchDoctrinePanel } from "@/components/molecules/BranchDoctrinePanel";
import { DoctrineAnswerPanel } from "@/components/molecules/DoctrineAnswerPanel";
import { JointSummaryPanel } from "@/components/molecules/JointSummaryPanel";
import {
  buildJointSummaryFromBranches,
  isUsableJointSummary,
  parseJointSummaryItems,
} from "@/lib/jointSummary";
import { branchIdToUiTheme } from "@/lib/branchUiTheme";
import type { A2aLedgerChip, BranchId, ChatMessage, StandardLedgerChip } from "@/lib/types";
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

const CommonCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const CommonCardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(300px, 1fr));
  gap: 1rem;
  align-items: start;

  @media (max-width: 1280px) {
    grid-template-columns: 1fr;
  }
`;

const SummaryBar = styled.div`
  border: 1px solid var(--border);
  border-radius: 0.85rem;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-muted) 40%, #ffffff) 0%,
    #ffffff 100%
  );
  padding: 1rem 1.1rem;
  display: grid;
  gap: 0.65rem;
  box-shadow: 0 1px 2px color-mix(in srgb, #000000 4%, transparent);
`;

const SummaryTitle = styled.h2`
  margin: 0;
  font-size: 1.05rem;
  font-weight: 900;
  color: var(--text-primary);
  letter-spacing: -0.02em;
`;

const SummaryHint = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
`;

const CommonCard = styled.div<{ $branch: "육군" | "해군" | "공군" }>`
  border: 1px solid var(--border);
  border-radius: 0.85rem;
  background: #ffffff;
  box-shadow: 0 1px 3px color-mix(in srgb, #000000 5%, transparent);
  display: flex;
  flex-direction: column;
  min-height: 0;

  &::before {
    content: "";
    display: block;
    height: 3px;
    background: ${({ $branch }) =>
      $branch === "육군"
        ? "linear-gradient(90deg, #22c55e, #16a34a)"
        : $branch === "해군"
          ? "linear-gradient(90deg, #60a5fa, #2563eb)"
          : "linear-gradient(90deg, #38bdf8, #0284c7)"};
  }
`;

const CommonCardHeader = styled.button<{ $branch: "육군" | "해군" | "공군" }>`
  width: 100%;
  border: none;
  background: ${({ $branch }) =>
    $branch === "육군"
      ? "color-mix(in srgb, #22c55e 8%, #ffffff)"
      : $branch === "해군"
        ? "color-mix(in srgb, #3b82f6 8%, #ffffff)"
        : "color-mix(in srgb, #0ea5e9 12%, #e8f4fc)"};
  color: var(--text-primary);
  padding: 0.8rem 0.95rem;
  text-align: left;
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;

  &:hover {
    filter: brightness(0.98);
  }
`;

const HeaderInline = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
`;

const BranchIcon = styled.span<{ $branch: "육군" | "해군" | "공군" }>`
  width: 1.5rem;
  height: 1.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 900;
  color: #ffffff;
  background: ${({ $branch }) =>
    $branch === "육군" ? "#16a34a" : $branch === "해군" ? "#2563eb" : "#0284c7"};
`;

const CollapseHint = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
`;

const CommonCardBody = styled.div`
  border-top: 1px solid var(--border);
  padding: 0.75rem 0.85rem 0.9rem;
  min-height: 0;
  background: #ffffff;
`;

type CommonSection = {
  label: "육군" | "해군" | "공군";
  body: string;
};

function extractJointSummaryBody(content: string): string | null {
  const m = content.match(/^##\s*합동\s*비교\s*종합\s*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/);
  if (!m) return null;
  const body = m[1].trim();
  return body || null;
}

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
  pageBranch?: BranchId;
};

export function ChatMessageBlock({ message, index, pageBranch }: ChatMessageBlockProps) {
  const sections = useMemo(() => (message.role === "assistant" ? parseCommonSections(message.content) : []), [message]);
  const jointSummaryBody = useMemo(
    () => (message.role === "assistant" ? extractJointSummaryBody(message.content) : null),
    [message],
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const orderedSections = useMemo(() => {
    const order: Array<"육군" | "해군" | "공군"> = ["육군", "해군", "공군"];
    return order
      .map((label) => sections.find((s) => s.label === label))
      .filter((v): v is CommonSection => Boolean(v));
  }, [sections]);
  const jointSummaryItems = useMemo(() => {
    const fromLlm = jointSummaryBody ? parseJointSummaryItems(jointSummaryBody) : [];
    if (isUsableJointSummary(fromLlm)) return fromLlm;
    return buildJointSummaryFromBranches(orderedSections);
  }, [jointSummaryBody, orderedSections]);
  const isCommonSplit = orderedSections.length >= 3;

  return (
    <Row $divided={index > 0}>
      <AvatarCircle tone={message.role === "user" ? "user" : "assistant"}>
        {message.role === "user" ? "U" : <Icon name="anchor" size={24} />}
      </AvatarCircle>
      <Body>
        <Meta>
          <Role>{message.role === "user" ? "사용자" : "DOCTOR"}</Role>
          <Time suppressHydrationWarning>{message.time}</Time>
        </Meta>
        {isCommonSplit ? (
          <CommonCards>
            <SummaryBar>
              <SummaryTitle>3군 비교 요약</SummaryTitle>
              <SummaryHint>육·해·공군별 핵심 관점을 간결히 비교합니다.</SummaryHint>
              <JointSummaryPanel items={jointSummaryItems} />
            </SummaryBar>
            <CommonCardsGrid>
              {orderedSections.map((section) => {
                const isCollapsed = Boolean(collapsed[section.label]);
                return (
                  <CommonCard key={section.label} $branch={section.label}>
                    <CommonCardHeader
                      type="button"
                      $branch={section.label}
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
                        {section.label} 교리 답변
                      </HeaderInline>
                      <CollapseHint>{isCollapsed ? "펼치기" : "접기"}</CollapseHint>
                    </CommonCardHeader>
                    {!isCollapsed && (
                      <CommonCardBody>
                        <BranchDoctrinePanel branch={section.label} content={section.body} />
                      </CommonCardBody>
                    )}
                  </CommonCard>
                );
              })}
            </CommonCardsGrid>
          </CommonCards>
        ) : message.role === "assistant" ? (
          <DoctrineAnswerPanel content={message.content} uiTheme={branchIdToUiTheme(pageBranch ?? "common")} />
        ) : (
          <MarkdownContent variant="default">{message.content}</MarkdownContent>
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
