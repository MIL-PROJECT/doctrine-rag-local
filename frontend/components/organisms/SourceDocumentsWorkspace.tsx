"use client";

import { UploadDropzone } from "@/components/molecules/UploadDropzone";
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

type SourceDocumentRow = {
  id: string;
  doctrineName: string;
  keyword: string;
  documentNo: string;
  status: string;
};

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
  font-weight: 900;
  color: var(--text-primary);
`;

const Description = styled.p`
  margin: 0.5rem 0 0;
  color: var(--text-muted);
  line-height: 1.6;
`;

const Stack = styled.div`
  display: grid;
  gap: 1.25rem;
`;

const FilterCard = styled.div`
  display: grid;
  gap: 0.75rem;
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  padding: 1rem;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const FilterField = styled.label`
  display: grid;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 800;
  color: var(--text-secondary-contrast);
`;

const Select = styled.select`
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--input-bg);
  padding: 0.75rem 0.875rem;
  font-size: 0.9375rem;
  color: var(--text-primary);
  outline: none;

  &:focus {
    border-color: var(--branch-accent);
    box-shadow: 0 0 0 3px rgb(96 165 250 / 0.18);
  }
`;

const SearchInput = styled.input`
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--input-bg);
  padding: 0.75rem 0.875rem;
  font-size: 0.9375rem;
  color: var(--text-primary);
  outline: none;

  &:focus {
    border-color: var(--branch-accent);
    box-shadow: 0 0 0 3px rgb(96 165 250 / 0.18);
  }
`;

const TableCard = styled.div`
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  box-shadow: var(--shadow-raised);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
`;

const Th = styled.th`
  border-bottom: 1px solid var(--border);
  background: var(--surface-hover);
  padding: 0.875rem 1rem;
  text-align: left;
  font-weight: 900;
  color: var(--text-secondary-contrast);
`;

const Td = styled.td`
  border-bottom: 1px solid var(--border);
  padding: 0.875rem 1rem;
  color: var(--text-secondary);
  vertical-align: top;
`;

const DocTitle = styled.span`
  font-weight: 800;
  color: var(--text-primary);
`;

const Badge = styled.span`
  display: inline-flex;
  border-radius: 9999px;
  background: var(--rank-bg);
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 900;
  color: var(--branch-accent);
`;

const Status = styled.span`
  display: inline-flex;
  border-radius: 9999px;
  background: var(--rank-bg);
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 900;
  color: var(--text-secondary);
`;

const TableFooter = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-top: 1px solid var(--border);
  background: var(--surface-hover);
  padding: 0.875rem 1rem;
`;

const PageInfo = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-weight: 800;
  color: var(--text-secondary);
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  min-width: 2.25rem;
  height: 2.25rem;
  border: 1px solid ${({ $active }) => ($active ? "var(--branch-accent)" : "var(--border)")};
  border-radius: 0.65rem;
  background: ${({ $active }) => ($active ? "var(--branch-accent)" : "var(--control-bg)")};
  color: ${({ $active }) => ($active ? "#fff" : "var(--text-secondary-contrast)")};
  font-size: 0.875rem;
  font-weight: 900;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const EmptyCard = styled.div`
  border-radius: 1rem;
  border: 1px dashed var(--border);
  background: var(--surface-muted);
  padding: 2rem;
  text-align: center;
  color: var(--text-muted);
`;

const UploadSection = styled.div`
  display: grid;
  gap: 1rem;
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 900;
  color: var(--text-primary);
`;

const Notice = styled.div`
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  padding: 1rem;
  color: var(--text-secondary);
`;

const NoticeTitle = styled.p`
  margin: 0 0 0.5rem;
  font-weight: 900;
  color: var(--text-primary);
