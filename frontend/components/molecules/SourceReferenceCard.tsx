"use client";

import { Icon } from "@/components/atoms/Icon";
import type { ChatSourceRow } from "@/lib/types";
import styled from "styled-components";

const Article = styled.article`
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 1rem;
  box-shadow: var(--shadow-raised);
`;

const Top = styled.div`
  margin-bottom: 0.75rem;
  display: flex;
  gap: 0.75rem;
`;

const Rank = styled.div`
  display: flex;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: var(--rank-bg);
  font-weight: 700;
  color: var(--branch-accent);
`;

const MetaBlock = styled.div`
  min-width: 0;
  flex: 1;
`;

const Title = styled.h3`
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-weight: 700;
  color: var(--text-primary);
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const MetaLine = styled.div`
  margin-top: 0.25rem;
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
  font-size: 0.875rem;
  color: var(--text-muted);
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const Quote = styled.p`
  margin: 0 0 1rem;
  font-size: 0.875rem;
  font-style: italic;
  line-height: 1.5rem;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const Footer = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
`;

const Score = styled.span`
  font-size: 0.875rem;
  color: var(--text-muted);
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const MetaLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--link-accent);
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    background: var(--control-hover);
  }
`;

type SourceReferenceCardProps = {
  source: ChatSourceRow;
};

export function SourceReferenceCard({ source }: SourceReferenceCardProps) {
  return (
    <Article>
      <Top>
        <Rank>{source.rank}</Rank>
        <MetaBlock>
          <Title>{source.title}</Title>
          <MetaLine>
            <span>{source.year}</span>
            <span>{source.page}</span>
          </MetaLine>
        </MetaBlock>
      </Top>
      <Quote>“{source.quote}”</Quote>
      <Footer>
        <Score>거리(L2): {source.score}</Score>
        <MetaLink href={`/api/sources/${source.docId}/pdf?page=${encodeURIComponent(source.page)}`}>
          메타데이터 <Icon name="external" size={16} />
        </MetaLink>
      </Footer>
    </Article>
  );
}
