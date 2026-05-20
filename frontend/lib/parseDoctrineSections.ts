import { formatDoctrineMarkdown, splitSectionHeadingLine } from "@/lib/markdownSections";

export type DoctrineSectionKind = "content" | "evidence" | "reference";

export type DoctrineSection = {
  id: string;
  title: string;
  body: string;
  kind: DoctrineSectionKind;
};

function classifySection(title: string): DoctrineSectionKind {
  const t = title.toLowerCase();
  if (/근거|출처|evidence|참고|문헌|reference/i.test(t)) {
    return /참고|문헌|reference/i.test(t) ? "reference" : "evidence";
  }
  return "content";
}

/** 채팅 본문 카드에서 숨김 — 참고문헌은 사이드 패널에서 표시 */
export function shouldDisplayDoctrineSection(title: string, kind: DoctrineSectionKind): boolean {
  if (kind === "evidence" || kind === "reference") return false;
  const t = title.trim();
  if (!t) return true;
  if (/^근거$/i.test(t) || /^근거\s*출처$/i.test(t)) return false;
  if (/^참고\s*문헌$/i.test(t) || /^출처$/i.test(t) || /^evidence$/i.test(t)) return false;
  return true;
}

function slugify(title: string, index: number): string {
  const base = title.replace(/\s+/g, "-").replace(/[^\w가-힣-]/g, "") || "section";
  return `${base}-${index}`;
}

/** ## 헤더 기준으로 섹션 분리 (3군 카드·접이식 UI용) */
export function parseDoctrineSections(raw: string): DoctrineSection[] {
  const markdown = formatDoctrineMarkdown(raw);
  if (!markdown) return [];

  const chunks = markdown.split(/\n(?=##\s)/).map((c) => c.trim()).filter(Boolean);
  const sections: DoctrineSection[] = [];

  chunks.forEach((chunk, index) => {
    // 제목은 ## 다음 첫 줄 전체 (non-greedy .+? + \\s* 는 「핵심 원칙」→「핵」으로 잘림)
    const h2 = chunk.match(/^##\s+([^\n\r]+)\r?\n?([\s\S]*)$/);
    if (h2) {
      const split = splitSectionHeadingLine(h2[1].trim());
      const title = split.title;
      const bodyParts = [split.bodyLead, (h2[2] || "").trim()].filter(Boolean);
      const body = bodyParts.join("\n\n");
      sections.push({
        id: slugify(title, index),
        title,
        body,
        kind: classifySection(title),
      });
      return;
    }

    if (chunk.startsWith("### ")) {
      const h3 = chunk.match(/^###\s+([^\n\r]+)\r?\n?([\s\S]*)$/);
      if (h3) {
        const title = h3[1].trim();
        sections.push({
          id: slugify(title, index),
          title,
          body: (h3[2] || "").trim(),
          kind: classifySection(title),
        });
        return;
      }
    }

    sections.push({
      id: `preamble-${index}`,
      title: "",
      body: chunk,
      kind: "content",
    });
  });

  return sections.filter((s) => shouldDisplayDoctrineSection(s.title, s.kind));
}
