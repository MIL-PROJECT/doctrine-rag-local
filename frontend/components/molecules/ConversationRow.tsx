"use client";

import styled, { css } from "styled-components";

const Row = styled.button<{ $active: boolean }>`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.875rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;

  ${({ $active }) =>
    $active
      ? css`
          background: var(--conversation-active-bg);
          color: var(--conversation-active-fg);
          border: 1px solid var(--conversation-active-border);
          box-shadow: var(--shadow-raised);
        `
      : css`
          color: var(--text-secondary-contrast);
          border: 1px solid transparent;
          &:hover {
            background: var(--surface-hover);
          }
        `}
`;

const Title = styled.span`
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  line-clamp: 1;
`;

const Time = styled.span<{ $active: boolean }>`
  ${({ $active }) =>
    $active
      ? css`
          color: var(--conversation-time-active);
        `
      : css`
          color: var(--text-muted);
        `}
`;

type ConversationRowProps = {
  title: string;
  time: string;
  active?: boolean;
  onClick?: () => void;
};

export function ConversationRow({ title, time, active, onClick }: ConversationRowProps) {
  return (
    <Row type="button" $active={!!active} onClick={onClick}>
      <Title>{title}</Title>
      <Time $active={!!active}>{time}</Time>
    </Row>
  );
}
