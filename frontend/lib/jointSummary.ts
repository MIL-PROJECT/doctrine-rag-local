/** 3군 비교 요약 파싱·압축 — 군별 1줄만 */

export const JOINT_LABEL_ORDER = ["공통", "육군", "해군", "공군", "합동"] as const;
export const JOINT_DISPLAY_ORDER = ["육군", "해군", "공군"] as const;
export type JointLabel = (typeof JOINT_LABEL_ORDER)[number];

export type JointSummaryItem = { label: JointLabel; text: string };

const JOINT_BULLET_RE =
  /^[-*•]\s*\*\*(공통|육군|해군|공군|합동)\s*:\*\*\s*(.+)$|^[-*•]\s*(공통|육군|해군|공군|합동)\s*[:：]\s*(.+)$|^(공통|육군|해군|공군|합동)\s*[:：]\s*(.+)$/i;

const INLINE_LABEL_RE = /(공통|육군|해군|공군|합동)\s*(?:은|:|：)\s*/gi;

const PLACEHOLDER_RE =
  /^\(.*문장.*\)$|비교\s*종합|핵심\s*\d+\s*문장|^\s*[-–—]\s*$/i;

const SECTION_NOISE_RE =
  /^(?:#+\s*)?(?:개요|핵심\s*원칙|운용\s*절차|지휘관\s*고려\s*사항|유의\s*사항|근거)\s*[:：]?\s*$/i;

const SECTION_INLINE_RE =
  /(?:^|\s)(?:개요|핵심\s*원칙|운용\s*절차|지휘관\s*고려\s*사항|유의\s*사항|근거)\s*[:：]?\s*/gi;

/** 군별 카드 본문 → 한 줄 요약 (개요 섹션 우선, 소제목 문자열 제거) */
export function extractBranchOneLiner(branchBody: string, maxChars = 110): string {
  if (!branchBody?.trim()) return "";

  const overview = branchBody.match(/##\s*개요\s*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/i);
  let raw = (overview?.[1] || branchBody).trim();

  raw = raw
    .replace(/^#+\s*\S+\s*$/gm, "")
    .replace(SECTION_INLINE_RE, " ")
    .replace(/^[-*•]\s*/gm, "")
    .replace(/\*\*/g, "");

  return compactJointLine(raw, maxChars);
}

export function buildJointSummaryFromBranches(
  sections: { label: JointLabel; body: string }[],
): JointSummaryItem[] {
  return JOINT_DISPLAY_ORDER.map((label) => {
    const sec = sections.find((s) => s.label === label);
    const text = sec ? extractBranchOneLiner(sec.body) : "";
    return { label, text };
  }).filter((item) => item.text.length > 0);
}

function cleanJointText(text: string): string {
  return (text || "")
    .replace(/^#+\s*\S+\s*/gm, "")
    .replace(/^[-*•]\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(SECTION_INLINE_RE, " ")
    .replace(PLACEHOLDER_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 본문 1문장(약 110자)으로 압축 */
export function compactJointLine(text: string, maxChars = 110): string {
  let t = cleanJointText(text);
  if (!t || SECTION_NOISE_RE.test(t) || PLACEHOLDER_RE.test(t)) return "";
  if (/^(?:개요|핵심|운용|지휘관|유의|근거)$/i.test(t)) return "";

  const sentences = t.split(/(?<=[.!?。])\s+/).filter(Boolean);
  let out = sentences[0] || t;
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf(" "), cut.lastIndexOf("。"));
    out = (last > 40 ? cut.slice(0, last + 1) : cut).trim() + "…";
  }
  if (out && !/[.!?。…]$/.test(out)) out += ".";
  return out;
}

function parseFromLines(body: string): Map<JointLabel, string> {
  const byLabel = new Map<JointLabel, string>();

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || SECTION_NOISE_RE.test(trimmed)) continue;
    if (/^##\s/.test(trimmed)) continue;

    const m = trimmed.match(JOINT_BULLET_RE);
    if (m) {
      const label = (m[1] || m[3] || m[5] || "").trim() as JointLabel;
      const raw = (m[2] || m[4] || m[6] || "").trim();
      if (!label || !JOINT_LABEL_ORDER.includes(label)) continue;
      if (SECTION_NOISE_RE.test(raw) || /^개요$/i.test(raw)) continue;
      const prev = byLabel.get(label) || "";
      byLabel.set(label, prev ? `${prev} ${raw}` : raw);
    }
  }
  return byLabel;
}

function parseFromInline(body: string): Map<JointLabel, string> {
  const byLabel = new Map<JointLabel, string>();
  let text = body
    .replace(/##\s*합동\s*비교\s*종합/gi, " ")
    .replace(/합동\s*비교\s*종합/gi, " ")
    .replace(/공통\s*비교\s*종합/gi, " ")
    .replace(SECTION_INLINE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  const matches = [...text.matchAll(INLINE_LABEL_RE)];
  if (matches.length === 0) return byLabel;

  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const label = m[1] as JointLabel;
    if (!JOINT_LABEL_ORDER.includes(label)) continue;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    let chunk = text.slice(start, end).trim();
    chunk = chunk.replace(/^(?:이며|이고|며|고|그리고)\s+/i, "");
    if (chunk && !SECTION_NOISE_RE.test(chunk)) {
      const prev = byLabel.get(label) || "";
      byLabel.set(label, prev ? `${prev} ${chunk}` : chunk);
    }
  }
  return byLabel;
}

function toItems(byLabel: Map<JointLabel, string>): JointSummaryItem[] {
  return JOINT_DISPLAY_ORDER.filter((l) => byLabel.has(l))
    .map((label) => ({
      label,
      text: compactJointLine(byLabel.get(label) || ""),
    }))
    .filter((item) => item.text && !PLACEHOLDER_RE.test(item.text));
}

export function parseJointSummaryItems(body: string): JointSummaryItem[] {
  if (!body?.trim()) return [];

  const fromLines = toItems(parseFromLines(body));
  if (fromLines.length >= 2) return fromLines;

  const fromInline = toItems(parseFromInline(body));
  return fromInline;
}

/** LLM 요약이 깨졌을 때 판별 */
export function isUsableJointSummary(items: JointSummaryItem[]): boolean {
  if (items.length < 3) return false;
  return items.every(
    (i) =>
      JOINT_DISPLAY_ORDER.includes(i.label as (typeof JOINT_DISPLAY_ORDER)[number]) &&
      i.text.length > 8 &&
      !SECTION_NOISE_RE.test(i.text) &&
      !/\b개요\b/.test(i.text),
  );
}
