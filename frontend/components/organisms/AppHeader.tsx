"use client";

import { Icon } from "@/components/atoms/Icon";
import { NavTabButton } from "@/components/molecules/NavTabButton";
import { bp } from "@/lib/breakpoints";
import NextImage from "next/image";
import styled from "styled-components";

const TABS = ["채팅", "교범 검색", "출처 문서", "대시보드"] as const;

const Shell = styled.header`
  background: linear-gradient(to right, #020617, #172554, #0f172a);
  color: #fff;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
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

const Brand = styled.div`
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.25rem;
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
  }

  @media (min-width: ${bp.xl}) {
    min-width: 18rem;
  }
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

const ProjectButton = styled.button`
  display: flex;
  min-width: 0;
  max-width: min(100%, 14rem);
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.75rem;
  border: 1px solid rgb(255 255 255 / 0.15);
  background: rgb(255 255 255 / 0.05);
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 0.75rem;
  color: #e0f2fe;
  cursor: pointer;

  @media (min-width: ${bp.sm}) {
    max-width: none;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
  }
`;

const ProjectLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Chevron = styled.span`
  flex-shrink: 0;
`;

const Avatar = styled.div`
  display: flex;
  height: 2.25rem;
  width: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #fff;
  font-size: 0.875rem;
  font-weight: 700;
  color: #334155;

  @media (min-width: ${bp.sm}) {
    height: 2.75rem;
    width: 2.75rem;
    font-size: 1rem;
  }
`;

type AppHeaderProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  projectLabel?: string;
};

export function AppHeader({ activeTab, onTabChange, projectLabel = "Doctrine RAG · Ollama" }: AppHeaderProps) {
  return (
    <Shell>
      <Inner>
        <Brand>
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
            <Title>DoctrineRAG</Title>
          </TitleBlock>
        </Brand>

        <Nav aria-label="주 메뉴">
          {TABS.map((tab) => (
            <NavTabButton key={tab} label={tab} active={activeTab === tab} onClick={() => onTabChange(tab)} />
          ))}
        </Nav>

        <Actions>
          <ProjectButton type="button">
            <Icon name="shield" size={18} />
            <ProjectLabel>{projectLabel}</ProjectLabel>
            <Chevron>⌄</Chevron>
          </ProjectButton>
          <Avatar>DR</Avatar>
        </Actions>
      </Inner>
    </Shell>
  );
}
