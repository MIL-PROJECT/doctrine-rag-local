"use client";

import { MarkdownContent } from "@/components/atoms/MarkdownContent";
import type { BranchUiTheme } from "@/lib/branchUiTheme";
import { parseDoctrineSections } from "@/lib/parseDoctrineSections";
import { useMemo } from "react";
import styled from "styled-components";

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
`;

const SectionCard = styled.section<{ $accent: string }>`
  border-radius: 0.65rem;
  border: 1px solid var(--border);
  border-left: 4px solid ${({ $accent }) => $accent};
  background: #ffffff;
  padding: 0.85rem 1rem 0.95rem;
  box-shadow: 0 1px 2px color-mix(in srgb, #000000 4%, transparent);
`;

const SectionTitle = styled.h2<{ $accent: string }>`
  margin: 0 0 0.55rem;
  font-size: 1.2rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: ${({ $accent }) => $accent};
  line-height: 1.3;
  padding-bottom: 0.35rem;
  border-bottom: 2px solid color-mix(in srgb, ${({ $accent }) => $accent} 30%, var(--border));
`;

type DoctrineAnswerPanelProps = {
  content: string;
  /** 페이지 군 선택(공군 등) — 합참 보라 테마와 분리된 블록 색 */
  uiTheme?: BranchUiTheme | null;
};

export function DoctrineAnswerPanel({ content, uiTheme }: DoctrineAnswerPanelProps) {
  const sections = useMemo(() => parseDoctrineSections(content), [content]);
  const accent = uiTheme?.accent ?? "var(--link-accent)";

  const contentSections = sections.filter((s) => s.title);

  if (contentSections.length === 0) {
    return (
      <MarkdownContent accent={typeof accent === "string" && !accent.startsWith("var(") ? accent : undefined}>
        {content}
      </MarkdownContent>
    );
  }

  return (
    <Panel>
      {contentSections.map((section) => (
        <SectionCard key={section.id} $accent={accent}>
          <SectionTitle $accent={accent}>{section.title}</SectionTitle>
          <MarkdownContent
            variant="compact"
            accent={typeof accent === "string" && !accent.startsWith("var(") ? accent : undefined}
          >
            {section.body || "—"}
          </MarkdownContent>
        </SectionCard>
      ))}
    </Panel>
  );
}
