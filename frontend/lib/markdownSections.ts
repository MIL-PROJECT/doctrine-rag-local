/** RAG·합동 답변 Markdown 전처리 — UI 가독성용 */

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

const SECTION_TITLE_PATTERN =
  "개요|핵심\\s*원칙|운용\\s*절차|지휘관\\s*고려\\s*사항|유의\\s*사항|근거";

const EMBEDDED_BOLD_SECTION_RE = new RegExp(
  `\\*\\*\\s*(${SECTION_TITLE_PATTERN})\\s*\\*\\*\\s*[-–:：]?\\s*`,
  "gi",
);

const EVIDENCE_HEADING_RE = /^\[(근거\s*출처|참고\s*문헌|출처|Evidence[^\]]*)\]\s*(.*)$/i;

/** 줄/문장 중간에 붙은 소제목 앞에 줄바꿈 삽입 (앞 글자가 한글이면 단어 안쪽 「정보개요」 등은 제외) */
const INLINE_SECTION_SPLIT_RE = new RegExp(
  `(^|[.!?。…]\\s*|\\n\\s*)(?<![가-힣])(${SECTION_TITLE_PATTERN})(\\s+)(?![#:\\-])`,
  "gi",
);

function canonicalSectionTitle(raw: string): string {
  const core = normalizeSectionCore(raw);
  if (SECTION_TITLES.has(core)) return core;
  if (core.replace(/\s/g, "") === "핵심원칙") return "핵심 원칙";
  if (core.replace(/\s/g, "") === "운용절차") return "운용 절차";
  if (core.replace(/\s/g, "") === "지휘관고려사항") return "지휘관 고려사항";
  return core;
}

function normalizeSectionCore(line: string): string {
  let core = line.trim();
  core = core.replace(/^#+\s*/, "");
  core = core.replace(/^(?:\d+[.)]\s*)+/, "");
  core = core.replace(/[:：]\s*$/, "").trim();
  core = core.replace(/\*\*/g, "");
  return core.replace(/\s+/g, " ").trim();
}

/** `근거 ## 핵심` 같은 중복·깨진 헤더 정리 */
function normalizeHashMarkers(text: string): string {
  let out = text.replace(/\s+##\s+/g, "\n\n## ");
  out = out.replace(/##\s*##+/g, "##");
  out = out.replace(
    new RegExp(`(##\\s*근거)\\s+##\\s+`, "gi"),
    "$1\n\n## ",
  );
  return out;
}

/**
 * `## 운용 절차 1. 항목…` 처럼 제목과 번호 목록이 한 줄에 붙은 경우 분리
 * (카드 UI에서 제목에 `1.` 본문이 합쳐지는 문제 방지)
 */
/** `## 개요 본문…` 한 줄 헤더 → 제목 줄 + 본문 (해군 등 단일 줄 응답 대응) */
function splitHeadingLineBody(text: string): string {
  const lineRe = new RegExp(
    `^(#{2,3}\\s+)(${SECTION_TITLE_PATTERN})\\s+(.+)$`,
    "i",
  );
  const plainRe = new RegExp(`^(${SECTION_TITLE_PATTERN})\\s+(.+)$`, "i");

  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      let hashes = "";
      let titleRaw = "";
      let rest = "";

      const h = trimmed.match(lineRe);
      if (h) {
        hashes = h[1];
        titleRaw = h[2];
        rest = h[3].trim();
      } else if (!trimmed.startsWith("#")) {
        const p = trimmed.match(plainRe);
        if (p) {
          hashes = "## ";
          titleRaw = p[1];
          rest = p[2].trim();
        }
      }

      if (!titleRaw || !rest) return line;

      const title = canonicalSectionTitle(titleRaw.replace(/\s+/g, " "));
      if (!SECTION_TITLES.has(title)) return line;

      const body =
        /^\d+\.\s/.test(rest) || /^[-*•]\s/.test(rest) ? rest : rest.startsWith("- ") ? rest : `- ${rest}`;

      return `${hashes}${title}\n\n${body}`;
    })
    .join("\n");
}

