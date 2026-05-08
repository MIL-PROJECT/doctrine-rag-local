"use client";

import { SourceReferenceCard } from "@/components/molecules/SourceReferenceCard";
import type { ChatSourceRow } from "@/lib/types";
import styled from "styled-components";

const Aside = styled.aside`
  border-left: none;
  box-shadow: -1px 0 0 0 var(--layout-divider);
  background: var(--surface-muted);
  padding: 1.25rem;
`;

const Head = styled.div`
  margin-bottom: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: flex-start;
`;

const HeadTitle = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
`;

const CardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const EmptyHint = styled.p`
  margin: 0;
  border-radius: 0.75rem;
  border: 1px dashed var(--border);
  background: var(--surface);
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--text-muted);
`;

const ViewAllButton = styled.button`
  margin-top: 1rem;
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--control-bg);
  padding: 0.75rem;
  font-weight: 700;
  color: var(--link-accent);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: var(--control-hover);
  }
`;

type ReferenceSourcesPanelProps = {
  sources: ChatSourceRow[];
};

export function ReferenceSourcesPanel({ sources }: ReferenceSourcesPanelProps) {
  return (
    <Aside>
      <Head>
        <HeadTitle>참고 출처 ({sources.length})</HeadTitle>
      </Head>

      <CardList>
        {sources.length === 0 ? (
          <EmptyHint>질문을 내면 검색된 청크가 여기에 표시됩니다.</EmptyHint>
        ) : (
          sources.map((source) => <SourceReferenceCard key={`${source.docId}-${source.rank}`} source={source} />)
        )}
      </CardList>

      <ViewAllButton type="button" disabled={sources.length === 0}>
        모든 출처 보기
      </ViewAllButton>
    </Aside>
  );
}
