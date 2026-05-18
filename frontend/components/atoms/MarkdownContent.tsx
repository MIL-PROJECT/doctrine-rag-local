"use client";

import { ensureMarkdownSectionHeadings } from "@/lib/markdownSections";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import styled from "styled-components";

const Article = styled.article<{ $compact?: boolean }>`
  font-size: ${({ $compact }) => ($compact ? "0.98rem" : "1.125rem")};
  line-height: ${({ $compact }) => ($compact ? 1.7 : 1.85)};
  color: var(--text-primary);
  word-break: break-word;

  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }

  h1,
  h3,
  h4 {
    color: var(--text-primary);
    font-weight: 800;
    line-height: 1.35;
    margin: 1em 0 0.4em;
  }

  p {
    margin: 0.45em 0;
  }

  ul,
  ol {
    margin: 0.35em 0 0.75em;
    padding-left: 1.35em;
  }

  li {
    margin: 0.2em 0;
  }

  li > p {
    margin: 0.15em 0;
  }

  strong {
    font-weight: 800;
    color: var(--text-primary);
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
    background: color-mix(in srgb, var(--surface-muted) 85%, transparent);
    padding: 0.1em 0.35em;
    border-radius: 0.25rem;
  }
`;

const SectionHeading = styled.h2<{ $compact?: boolean }>`
  font-size: ${({ $compact }) => ($compact ? "1.15rem" : "1.4rem")};
  font-weight: 900;
  color: var(--text-primary);
  line-height: 1.3;
  letter-spacing: -0.02em;
  margin: ${({ $compact }) => ($compact ? "1.1em 0 0.45em" : "1.35em 0 0.55em")};
  padding-bottom: 0.3em;
  border-bottom: 2px solid color-mix(in srgb, var(--link-accent) 28%, var(--border));
`;

type MarkdownContentProps = {
  children: string;
  compact?: boolean;
  className?: string;
};

export function MarkdownContent({ children, compact = false, className }: MarkdownContentProps) {
  const source = useMemo(() => ensureMarkdownSectionHeadings((children || "").trim()), [children]);

  const components = useMemo<Components>(
    () => ({
      h2: ({ children: headingChildren }) => (
        <SectionHeading $compact={compact}>{headingChildren}</SectionHeading>
      ),
    }),
    [compact],
  );

  if (!source) return null;

  return (
    <Article $compact={compact} className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </Article>
  );
}
