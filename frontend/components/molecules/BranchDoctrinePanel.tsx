"use client";

import { MarkdownContent } from "@/components/atoms/MarkdownContent";
import { BRANCH_UI_THEME, type BranchUiLabel } from "@/lib/branchUiTheme";
import { parseDoctrineSections } from "@/lib/parseDoctrineSections";
import { useMemo } from "react";
import styled from "styled-components";

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
`;

const SectionCard = styled.section<{ $accent: string }>`
  border-radius: 0.55rem;
  border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
  border-left: 3px solid ${({ $accent }) => $accent};
  background: #ffffff;
  padding: 0.65rem 0.7rem 0.7rem;
`;

const SectionTitle = styled.h3<{ $accent: string }>`
  margin: 0 0 0.4rem;
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0.02em;
  text-transform: none;
  color: ${({ $accent }) => $accent};
  line-height: 1.25;
`;

function sectionBodyMarkdown(title: string, body: string): string {
  if (!title || !body) return body;
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.replace(new RegExp(`^##\\s*${escaped}\\s*\\n+`, "im"), "").trim();
}

type BranchDoctrinePanelProps = {
  branch: BranchUiLabel;
  content: string;
};

export function BranchDoctrinePanel({ branch, content }: BranchDoctrinePanelProps) {
  const theme = BRANCH_UI_THEME[branch];
  const accent = theme.accent;
  const sections = useMemo(() => parseDoctrineSections(content), [content]);

  if (sections.length === 0) {
    return (
      <MarkdownContent variant="card" accent={accent}>
        {content}
      </MarkdownContent>
    );
  }

  if (sections.length === 1 && !sections[0].title) {
    return (
      <MarkdownContent variant="card" accent={accent}>
        {sections[0].body}
      </MarkdownContent>
    );
  }

  return (
    <Panel>
      {sections.map((section) => {
        const muted = section.kind !== "content";
        return (
          <SectionCard key={section.id} $accent={accent}>
            {section.title ? <SectionTitle $accent={accent}>{section.title}</SectionTitle> : null}
            <MarkdownContent variant="card" accent={accent} muted={muted} hideTopHeading>
              {sectionBodyMarkdown(section.title, section.body) || "—"}
            </MarkdownContent>
          </SectionCard>
        );
      })}
    </Panel>
  );
}
