"use client";

import { BRANCH_UI_THEME } from "@/lib/branchUiTheme";
import type { JointSummaryItem } from "@/lib/jointSummary";
import { Fragment } from "react";
import styled from "styled-components";

const Panel = styled.div`
  display: flex;
  flex-direction: column;
`;

const Block = styled.div`
  padding: 0.7rem 0;
`;

const BranchDivider = styled.hr`
  margin: 0;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, var(--text-muted) 30%);
`;

const Label = styled.div<{ $color: string }>`
  font-size: 0.9rem;
  font-weight: 900;
  color: ${({ $color }) => $color};
  margin-bottom: 0.3rem;
`;

const Text = styled.p`
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--text-primary);
  word-break: keep-all;
  overflow-wrap: break-word;
`;

const BRANCH_COLOR: Record<string, string> = {
  육군: BRANCH_UI_THEME.육군.accent,
  해군: BRANCH_UI_THEME.해군.accent,
  공군: BRANCH_UI_THEME.공군.accent,
  공통: "var(--link-accent)",
  합동: "var(--link-accent)",
};

type JointSummaryPanelProps = {
  items: JointSummaryItem[];
};

export function JointSummaryPanel({ items }: JointSummaryPanelProps) {
  if (items.length === 0) return null;

  return (
    <Panel>
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 ? <BranchDivider /> : null}
          <Block>
            <Label $color={BRANCH_COLOR[item.label] || "var(--text-primary)"}>{item.label} :</Label>
            <Text>{item.text}</Text>
          </Block>
        </Fragment>
      ))}
    </Panel>
  );
}
