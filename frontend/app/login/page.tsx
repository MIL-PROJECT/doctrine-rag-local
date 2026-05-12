"use client";

import type { ChatAccessRequestProfile } from "@/lib/auth";
import {
  createChatAccessRequest,
  getCurrentUser,
  hasPermission,
  login,
  logout,
  registerUser,
} from "@/lib/auth";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import styled, { keyframes } from "styled-components";

const pulse = keyframes`
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.85; }
`;

const Shell = styled.div`
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 18px 32px;
  overflow: hidden;
  background: radial-gradient(1000px 520px at 0% 0%, #dbeafe 0%, transparent 55%),
    radial-gradient(800px 480px at 100% 0%, #e9d5ff 0%, transparent 48%),
    radial-gradient(700px 400px at 50% 100%, #cffafe 0%, transparent 45%),
    linear-gradient(168deg, #f8fafc 0%, #e2e8f0 55%, #f1f5f9 100%);
`;

const Orb = styled.div`
  position: absolute;
  border-radius: 50%;
  filter: blur(72px);
  pointer-events: none;
  animation: ${pulse} 10s ease-in-out infinite;

  &:nth-of-type(1) {
    width: 280px;
    height: 280px;
    top: -5%;
    right: 5%;
    background: #93c5fd;
    opacity: 0.45;
  }
  &:nth-of-type(2) {
    width: 320px;
    height: 320px;
    bottom: -8%;
    left: -5%;
    background: #a5b4fc;
    opacity: 0.4;
    animation-delay: -3s;
  }
`;

const FineGrid = styled.div`
  position: absolute;
  inset: 0;
  opacity: 0.35;
  background-image: radial-gradient(rgb(15 23 42 / 0.06) 1px, transparent 1px);
  background-size: 20px 20px;
  mask-image: radial-gradient(ellipse 75% 65% at 50% 45%, #000 15%, transparent 70%);
  pointer-events: none;
`;

const Card = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 580px;
  border-radius: 1.35rem;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 0.65);
  background: rgb(255 255 255 / 0.82);
  backdrop-filter: blur(12px);
  box-shadow:
    0 1px 0 0 rgb(255 255 255 / 0.9) inset,
    0 28px 64px -24px rgb(15 23 42 / 0.18),
    0 12px 24px -16px rgb(30 64 175 / 0.12);
`;

const CardHero = styled.div`
  position: relative;
  padding: 1.75rem 1.75rem 1.4rem;
  background: linear-gradient(125deg, #0f172a 0%, #1e3a8a 42%, #2563eb 92%);
  color: #fff;
  text-align: left;
`;

const CardHeroGlow = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 120% 80% at 100% 0%, rgb(96 165 250 / 0.35) 0%, transparent 55%);
  pointer-events: none;
`;

const HeroTop = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const EmblemBox = styled.div`
  position: relative;
  flex-shrink: 0;
  width: 4.25rem;
  height: 3.4rem;
`;

const HeroTitles = styled.div`
  min-width: 0;
`;

const BrandKicker = styled.p`
  margin: 0 0 0.2rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgb(191 219 254 / 0.95);
`;

const BrandTitle = styled.h1`
  margin: 0;
  font-size: 1.55rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1.15;
`;

const BrandSub = styled.p`
  margin: 0.55rem 0 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: rgb(226 232 240 / 0.92);
`;

const CardBody = styled.div`
  padding: 1.5rem 1.75rem 1.65rem;
`;

const Lead = styled.p`
  margin: 0 0 1.1rem;
  font-size: 0.925rem;
  line-height: 1.55;
  color: #64748b;
`;

const Tabs = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 1.2rem;
  padding: 6px;
  border-radius: 12px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
`;

const TabBtn = styled.button<{ $active: boolean }>`
  flex: 1;
  border: none;
  border-radius: 9px;
  padding: 11px 10px;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  background: ${({ $active }) => ($active ? "#fff" : "transparent")};
  color: ${({ $active }) => ($active ? "#1e3a8a" : "#64748b")};
  box-shadow: ${({ $active }) => ($active ? "0 2px 8px rgb(15 23 42 / 0.08)" : "none")};

  &:hover {
    color: ${({ $active }) => ($active ? "#1e3a8a" : "#334155")};
  }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 15px;
  font-size: 0.82rem;
  color: #475569;
  font-weight: 700;
  letter-spacing: 0.02em;
`;

const Input = styled.input`
  border: 1px solid #cbd5e1;
  border-radius: 11px;
  padding: 13px 14px;
  font-size: 1rem;
  outline: none;
  background: #fff;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &::placeholder {
    color: #94a3b8;
  }

  &:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgb(37 99 235 / 0.18);
  }
