"use client";

import { DoctrineSearchBar } from "@/components/molecules/DoctrineSearchBar";
import { Icon } from "@/components/atoms/Icon";
import { useEffect, useState } from "react";
import styled from "styled-components";

type SearchHit = {
  doc_id: string;
  title: string;
  year: string;
  page: string;
  snippet: string;
  score: number | null;
};

const RELATED_DOCTRINES = [
  {
    documentNo: "NWP 1",
    title: "Naval Warfare",
    keyword: "Sea Control · Command of the Seas",
    description: "해상통제, 해양 우세, 해군 전투력 운용의 기본 개념을 확인할 때 우선 검토할 교범입니다.",
  },
  {
    documentNo: "NWP 3-30.1",
    title: "Maritime Operations",
    keyword: "Maritime Operations · Sea Denial",
    description: "해상작전 수행, 합동전력 운용, 해상 접근 제한과 관련된 내용을 함께 검토할 수 있습니다.",
  },
  {
    documentNo: "JP 3-32",
    title: "Maritime Security",
    keyword: "Maritime Security · Freedom of Maneuver",
    description: "해양안보, 기동의 자유, 해상 작전환경 판단 요소와 연관된 참고 교범 후보입니다.",
  },
];

const Section = styled.section`
  min-width: 0;
  background: var(--surface);
  padding: 1.5rem;
`;

const Header = styled.div`
  margin-bottom: 1rem;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-primary);
`;

const Description = styled.p`
  margin: 0.5rem 0 0;
  color: var(--text-muted);
  line-height: 1.6;
`;

const SearchArea = styled.div`
  position: sticky;
  top: 0;
  z-index: 2;
  margin-bottom: 1.25rem;
  background: var(--surface);
  padding-bottom: 1rem;
`;

const EmptyGuide = styled.div`
  margin-top: 1.25rem;
  border-radius: 1rem;
  border: 1px dashed var(--border);
  background: var(--surface-muted);
  padding: 2rem;
  text-align: center;
  color: var(--text-muted);
`;

const GuideIcon = styled.div`
  margin: 0 auto 1rem;
  display: flex;
  height: 3.5rem;
  width: 3.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--rank-bg);
  color: var(--branch-accent);
`;

const WarningPage = styled.div`
  margin-top: 1.25rem;
  border-radius: 1.25rem;
  border: 1px solid #fecaca;
  background: linear-gradient(180deg, #fff7ed 0%, #fff 48%, #fef2f2 100%);
  padding: 2.5rem;
  text-align: center;
  box-shadow: 0 18px 35px -32px rgb(127 29 29 / 0.5);
`;

const WarningIcon = styled.div`
  margin: 0 auto 1.25rem;
  display: flex;
  height: 4.5rem;
  width: 4.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid #fca5a5;
  background: #fee2e2;
  color: #b91c1c;
`;

const WarningTitle = styled.h3`
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  color: #991b1b;
`;

const WarningText = styled.p`
  margin: 0.75rem auto 0;
  max-width: 36rem;
  color: #7f1d1d;
  line-height: 1.7;
`;

const QueryBadge = styled.div`
  margin: 1.5rem auto 0;
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 0.5rem;
  border-radius: 9999px;
  border: 1px solid #fed7aa;
  background: #fff7ed;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  color: #9a3412;
`;

const RelatedSection = styled.section`
  margin-top: 1.5rem;
  text-align: left;
`;

const RelatedTitle = styled.h3`
  margin: 0 0 0.875rem;
  font-size: 1.125rem;
  font-weight: 900;
  color: var(--text-primary);
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
`;

const RelatedCard = styled.article`
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  padding: 1rem;
  box-shadow: var(--shadow-raised);
`;

const CardHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
`;

const DocNo = styled.span`
  display: inline-flex;
  border-radius: 9999px;
  background: var(--rank-bg);
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 900;
  color: var(--branch-accent);
`;

const CardTitle = styled.h4`
  margin: 0.75rem 0 0.25rem;
  font-size: 1rem;
  color: var(--text-primary);
`;

const Keyword = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--branch-accent);
`;

const CardText = styled.p`
  margin: 0.75rem 0 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-secondary);
`;

const ResultsSection = styled.section`
  margin-top: 1.25rem;
  text-align: left;
`;

const ResultsTitle = styled.h3`
  margin: 0 0 0.75rem;
  font-size: 1.125rem;
  font-weight: 900;
  color: var(--text-primary);
`;

const HitList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.75rem;
`;

const HitCard = styled.li`
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  padding: 1rem 1.125rem;
  box-shadow: var(--shadow-raised);
`;

const HitMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
`;

const HitTitle = styled.strong`
  font-size: 0.9375rem;
  color: var(--text-primary);
`;

const ScoreBadge = styled.span`
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-secondary);
  background: var(--surface-hover);
  border-radius: 9999px;
  padding: 0.2rem 0.5rem;
`;

const Snippet = styled.p`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--text-secondary);
`;

