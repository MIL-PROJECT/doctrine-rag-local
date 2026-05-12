"use client";

import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import styled, { keyframes } from "styled-components";

const drift = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-2%, 1%) scale(1.03); }
`;

const Shell = styled.div`
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
  background: radial-gradient(1200px 600px at 10% -10%, #bfdbfe 0%, transparent 55%),
    radial-gradient(900px 500px at 100% 20%, #c4b5fd 0%, transparent 50%),
    linear-gradient(165deg, #0f172a 0%, #1e293b 38%, #0f172a 100%);
`;

const Blob = styled.div`
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.35;
  pointer-events: none;
  animation: ${drift} 18s ease-in-out infinite;

  &:nth-child(1) {
    width: min(420px, 70vw);
    height: min(420px, 70vw);
    top: -8%;
    right: -5%;
    background: #3b82f6;
  }
  &:nth-child(2) {
    width: min(380px, 65vw);
    height: min(380px, 65vw);
    bottom: -10%;
    left: -8%;
    background: #6366f1;
    animation-delay: -6s;
  }
`;

const Grid = styled.div`
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgb(255 255 255 / 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 40%, #000 20%, transparent 72%);
  pointer-events: none;
`;

const Panel = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  border-radius: 1.25rem;
  border: 1px solid rgb(255 255 255 / 0.12);
  background: rgb(15 23 42 / 0.55);
  backdrop-filter: blur(16px);
  box-shadow: 0 24px 80px -20px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.06) inset;
  padding: 2rem 1.75rem 1.75rem;
  text-align: center;
  color: #f1f5f9;
`;

const EmblemWrap = styled.div`
  position: relative;
  margin: 0 auto 1rem;
  width: 5.5rem;
  height: 4.5rem;
`;

const Kicker = styled.p`
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgb(148 163 184 / 0.95);
`;

const Title = styled.h1`
  margin: 0 0 0.5rem;
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
  background: linear-gradient(135deg, #fff 0%, #bfdbfe 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
`;

const Desc = styled.p`
  margin: 0 0 1.5rem;
  font-size: 0.9rem;
  line-height: 1.55;
  color: rgb(203 213 225 / 0.95);
`;

const Cta = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.9rem 1rem;
  border-radius: 0.875rem;
  font-weight: 800;
  font-size: 0.95rem;
  text-decoration: none;
  color: #0f172a;
  background: linear-gradient(180deg, #fff 0%, #e2e8f0 100%);
  border: 1px solid rgb(255 255 255 / 0.35);
  box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.35);
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 32px -10px rgb(0 0 0 / 0.4);
  }
`;

const Hint = styled.p`
  margin: 1rem 0 0;
  font-size: 0.75rem;
  color: rgb(148 163 184 / 0.9);
`;

/** 루트 `/` — 브랜딩 후 로그인으로 안내 (기존 즉시 redirect 대체) */
export default function HomeGate() {
  const router = useRouter();

  useEffect(() => {
    const t = window.setTimeout(() => router.replace("/login"), 2200);
    return () => window.clearTimeout(t);
  }, [router]);

  return (
    <Shell>
      <Blob />
      <Blob />
      <Grid />
      <Panel>
        <EmblemWrap>
          <NextImage src="/header-emblem.png" alt="" fill sizes="88px" style={{ objectFit: "contain" }} priority />
        </EmblemWrap>
        <Kicker>Multi-branch RAG</Kicker>
        <Title>DoctrineRAG</Title>
        <Desc>육·해·공 교리 인덱스와 Ollama를 연결한 질의응답 PoC입니다. 로그인 후 챗봇을 이용할 수 있습니다.</Desc>
        <Cta href="/login">로그인으로 이동</Cta>
        <Hint>잠시 후 자동으로 로그인 화면으로 이동합니다.</Hint>
      </Panel>
    </Shell>
  );
}
