import type { BranchId } from "@/lib/types";

export type BranchUiLabel = "육군" | "해군" | "공군";

export type BranchUiTheme = {
  accent: string;
  fill: string;
  fillMuted: string;
};

/** 카드·섹션 블록용 군별 색 (페이지 --branch-accent 와 분리) */
export const BRANCH_UI_THEME: Record<BranchUiLabel, BranchUiTheme> = {
  육군: { accent: "#15803d", fill: "#f0fdf4", fillMuted: "#dcfce7" },
  해군: { accent: "#1d4ed8", fill: "#eff6ff", fillMuted: "#dbeafe" },
  공군: { accent: "#0284c7", fill: "#e8f4fc", fillMuted: "#e0f2fe" },
};

export function branchIdToUiTheme(branch: BranchId): BranchUiTheme | null {
  if (branch === "army") return BRANCH_UI_THEME.육군;
  if (branch === "navy") return BRANCH_UI_THEME.해군;
  if (branch === "air_force") return BRANCH_UI_THEME.공군;
  return null;
}