const LoadingBox = styled.div`
  margin-top: 1.25rem;
  padding: 2rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9375rem;
`;

const InfoBox = styled.div`
  margin-top: 1.25rem;
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  padding: 1.25rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
  line-height: 1.6;
`;

type DoctrineSearchWorkspaceProps = {
  query: string;
  submittedQuery: string;
  searched: boolean;
  branch: "army" | "navy" | "air_force";
  onQueryChange: (value: string) => void;
  onSearch: () => void;
};

export function DoctrineSearchWorkspace({
  query,
  submittedQuery,
  searched,
  branch,
  onQueryChange,
  onSearch,
}: DoctrineSearchWorkspaceProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [indexed, setIndexed] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!searched || !submittedQuery.trim()) {
      setResults([]);
      setHint(null);
      setFetchError(null);
      setLoading(false);
      return;
    }

    const q = submittedQuery.trim();
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setHint(null);

    fetch(`/api/search?q=${encodeURIComponent(q)}&branch=${encodeURIComponent(branch)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as {
          results?: SearchHit[];
          indexed?: boolean;
          hint?: string;
          error?: string;
        };
        if (cancelled) return;
        setResults(Array.isArray(data.results) ? data.results : []);
        setIndexed(data.indexed !== false);
        setHint(typeof data.hint === "string" ? data.hint : null);
        if (data.error && data.error !== "empty_query") {
          setFetchError(data.error);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError("검색 요청에 실패했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searched, submittedQuery, branch]);

  return (
    <Section>
      <SearchArea>
        <Header>
          <Title>교범 검색</Title>
          <Description>
            사전에 인덱싱된 CSV 청크(Chroma)에서 질의와 의미가 비슷한 구절을 찾습니다. 이 탭은 LLM을 호출하지 않습니다.
          </Description>
        </Header>
        <DoctrineSearchBar value={query} onChange={onQueryChange} onSubmit={onSearch} />
      </SearchArea>

      {!searched ? (
        <EmptyGuide>
          <GuideIcon>
            <Icon name="file" size={30} />
          </GuideIcon>
          검색어를 입력하면 Chroma 인덱스에서 관련 청크를 조회합니다.
        </EmptyGuide>
      ) : loading ? (
        <LoadingBox role="status" aria-live="polite">
          검색 중…
        </LoadingBox>
      ) : (
        <>
          <QueryBadge style={{ marginTop: "1.25rem" }}>
            <Icon name="search" size={16} />
            검색어: {submittedQuery}
          </QueryBadge>

          {!indexed && hint ? (
            <InfoBox role="status">
              인덱스가 비어 있습니다. {hint}
            </InfoBox>
          ) : null}

          {fetchError ? (
            <WarningPage role="status">
              <WarningIcon>
                <Icon name="alert" size={38} />
              </WarningIcon>
              <WarningTitle>검색에 문제가 있습니다</WarningTitle>
              <WarningText>{fetchError}</WarningText>
            </WarningPage>
          ) : null}

          {indexed && results.length > 0 ? (
            <ResultsSection>
              <ResultsTitle>검색 결과 ({results.length}건)</ResultsTitle>
              <HitList>
                {results.map((hit, i) => (
                  <HitCard key={`${hit.doc_id}-${i}`}>
                    <HitMeta>
                      <HitTitle>{hit.title}</HitTitle>
                      {hit.score !== null && hit.score !== undefined ? (
                        <ScoreBadge title="Chroma cosine distance">거리 {Number(hit.score).toFixed(4)}</ScoreBadge>
                      ) : null}
                    </HitMeta>
                    <Snippet>{hit.snippet || "—"}</Snippet>
                  </HitCard>
                ))}
              </HitList>
            </ResultsSection>
          ) : null}

          {indexed && !fetchError && results.length === 0 ? (
            <WarningPage role="status" aria-live="polite">
              <WarningIcon>
                <Icon name="alert" size={38} />
              </WarningIcon>
              <WarningTitle>일치하는 청크가 없습니다</WarningTitle>
              <WarningText>
                인덱스에는 문서가 있으나, 이 검색어와 유사한 청크를 찾지 못했습니다. 다른 키워드로 시도해 보세요.
              </WarningText>
            </WarningPage>
          ) : null}

          <RelatedSection>
            <RelatedTitle>연관 교범 후보 (참고)</RelatedTitle>
            <CardGrid>
              {RELATED_DOCTRINES.map((doc) => (
                <RelatedCard key={doc.documentNo}>
                  <CardHead>
                    <DocNo>{doc.documentNo}</DocNo>
                    <Icon name="file" size={20} />
                  </CardHead>
                  <CardTitle>{doc.title}</CardTitle>
                  <Keyword>{doc.keyword}</Keyword>
                  <CardText>{doc.description}</CardText>
                </RelatedCard>
              ))}
            </CardGrid>
          </RelatedSection>
        </>
      )}
    </Section>
  );
}
