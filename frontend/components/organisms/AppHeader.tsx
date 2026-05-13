"use client";

import { NavTabButton } from "@/components/molecules/NavTabButton";
import { bp } from "@/lib/breakpoints";
import NextImage from "next/image";
import styled, { css } from "styled-components";

const TABS = ["채팅", "교범 검색", "출처 문서", "로그"] as const;

const Shell = styled.header<{ $branch: "common" | "army" | "navy" | "air_force" }>`
  position: sticky;
  top: 0;
  z-index: 50;
  background: ${({ $branch }) =>
    $branch === "army"
      ? "linear-gradient(to right, #052e16, #166534, #14532d)"
      : $branch === "navy"
        ? "linear-gradient(to right, #111827, #4b5563, #111827)"
        : $branch === "air_force"
          ? "linear-gradient(to right, #1e1b4b, #6d28d9, #312e81)"
          : "linear-gradient(to right, #020617, #1e40af, #1e293b)"};
  color: #fff;
  box-shadow: 0 12px 28px -8px rgb(0 0 0 / 0.35);
  backdrop-filter: saturate(1.15) blur(10px);
`;

const Inner = styled.div`
  display: flex;
  min-height: 4rem;
  width: 100%;
  min-width: 0;
  flex-direction: column;

  @media (min-width: ${bp.lg}) {
    height: 5rem;
    min-height: 0;
    flex-direction: row;
    align-items: stretch;
  }
`;

const Brand = styled.button`
  display: flex;
  min-width: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  align-items: flex-start;
  gap: 0.5rem;
  border-bottom: 1px solid rgb(255 255 255 / 0.1);
  padding: 0.75rem 1rem;

  @media (min-width: ${bp.sm}) {
    gap: 0.375rem;
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }

  @media (min-width: ${bp.lg}) {
    height: 100%;
    min-width: min(100%, 16rem);
    max-width: 20rem;
    border-bottom: none;
    border-right: 1px solid rgb(255 255 255 / 0.1);
    padding-top: 0;
    padding-bottom: 0;
    align-items: center;
  }

  @media (min-width: ${bp.xl}) {
    min-width: 18rem;
  }


  &:hover {
    text-decoration: none;
  }

  &:focus-visible {
    outline: 2px solid #bfdbfe;
    outline-offset: -4px;
  }
`;


const BrandHint = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const LogoBox = styled.div`
  position: relative;
  display: flex;
  height: 2.5rem;
  width: 4.25rem;
  flex-shrink: 0;
  align-items: center;

  @media (min-width: ${bp.sm}) {
    height: 3rem;
    width: 5rem;
  }
`;

const LogoImage = styled(NextImage)`
  height: 100%;
  width: 100%;
  max-height: 2.5rem;
  object-fit: contain;
  object-position: left;

  @media (min-width: ${bp.sm}) {
    max-height: 3rem;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;
`;

const Subtitle = styled.p`
  margin: 0.2rem 0 0;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 0.72);
`;

const Title = styled.h1`
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.025em;

  @media (min-width: ${bp.sm}) {
    font-size: 1.25rem;
  }

  @media (min-width: ${bp.lg}) {
    font-size: 1.5rem;
  }
`;

const Nav = styled.nav`
  display: flex;
  min-height: 3rem;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.25rem;
  overflow-x: auto;
  border-bottom: 1px solid rgb(255 255 255 / 0.1);
  padding: 0.5rem;

  @media (min-width: ${bp.sm}) {
    gap: 0.5rem;
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  @media (min-width: ${bp.lg}) {
    min-height: 0;
    justify-content: center;
    gap: 1rem;
    overflow: visible;
    border-bottom: none;
    padding-left: 1rem;
    padding-right: 1rem;
  }

  @media (min-width: ${bp.xl}) {
    gap: 2rem;
  }
`;

const Actions = styled.div`
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 1rem;

  @media (min-width: ${bp.sm}) {
    gap: 0.75rem;
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }

  @media (min-width: ${bp.lg}) {
    min-width: 12rem;
    max-width: 28rem;
    border-left: 1px solid rgb(255 255 255 / 0.1);
    padding-top: 0;
    padding-bottom: 0;
  }

  @media (min-width: ${bp.xl}) {
    min-width: 16rem;
  }
`;

type AppHeaderProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  branch: "common" | "army" | "navy" | "air_force";
  onBranchChange: (branch: "common" | "army" | "navy" | "air_force") => void;
  showLogTab?: boolean;
};

const BranchTabs = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const BranchButton = styled.button<{ $active: boolean }>`
  border: 1px solid rgb(255 255 255 / 0.22);
  background: ${({ $active }) => ($active ? "rgb(255 255 255 / 0.18)" : "transparent")};
  color: #fff;
  padding: 0.45rem 0.75rem;
  border-radius: 9999px;
  font-weight: 800;
  font-size: 0.875rem;
  cursor: pointer;
  transition: box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease, transform 0.12s ease;

  ${({ $active }) =>
    $active
      ? css`
          border-color: rgb(255 255 255 / 0.55);
          box-shadow: 0 0 0 1px rgb(255 255 255 / 0.2), 0 0 0 3px var(--branch-accent);
          background: rgb(255 255 255 / 0.24);
        `
      : ""}

  &:hover {
    background: rgb(255 255 255 / 0.12);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid var(--branch-accent);
    outline-offset: 2px;
  }
`;

function branchLabel(id: "common" | "army" | "navy" | "air_force") {
  return id === "common" ? "합참" : id === "army" ? "육군" : id === "navy" ? "해군" : "공군";
}

export function AppHeader({ activeTab, onTabChange, branch, onBranchChange, showLogTab = true }: AppHeaderProps) {
  const visibleTabs = showLogTab ? TABS : TABS.filter((tab) => tab !== "로그");
  return (
    <Shell $branch={branch}>
      <Inner>
        <Brand type="button" onClick={() => onTabChange("채팅")} aria-label="채팅 화면으로 이동">
          <LogoBox>
            <LogoImage
              src="/header-emblem.png"
              alt="닻·별·날개 엠블럼"
              width={220}
              height={176}
              priority
            />
          </LogoBox>
          <TitleBlock>
            <Title>DOCTOR</Title>
            <Subtitle>Doctrine RAG</Subtitle>
          </TitleBlock>
          <BrandHint>채팅으로 이동</BrandHint>
        </Brand>

        <Nav aria-label="주 메뉴">
          {visibleTabs.map((tab) => (
            <NavTabButton key={tab} label={tab} active={activeTab === tab} onClick={() => onTabChange(tab)} />
          ))}
        </Nav>

        <Actions>
          <BranchTabs aria-label="군 선택">
            {(["common", "army", "navy", "air_force"] as const).map((b) => (
              <BranchButton key={b} type="button" $active={b === branch} onClick={() => onBranchChange(b)}>
                {branchLabel(b)}
              </BranchButton>
            ))}
          </BranchTabs>
        </Actions>
      </Inner>
    </Shell>
  );
}