`;

const NoticeText = styled.p`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
`;

type SourceDocumentsWorkspaceProps = {
  query: string;
  branch: "army" | "navy" | "air_force";
  selectedFileName?: string;
  onQueryChange: (value: string) => void;
  onFileSelect: (file: File) => void;
};

export function SourceDocumentsWorkspace({
  query,
  branch,
  selectedFileName,
  onQueryChange,
  onFileSelect,
}: SourceDocumentsWorkspaceProps) {
  const [documents, setDocuments] = useState<SourceDocumentRow[]>([]);
  const [keywordFilter, setKeywordFilter] = useState("전체");
  const [documentNoFilter, setDocumentNoFilter] = useState("전체");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 10;

  const keywordOptions = useMemo(() => {
    const values = documents.flatMap((doc) => doc.keyword.split(",").map((keyword) => keyword.trim())).filter(Boolean);
    return ["전체", ...Array.from(new Set(values))];
  }, [documents]);

  const documentNoOptions = useMemo(() => ["전체", ...documents.map((doc) => doc.documentNo)], [documents]);

  const rows = documents.filter((doc) => {
    const textQuery = query.trim().toLowerCase();
    const keywordMatched = keywordFilter === "전체" || doc.keyword.includes(keywordFilter);
    const documentNoMatched = documentNoFilter === "전체" || doc.documentNo === documentNoFilter;
    const textMatched =
      !textQuery ||
      doc.doctrineName.toLowerCase().includes(textQuery) ||
      doc.keyword.toLowerCase().includes(textQuery) ||
      doc.documentNo.toLowerCase().includes(textQuery);
    return keywordMatched && documentNoMatched && textMatched;
  });

  function handleUpload(file: File) {
    onFileSelect(file);

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const extension = file.name.split(".").pop()?.toUpperCase() || "FILE";
    const nextNo = `UPLOAD-${String(documents.length + 1).padStart(3, "0")}`;

    setDocuments((prev) => [
      {
        id: `uploaded-${Date.now()}`,
        doctrineName: baseName,
        keyword: `업로드, ${extension}, 교범`,
        documentNo: nextNo,
        status: "로컬 업로드(미인덱싱)",
      },
      ...prev,
    ]);
    setKeywordFilter("전체");
    setDocumentNoFilter("전체");
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageStartIndex = (currentPage - 1) * pageSize;
  const pagedRows = rows.slice(pageStartIndex, pageStartIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [keywordFilter, documentNoFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    let disposed = false;
    async function loadDocuments() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/source-documents?branch=${encodeURIComponent(branch)}`, { cache: "no-store" });
        const data = (await res.json()) as {
          documents?: Array<{
            doc_id?: string;
            title?: string;
            source?: string | null;
            document_no?: string;
            chunk_count?: number;
            keywords?: string[];
          }>;
          error?: string;
        };
        if (!res.ok || data.error) {
          throw new Error(data.error || "문서 목록 조회 실패");
        }
        const mapped = (data.documents ?? []).map((doc, index) => ({
          id: String(doc.doc_id ?? `doc-${index + 1}`),
          doctrineName: String(doc.title ?? doc.source ?? `문서 ${index + 1}`),
          keyword: (doc.keywords ?? []).length > 0 ? (doc.keywords ?? []).join(", ") : "메타데이터 없음",
          documentNo: String(doc.document_no ?? doc.doc_id ?? `DOC-${index + 1}`),
          status: `인덱싱 완료 (${Number(doc.chunk_count ?? 0)} chunks)`,
        }));
        if (!disposed) {
          setDocuments(mapped);
          setCurrentPage(1);
          setKeywordFilter("전체");
          setDocumentNoFilter("전체");
        }
      } catch (e) {
        if (!disposed) {
          setDocuments([]);
          setError(e instanceof Error ? e.message : "문서 목록 조회 실패");
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    loadDocuments();
    return () => {
      disposed = true;
    };
  }, [branch]);

  return (
    <Section>
      <Stack>
        <Header>
          <Title>출처 문서</Title>
          <Description>교범명, 키워드, 문서번호 기준으로 출처 문서를 관리하고 hwp, docx, pdf 파일을 업로드합니다.</Description>
        </Header>

        <FilterCard aria-label="출처 문서 검색">
          <FilterField>
            통합 검색
            <SearchInput
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="교범명, 키워드, 문서번호 검색"
            />
          </FilterField>
        </FilterCard>

        <FilterCard aria-label="출처 문서 필터">
          <FilterField>
            키워드 필터
            <Select value={keywordFilter} onChange={(event) => setKeywordFilter(event.target.value)}>
              {keywordOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField>
            문서번호 필터
            <Select value={documentNoFilter} onChange={(event) => setDocumentNoFilter(event.target.value)}>
              {documentNoOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
          </FilterField>
        </FilterCard>

        {loading ? (
          <EmptyCard>인덱싱된 문서 목록을 불러오는 중입니다.</EmptyCard>
        ) : error ? (
          <EmptyCard>문서 목록 조회 실패: {error}</EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>선택한 필터와 일치하는 출처 문서가 없습니다.</EmptyCard>
        ) : (
          <TableCard>
            <Table>
              <thead>
                <tr>
                  <Th>교범명</Th>
                  <Th>키워드</Th>
                  <Th>문서번호</Th>
                  <Th>상태</Th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((doc) => (
                  <tr key={doc.id}>
                    <Td><DocTitle>{doc.doctrineName}</DocTitle></Td>
                    <Td>{doc.keyword}</Td>
                    <Td><Badge>{doc.documentNo}</Badge></Td>
                    <Td><Status>{doc.status}</Status></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <TableFooter>
              <PageInfo>
                총 {rows.length}개 / {currentPage} of {totalPages} 페이지 · 페이지당 10개
              </PageInfo>
              <Pagination aria-label="출처 문서 페이지 이동">
                <PageButton type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                  이전
                </PageButton>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                  <PageButton key={page} type="button" $active={page === currentPage} onClick={() => setCurrentPage(page)}>
                    {page}
                  </PageButton>
                ))}
                <PageButton type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
                  다음
                </PageButton>
              </Pagination>
            </TableFooter>
          </TableCard>
        )}

        <UploadSection>
          <SectionTitle>교범 업로드</SectionTitle>
          <UploadDropzone selectedFileName={selectedFileName} onFileSelect={handleUpload} />
        </UploadSection>

        <Notice>
          <NoticeTitle>데모 UI 안내</NoticeTitle>
          <NoticeText>
            이 탭의 목록은 실제 백엔드 인덱스(군별 컬렉션 메타데이터)에서 불러옵니다. 업로드 버튼으로 추가한 항목은 브라우저 예시 상태이며, 실제 RAG 인덱스는{" "}
            <code style={{ fontSize: "0.8em" }}>data/chunks/*.csv</code> 를 넣고 서버를 재시작하거나{" "}
            <code style={{ fontSize: "0.8em" }}>DELETE /reset</code> 으로 재인제스트할 때 갱신됩니다. 공개 업로드 API는 없습니다.
          </NoticeText>
        </Notice>
      </Stack>
    </Section>
  );
}