function splitHeadingFromNumberedList(text: string): string {
  const headNum = new RegExp(
    `^(##\\s+|###\\s+)(${SECTION_TITLE_PATTERN})\\s+(\\d+\\.\\s)`,
    "gim",
  );
  let out = text.replace(headNum, (_m, hashes: string, title: string, num: string) => {
    const c = canonicalSectionTitle(title.replace(/\s+/g, " "));
    return SECTION_TITLES.has(c) ? `${hashes}${c}\n\n${num}` : _m;
  });

  const boldNum = new RegExp(
    `^\\*\\*\\s*(${SECTION_TITLE_PATTERN})\\s*\\*\\*\\s+(\\d+\\.\\s)`,
    "gim",
  );
  out = out.replace(boldNum, (_m, title: string, num: string) => {
    const c = canonicalSectionTitle(title.replace(/\s+/g, " "));
    return SECTION_TITLES.has(c) ? `## ${c}\n\n${num}` : _m;
  });

  const plainNum = new RegExp(`^(${SECTION_TITLE_PATTERN})\\s+(\\d+\\.\\s)`, "gim");
  out = out.replace(plainNum, (_m, title: string, num: string) => {
    const trimmed = _m.trim();
    if (trimmed.startsWith("#")) return _m;
    const c = canonicalSectionTitle(title.replace(/\s+/g, " "));
    return SECTION_TITLES.has(c) ? `## ${c}\n\n${num}` : _m;
  });

  return out;
}

function splitInlineSectionTitles(text: string): string {
  return text.replace(INLINE_SECTION_SPLIT_RE, (_match, before: string, title: string, _sp: string) => {
    const canonical = canonicalSectionTitle(title);
    if (!SECTION_TITLES.has(canonical)) return _match;
    const prefix = before && /[.!?。…]/.test(before) ? before : before || "";
    return `${prefix}\n\n## ${canonical}\n\n`;
  });
}

function splitEmbeddedBoldSections(text: string): string {
  return text.replace(
    EMBEDDED_BOLD_SECTION_RE,
    (_match, title: string) => `\n\n## ${canonicalSectionTitle(title)}\n\n`,
  );
}

/** `...문장 1. 첫째 2. 둘째` → 번호 목록 줄바꿈 (JP 3-0 등은 유지) */
function splitInlineNumberedLists(text: string): string {
  return text
    .replace(/([.!?。…])\s+(\d+)\.\s+/g, "$1\n\n$2. ")
    .replace(/\n(\d+)\.\s+/g, "\n\n$1. ");
}

/** `- 항목` 이 한 줄에 연속될 때 분리 */
function splitInlineBulletLists(text: string): string {
  return text.replace(/([.!?。…])\s+-\s+/g, "$1\n\n- ").replace(/(\S)\s+-\s+(?=[가-힣A-Za-z])/g, "$1\n\n- ");
}

function promoteStandaloneHeadings(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;

      const core = normalizeSectionCore(trimmed);
      if (SECTION_TITLES.has(core)) return `## ${core}`;

      const boldInline = trimmed.match(
        new RegExp(`^\\*\\*\\s*(${SECTION_TITLE_PATTERN})\\s*\\*\\*\\s*[-–:：]?\\s*(.*)$`, "i"),
      );
      if (boldInline) {
        const title = canonicalSectionTitle(boldInline[1]);
        const rest = (boldInline[2] || "").trim();
        if (SECTION_TITLES.has(title)) {
          return rest ? `## ${title}\n\n- ${rest}` : `## ${title}`;
        }
      }

      const plainInline = trimmed.match(
        new RegExp(`^(${SECTION_TITLE_PATTERN})\\s*[-–:：]\\s*(.+)$`, "i"),
      );
      if (plainInline) {
        const title = canonicalSectionTitle(plainInline[1]);
        const rest = plainInline[2].trim();
        if (SECTION_TITLES.has(title)) {
          return `## ${title}\n\n- ${rest}`;
        }
      }

      const plainSpace = trimmed.match(
        new RegExp(`^(${SECTION_TITLE_PATTERN})\\s+(.+)$`, "i"),
      );
      if (plainSpace && !trimmed.startsWith("#")) {
        const title = canonicalSectionTitle(plainSpace[1]);
        const rest = plainSpace[2].trim();
        if (SECTION_TITLES.has(title) && rest.length > 1) {
          const body =
            /^\d+\.\s/.test(rest) || /^[-*•]\s/.test(rest) ? rest : `- ${rest}`;
          return `## ${title}\n\n${body}`;
        }
      }

      const evidence = trimmed.match(EVIDENCE_HEADING_RE);
      if (evidence) {
        const title = evidence[1].trim();
        const rest = evidence[2].trim();
        return rest ? `### ${title}\n\n${rest}` : `### ${title}`;
      }

      return line;
    })
    .join("\n");
}

