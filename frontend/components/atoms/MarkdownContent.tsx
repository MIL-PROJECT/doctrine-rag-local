"use client";

import { formatDoctrineMarkdown } from "@/lib/markdownSections";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import styled, { css } from "styled-components";

type Variant = "default" | "compact" | "card";

const articleStyles = css<{ $variant: Variant; $muted?: boolean }>`
  color: ${({ $muted }) => ($muted ? "var(--text-secondary)" : "var(--text-primary)")};
  word-break: break-word;

  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }

  p {
    margin: 0.35em 0;
  }

  ul,
  ol {
    margin: 0.25em 0 0.55em;
    padding-left: 1.2em;
  }

  li {
    margin: 0.28em 0;
    padding-left: 0.15em;
  }

  li::marker {
    color: color-mix(in srgb, var(--text-muted) 70%, var(--text-primary));
  }

  li > p {
    margin: 0.1em 0;
  }

  strong {
    font-weight: 800;
    color: var(--text-primary);
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.88em;
    background: color-mix(in srgb, var(--surface-muted) 85%, transparent);
    padding: 0.1em 0.35em;
    border-radius: 0.25rem;
  }

  ${({ $variant }) =>
    $variant === "default" &&
    css`
      font-size: 1.125rem;
      line-height: 1.85;
    `}

  ${({ $variant }) =>
    ($variant === "compact" || $variant === "card") &&
    css`
      font-size: 0.9rem;
      line-height: 1.65;
    `}

  ${({ $variant }) =>
    $variant === "card" &&
    css`
      font-size: 0.875rem;
      line-height: 1.6;

      ul,
      ol {
        margin-top: 0.15em;
      }

      p + ul,
      p + ol {
        margin-top: 0.35em;
      }
    `}
`;

const Article = styled.article<{ $variant: Variant; $muted?: boolean }>`
  ${articleStyles}
`;

const SectionHeading = styled.h2<{ $variant: Variant; $accent?: string }>`
  font-weight: 900;
  line-height: 1.28;
  letter-spacing: -0.02em;
  color: ${({ $accent }) => $accent || "var(--text-primary)"};
  border-bottom: 2px solid
    color-mix(in srgb, ${({ $accent }) => $accent || "var(--link-accent)"} 35%, var(--border));
  padding-bottom: 0.28em;

  ${({ $variant }) =>
    $variant === "default"
      ? css`
          font-size: 1.35rem;
          margin: 1.25em 0 0.5em;
        `
      : css`
          font-size: 1.02rem;
          margin: 0.85em 0 0.4em;
        `}

  ${({ $variant }) =>
    $variant === "card" &&
    css`
      font-size: 0.95rem;
      margin: 0.5em 0 0.35em;
    `}
`;

const SubHeading = styled.h3<{ $muted?: boolean }>`
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ $muted }) => ($muted ? "var(--text-muted)" : "var(--text-secondary)")};
  margin: 0.75em 0 0.35em;
`;

type MarkdownContentProps = {
  children: string;
  compact?: boolean;
  variant?: Variant;
  accent?: string;
  muted?: boolean;
  /** 카드에서 SectionTitle과 중복되는 첫 h2 숨김 */
  hideTopHeading?: boolean;
  className?: string;
};

export function MarkdownContent({
  children,
  compact = false,
  variant,
  accent,
  muted = false,
  hideTopHeading = false,
  className,
}: MarkdownContentProps) {
  const resolvedVariant: Variant = variant ?? (compact ? "compact" : "default");
  const source = useMemo(() => formatDoctrineMarkdown((children || "").trim()), [children]);

  const components = useMemo<Components>(() => {
    let skippedTopH2 = false;
    return {
      h2: ({ children: headingChildren }) => {
        if (hideTopHeading && !skippedTopH2) {
          skippedTopH2 = true;
          return null;
        }
        return (
          <SectionHeading $variant={resolvedVariant} $accent={accent}>
            {headingChildren}
          </SectionHeading>
        );
      },
      h3: ({ children: headingChildren }) => (
        <SubHeading $muted={muted}>{headingChildren}</SubHeading>
      ),
    };
  }, [resolvedVariant, accent, muted, hideTopHeading]);

  if (!source) return null;

  return (
    <Article $variant={resolvedVariant} $muted={muted} className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </Article>
  );
}
