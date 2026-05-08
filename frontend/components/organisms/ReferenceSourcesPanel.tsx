"use client";

import { SourceReferenceCard } from "@/components/molecules/SourceReferenceCard";
import type { ChatSourceRow } from "@/lib/types";
import { useMemo, useState } from "react";
import styled from "styled-components";

const Aside = styled.aside`
  border-left: none;
  box-shadow: -1px 0 0 0 var(--layout-divider);
  background: var(--surface-muted);
  padding: 1.25rem;
  min-height: 0;
  overflow-y: auto;
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

const FilterBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.875rem;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? "var(--branch-accent)" : "var(--border)")};
  background: ${({ $active }) => ($active ? "var(--branch-soft)" : "var(--surface)")};
  color: ${({ $active }) => ($active ? "var(--link-accent)" : "var(--text-secondary)")};
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
`;

const GroupWrap = styled.div`
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--surface);
`;

const GroupHead = styled.button`
  width: 100%;
  border: none;
  background: var(--surface-muted);
  color: var(--text-primary);
  text-align: left;
  padding: 0.75rem;
  font-size: 0.875rem;
  font-weight: 800;
  cursor: pointer;
`;

const GroupBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
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
  const [activeBranch, setActiveBranch] = useState<"all" | "army" | "navy" | "air_force">("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const filteredSources = useMemo(() => {
    if (activeBranch === "all") return sources;
    return sources.filter((s) => s.serviceBranch === activeBranch);
  }, [sources, activeBranch]);

  const grouped = useMemo(() => {
    const order: Array<"army" | "navy" | "air_force" | "unknown"> = ["army", "navy", "air_force", "unknown"];
    const labels: Record<string, string> = {
      army: "육군",
      navy: "해군",
      air_force: "공군",
      unknown: "기타",
    };
    const m = new Map<string, ChatSourceRow[]>();
    for (const src of filteredSources) {
      const key = src.serviceBranch ?? "unknown";
      m.set(key, [...(m.get(key) ?? []), src]);
    }
    return order
      .filter((k) => m.has(k))
      .map((k) => ({ key: k, label: labels[k], rows: m.get(k) ?? [] }))
      .filter((g) => g.rows.length > 0);
  }, [filteredSources]);

  return (
    <Aside>
      <Head>
        <HeadTitle>참고 출처 ({filteredSources.length})</HeadTitle>
      </Head>
      <FilterBar>
        <FilterButton type="button" $active={activeBranch === "all"} onClick={() => setActiveBranch("all")}>
          전체
        </FilterButton>
        <FilterButton type="button" $active={activeBranch === "army"} onClick={() => setActiveBranch("army")}>
          육군
        </FilterButton>
        <FilterButton type="button" $active={activeBranch === "navy"} onClick={() => setActiveBranch("navy")}>
          해군
        </FilterButton>
        <FilterButton
          type="button"
          $active={activeBranch === "air_force"}
          onClick={() => setActiveBranch("air_force")}
        >
          공군
        </FilterButton>
      </FilterBar>

      <CardList>
        {filteredSources.length === 0 ? (
          <EmptyHint>질문을 내면 검색된 청크가 여기에 표시됩니다.</EmptyHint>
        ) : (
          grouped.map((group) => {
            const isCollapsed = Boolean(collapsedGroups[group.key]);
            return (
              <GroupWrap key={group.key}>
                <GroupHead
                  type="button"
                  onClick={() =>
                    setCollapsedGroups((prev) => ({
                      ...prev,
                      [group.key]: !prev[group.key],
                    }))
                  }
                >
                  {group.label} 출처 {group.rows.length}건 {isCollapsed ? "펼치기" : "접기"}
                </GroupHead>
                {!isCollapsed && (
                  <GroupBody>
                    {group.rows.map((source) => (
                      <SourceReferenceCard key={`${group.key}-${source.docId}-${source.rank}`} source={source} />
                    ))}
                  </GroupBody>
                )}
              </GroupWrap>
            );
          })
        )}
      </CardList>

      <ViewAllButton type="button" disabled={filteredSources.length === 0}>
        모든 출처 보기
      </ViewAllButton>
    </Aside>
  );
}