function ensureListSpacing(text: string): string {
  return text
    .replace(/([^\n])\n([-*•]\s)/g, "$1\n\n$2")
    .replace(/([^\n])\n(\d+\.\s)/g, "$1\n\n$2");
}

function collapseExtraBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** UI 본문에서 ## 근거·출처 블록 제거 (참고문헌 패널과 중복) */
function stripEvidenceSectionsFromMarkdown(text: string): string {
  let out = text;
  out = out.replace(/\n##\s*근거\s*\n[\s\S]*?(?=\n##\s|$)/gi, "\n");
  out = out.replace(
    /\n###\s*(?:근거\s*출처|참고\s*문헌|출처|Evidence[^\n]*)\s*\n[\s\S]*?(?=\n##\s|$)/gi,
    "\n",
  );
  out = out.replace(/\n\[(?:근거\s*출처|참고\s*문헌|출처)\][\s\S]*$/gi, "");
  return out.trim();
}

/** ## 유의사항 안의 `1.` `2.` → `-` 불릿 */
function numberedListsToBulletsInPrecautions(text: string): string {
  let inPrecautions = false;
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      const h2 = trimmed.match(/^##\s+(.+)$/);
      if (h2) {
        const core = normalizeSectionCore(h2[1]);
        inPrecautions = core === "유의사항" || core === "유의 사항";
        return line;
      }
      if (inPrecautions && /^\s*\d+[.)]\s+/.test(line)) {
        return line.replace(/^\s*\d+[.)]\s+/, "- ");
      }
      return line;
    })
    .join("\n");
}

/** 채팅·카드 UI용 최종 Markdown */
export function formatDoctrineMarkdown(text: string): string {
  if (!text?.trim()) return text || "";

  let out = text.trim();
  out = normalizeHashMarkers(out);
  out = splitHeadingLineBody(out);
  out = splitHeadingFromNumberedList(out);
  out = splitEmbeddedBoldSections(out);
  out = splitInlineSectionTitles(out);
  out = splitInlineNumberedLists(out);
  out = splitInlineBulletLists(out);
  out = promoteStandaloneHeadings(out);
  out = splitHeadingLineBody(out);
  out = splitHeadingFromNumberedList(out);
  out = normalizeHashMarkers(out);
  out = ensureListSpacing(out);
  out = numberedListsToBulletsInPrecautions(out);
  out = stripEvidenceSectionsFromMarkdown(out);
  return collapseExtraBlankLines(out);
}

/** @deprecated — formatDoctrineMarkdown 사용 */
export function ensureMarkdownSectionHeadings(text: string): string {
  return formatDoctrineMarkdown(text);
}

/** `## 개요 본문…` 파싱 시 제목 줄에 붙은 본문 분리 */
export function splitSectionHeadingLine(headingLine: string): {
  title: string;
  bodyLead: string;
} {
  const raw = headingLine.trim();
  if (!raw) return { title: "", bodyLead: "" };

  const core = normalizeSectionCore(raw);
  if (SECTION_TITLES.has(core)) return { title: core, bodyLead: "" };

  const ordered = [...SECTION_TITLES].sort((a, b) => b.length - a.length);
  for (const name of ordered) {
    if (name === "합동 비교 종합") continue;
    const re = new RegExp(`^(${name.replace(/\s+/g, "\\s+")})\\s+(.+)$`, "i");
    const m = raw.match(re);
    if (m) {
      return { title: canonicalSectionTitle(m[1]), bodyLead: m[2].trim() };
    }
  }

  return { title: raw, bodyLead: "" };
}