`;

const Primary = styled.button`
  width: 100%;
  margin-top: 8px;
  border: none;
  border-radius: 11px;
  padding: 14px 16px;
  font-weight: 800;
  font-size: 1rem;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 4px 14px -4px rgb(37 99 235 / 0.55);
  transition: filter 0.15s ease, transform 0.1s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const PrimaryAdmin = styled(Primary)`
  background: linear-gradient(180deg, #6d28d9 0%, #5b21b6 100%);
  box-shadow: 0 4px 14px -4px rgb(109 40 217 / 0.45);
`;

const Alert = styled.div<{ $variant: "error" | "success" | "info" }>`
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 11px;
  font-size: 0.88rem;
  line-height: 1.5;
  background: ${({ $variant }) =>
    $variant === "error" ? "#fef2f2" : $variant === "success" ? "#ecfdf5" : "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)"};
  color: ${({ $variant }) =>
    $variant === "error" ? "#991b1b" : $variant === "success" ? "#166534" : "#334155"};
  border: 1px solid
    ${({ $variant }) =>
      $variant === "error" ? "#fecaca" : $variant === "success" ? "#bbf7d0" : "#bfdbfe"};
`;

const AlertChatRow = styled(Alert)`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const AlertChatText = styled.span`
  flex: 1;
  min-width: 200px;
