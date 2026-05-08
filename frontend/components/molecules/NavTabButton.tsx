"use client";

import styled, { css } from "styled-components";
import { bp } from "@/lib/breakpoints";

const Button = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  white-space: nowrap;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s;

  @media (min-width: ${bp.sm}) {
    font-size: 1.0625rem;
  }

  ${({ $active }) =>
    $active
      ? css`
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        `
      : css`
          color: rgb(255 255 255 / 0.78);
          &:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
          }
        `}

  @media (min-width: ${bp.lg}) {
    border-radius: 0;
    font-size: 1.125rem;
    padding: 1.75rem 0.65rem;
    border-bottom: 1px solid transparent;
    background: transparent;

    ${({ $active }) =>
      $active
        ? css`
            border-bottom-color: var(--branch-accent);
            color: #fff;
          `
        : css`
            &:hover {
              background: transparent;
              color: #fff;
              border-bottom-color: transparent;
            }
          `}
  }
`;

type NavTabButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

export function NavTabButton({ label, active, onClick }: NavTabButtonProps) {
  return (
    <Button type="button" $active={active} onClick={onClick}>
      {label}
    </Button>
  );
}
