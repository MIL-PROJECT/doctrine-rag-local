/** RAG 답변 필수 섹션 — 단독 줄이면 Markdown h2로 승격 (스트림·구형 출력 대응) */
const SECTION_TITLES = new Set([
  "개요",
  "핵심 원칙",
  "핵심원칙",
  "운용 절차",
  "운용절차",
  "지휘관 고려사항",
  "지휘관고려사항",
  "유의사항",
  "유의 사항",
  "근거",
  "합동 비교 종합",
]);

function normalizeSectionCore(line: string): string {
  let core = line.trim();
  core = core.replace(/^#+\s*/, "");
  core = core.replace(/^(?:\d+[.)]\s*)+/, "");
  core = core.replace(/[:：]\s*$/, "").trim();
  return core;
}

export function ensureMarkdownSectionHeadings(text: string): string {
  if (!text?.trim()) return text || "";

  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;

    const core = normalizeSectionCore(trimmed);
    if (!SECTION_TITLES.has(core)) return line;

    return `## ${core}`;
  }).join("\n");
}