`;

const RequestChatBtn = styled.button`
  flex-shrink: 0;
  border-radius: 9px;
  padding: 8px 14px;
  font-weight: 800;
  font-size: 0.82rem;
  cursor: pointer;
  border: 1px solid #dc2626;
  color: #b91c1c;
  background: #fff;
  transition: filter 0.12s ease, background 0.12s ease;

  &:hover:not(:disabled) {
    background: #fef2f2;
    filter: brightness(0.98);
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const FootNote = styled.p`
  margin: 1.25rem 0 0;
  font-size: 0.76rem;
  line-height: 1.5;
  color: #94a3b8;
  text-align: center;
`;

/**
 * localStorage 기반 로그인/등록 UI (PoC). 운영 시 백엔드 인증으로 대체 필요.
 * @see frontend/lib/auth.ts
 */
export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"admin" | "user" | "register">("user");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatGateProfile, setChatGateProfile] = useState<ChatAccessRequestProfile | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);

  const [adminId, setAdminId] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [userId, setUserId] = useState("");
  const [userPw, setUserPw] = useState("");

  const [rName, setRName] = useState("");
  const [rMil, setRMil] = useState("");
  const [rRank, setRRank] = useState("");
  const [rPos, setRPos] = useState("");
  const [rId, setRId] = useState("");
  const [rPw, setRPw] = useState("");

  function clearMessages() {
    setError(null);
    setInfo(null);
    setChatGateProfile(null);
  }

  function handleAdminLogin(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      const res = login(adminId, adminPw);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const user = getCurrentUser();
      if (!user || !hasPermission(user, "ADMIN")) {
        logout();
        setError("관리자 권한(ADMIN)이 있는 계정만 이 경로로 로그인할 수 있습니다.");
        return;
      }
      router.replace("/admin");
    } finally {
      setBusy(false);
    }
  }

  function handleUserLogin(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      const res = login(userId, userPw);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const user = getCurrentUser();
      if (!user) {
        logout();
        setError("세션을 확인할 수 없습니다. 다시 시도해 주세요.");
        return;
      }
      if (!hasPermission(user, "CHAT")) {
        setChatGateProfile({
          userId: user.id,
          name: user.name,
          militaryNumber: user.militaryNumber,
          rank: user.rank,
          position: user.position,
        });
        logout();
        setError("챗봇 이용 권한(CHAT)이 없습니다. 관리자에게 권한을 요청하세요.");
        return;
      }
      setChatGateProfile(null);
      router.replace("/chat");
    } finally {
      setBusy(false);
    }
  }

  function handleRequestChatAccess() {
    if (!chatGateProfile) return;
    setRequestBusy(true);
    try {
      const res = createChatAccessRequest(chatGateProfile);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setChatGateProfile(null);
      setInfo("CHAT 권한 요청이 접수되었습니다. 관리자 승인 후 다시 로그인해 주세요.");
    } finally {
      setRequestBusy(false);
    }
  }

  function handleRegister(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      const res = registerUser({
        name: rName,
        militaryNumber: rMil,
        rank: rRank,
        position: rPos,
        id: rId,
        password: rPw,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTab("user");
      setUserId(rId.trim());
      setUserPw("");
      setInfo("등록 완료. 권한이 없으면 관리자 승인이 필요합니다.");
      setRName("");
      setRMil("");
      setRRank("");
      setRPos("");
      setRId("");
      setRPw("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <Orb />
      <Orb />
      <FineGrid />
      <Card>
        <CardHero>
          <CardHeroGlow />
          <HeroTop>
            <EmblemBox>
              <NextImage
                src="/header-emblem.png"
                alt=""
                fill
                sizes="72px"
                style={{ objectFit: "contain" }}
                priority
              />
            </EmblemBox>
            <HeroTitles>
              <BrandKicker>Doctrine RAG</BrandKicker>
              <BrandTitle>DOCTOR</BrandTitle>
            </HeroTitles>
          </HeroTop>
        </CardHero>

        <CardBody>
          <Lead>
            {tab === "admin"
              ? "관리자 콘솔 접속용 계정으로 로그인합니다."
              : tab === "user"
                ? "교리 챗봇 이용 계정으로 로그인합니다."
                : "신규 계정을 등록합니다. 승인은 관리자가 부여합니다."}
          </Lead>

          {error && chatGateProfile && tab === "user" ? (
            <AlertChatRow $variant="error" role="alert">
              <AlertChatText>{error}</AlertChatText>
              <RequestChatBtn type="button" disabled={requestBusy} onClick={handleRequestChatAccess}>
                {requestBusy ? "처리 중…" : "CHAT 권한 요청"}
              </RequestChatBtn>
            </AlertChatRow>
          ) : error ? (
            <Alert $variant="error" role="alert">
              {error}
            </Alert>
          ) : null}
          {info ? <Alert $variant="success">{info}</Alert> : null}

          <Tabs role="tablist" aria-label="관리자 로그인, 사용자 로그인, 등록">
            <TabBtn
              type="button"
              role="tab"
              aria-selected={tab === "admin"}
              $active={tab === "admin"}
              onClick={() => {
                setTab("admin");
                clearMessages();
              }}
            >
              관리자 로그인
            </TabBtn>
            <TabBtn
              type="button"
              role="tab"
              aria-selected={tab === "user"}
              $active={tab === "user"}
              onClick={() => {
                setTab("user");
                clearMessages();
              }}
            >
              사용자 로그인
            </TabBtn>
            <TabBtn
              type="button"
              role="tab"
              aria-selected={tab === "register"}
              $active={tab === "register"}
              onClick={() => {
                setTab("register");
                clearMessages();
              }}
            >
              사용자 등록
            </TabBtn>
          </Tabs>

          {tab === "admin" ? (
            <form onSubmit={handleAdminLogin}>
              <Field>
                관리자 ID
                <Input value={adminId} onChange={(ev) => setAdminId(ev.target.value)} autoComplete="username" />
              </Field>
              <Field>
                비밀번호
                <Input
                  type="password"
                  value={adminPw}
                  onChange={(ev) => setAdminPw(ev.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <PrimaryAdmin type="submit" disabled={busy}>
                관리자로 로그인
              </PrimaryAdmin>
            </form>
          ) : tab === "user" ? (
            <form onSubmit={handleUserLogin}>
              <Field>
                사용자 ID
                <Input value={userId} onChange={(ev) => setUserId(ev.target.value)} autoComplete="username" />
              </Field>
              <Field>
                비밀번호
                <Input
                  type="password"
                  value={userPw}
                  onChange={(ev) => setUserPw(ev.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <Primary type="submit" disabled={busy}>
                챗봇으로 로그인
              </Primary>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <Field>
                이름
                <Input value={rName} onChange={(ev) => setRName(ev.target.value)} />
              </Field>
              <Field>
                군번
                <Input value={rMil} onChange={(ev) => setRMil(ev.target.value)} />
              </Field>
              <Field>
                계급
                <Input value={rRank} onChange={(ev) => setRRank(ev.target.value)} placeholder="예: 대위" />
              </Field>
              <Field>
                직책
                <Input value={rPos} onChange={(ev) => setRPos(ev.target.value)} placeholder="예: 작전참모" />
              </Field>
              <Field>
                ID
                <Input value={rId} onChange={(ev) => setRId(ev.target.value)} autoComplete="username" />
              </Field>
              <Field>
                비밀번호
                <Input type="password" value={rPw} onChange={(ev) => setRPw(ev.target.value)} autoComplete="new-password" />
              </Field>
              <Primary type="submit" disabled={busy}>
                등록
              </Primary>
            </form>
          )}

          <FootNote>
            PoC: 비밀번호는 브라우저에 평문으로 저장됩니다. 운영 시 서버 인증·해시·JWT가 필요합니다.
          </FootNote>
        </CardBody>
      </Card>
    </Shell>
  );
}
