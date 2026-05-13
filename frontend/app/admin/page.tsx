"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import type { ChatAccessRequest, DoctrineUser, Permission } from "@/lib/auth";
import {
  approveChatAccessRequest,
  dismissChatAccessRequest,
  getPendingChatAccessRequests,
  getUsers,
  logout,
  setUserPermissions,
} from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";

const Shell = styled.div`
  position: relative;
  min-height: 100dvh;
  overflow-x: hidden;
  padding: 22px 18px 36px;
  background: radial-gradient(880px 460px at 0% -8%, #e0e7ff 0%, transparent 52%),
    radial-gradient(720px 420px at 100% 5%, #dbeafe 0%, transparent 48%),
    linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
`;

const Wash = styled.div`
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgb(15 23 42 / 0.04) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: radial-gradient(ellipse 85% 70% at 50% 0%, #000 0%, transparent 75%);
  pointer-events: none;
`;

const Top = styled.div`
  max-width: 1200px;
  margin: 0 auto 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 1.2rem 1.35rem;
  border-radius: 1rem;
  border: 1px solid rgb(226 232 240 / 0.95);
  background: rgb(255 255 255 / 0.78);
  backdrop-filter: blur(10px);
  box-shadow:
    0 1px 0 0 rgb(255 255 255 / 0.9) inset,
    0 16px 48px -28px rgb(15 23 42 / 0.14);
`;

const Badge = styled.span`
  display: inline-block;
  margin-bottom: 0.35rem;
  padding: 0.2rem 0.55rem;
  border-radius: 7px;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1d4ed8;
  background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
  border: 1px solid #bfdbfe;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.48rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: #0f172a;
`;

const Sub = styled.p`
  margin: 8px 0 0;
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.55;
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
`;

const Btn = styled.button<{ $tone?: "primary" | "ghost" | "muted" }>`
  border-radius: 11px;
  padding: 10px 16px;
  font-weight: 800;
  font-size: 0.875rem;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
  border: 1px solid
    ${({ $tone }) => ($tone === "ghost" ? "#cbd5e1" : $tone === "muted" ? "#e2e8f0" : "#1d4ed8")};
  background: ${({ $tone }) =>
    $tone === "ghost" ? "#fff" : $tone === "muted" ? "#f8fafc" : "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)"};
  color: ${({ $tone }) => ($tone === "ghost" || $tone === "muted" ? "#0f172a" : "#fff")};
  box-shadow: ${({ $tone }) =>
    $tone === "ghost" || $tone === "muted"
      ? "0 1px 2px rgb(15 23 42 / 0.05)"
      : "0 6px 18px -6px rgb(37 99 235 / 0.45)"};

  &:hover {
    filter: brightness(${({ $tone }) => ($tone === "muted" ? 0.97 : 1.03)});
    transform: translateY(-1px);
  }
`;

const StatsGrid = styled.div`
  max-width: 1200px;
  margin: 0 auto 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (min-width: 720px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`;

const StatCard = styled.div`
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: rgb(255 255 255 / 0.88);
  box-shadow: 0 1px 0 0 rgb(255 255 255 / 0.9) inset;
`;

const StatLabel = styled.p`
  margin: 0 0 4px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
`;

const StatValue = styled.p`
  margin: 0;
  font-size: 1.45rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: #0f172a;
  line-height: 1.1;
`;

const StatHint = styled.p`
  margin: 6px 0 0;
  font-size: 0.72rem;
  color: #94a3b8;
  line-height: 1.35;
`;

const Toast = styled.div`
  max-width: 1200px;
  margin: 0 auto 12px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.84rem;
  font-weight: 700;
  color: #166534;
  background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
  border: 1px solid #bbf7d0;
  box-shadow: 0 4px 14px -8px rgb(22 163 74 / 0.25);
`;

const Err = styled.div`
  max-width: 1200px;
  margin: 0 auto 12px;
  padding: 11px 14px;
  border-radius: 11px;
  background: linear-gradient(135deg, #fef2f2 0%, #fff 100%);
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 0.875rem;
  box-shadow: 0 4px 14px -8px rgb(185 28 28 / 0.2);
`;

const Card = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  background: rgb(255 255 255 / 0.92);
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  box-shadow:
    0 1px 0 0 rgb(255 255 255 / 0.95) inset,
    0 20px 56px -28px rgb(15 23 42 / 0.12);
  overflow: hidden;
`;

const CardHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
`;

const CardTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.02em;
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

const SearchInput = styled.input`
  min-width: min(100%, 200px);
  width: 220px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 0.875rem;
  outline: none;
  background: #fff;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgb(37 99 235 / 0.15);
  }
  &::placeholder {
    color: #94a3b8;
  }
`;

const MetaText = styled.span`
  font-size: 0.78rem;
  color: #64748b;
  font-weight: 600;
`;

const TableWrap = styled.div`
  max-height: min(68vh, 640px);
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 920px;
`;

const Th = styled.th`
  position: sticky;
  top: 0;
  z-index: 2;
  text-align: left;
  padding: 12px 14px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%);
  box-shadow: 0 1px 0 #e2e8f0;
`;

const Td = styled.td`
  padding: 11px 14px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.875rem;
  color: #0f172a;
  vertical-align: middle;
`;

const Mono = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #475569;
`;

const RolePill = styled.span<{ $role: "ADMIN" | "USER" }>`
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid ${({ $role }) => ($role === "ADMIN" ? "#c4b5fd" : "#cbd5e1")};
  color: ${({ $role }) => ($role === "ADMIN" ? "#5b21b6" : "#475569")};
  background: ${({ $role }) => ($role === "ADMIN" ? "linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%)" : "#f8fafc")};
`;

const PermGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const PermChip = styled.span<{ $kind: "CHAT" | "ADMIN" }>`
  display: inline-flex;
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  font-size: 0.65rem;
  font-weight: 900;
  letter-spacing: 0.03em;
  border: 1px solid ${({ $kind }) => ($kind === "ADMIN" ? "#ddd6fe" : "#bbf7d0")};
  color: ${({ $kind }) => ($kind === "ADMIN" ? "#5b21b6" : "#166534")};
  background: ${({ $kind }) => ($kind === "ADMIN" ? "#faf5ff" : "#f0fdf4")};
`;

const PermEmpty = styled.span`
  font-size: 0.78rem;
  color: #94a3b8;
  font-weight: 600;
`;

const Row = styled.tr<{ $admin?: boolean }>`
  transition: background 0.12s ease;
  background: ${({ $admin }) => ($admin ? "linear-gradient(90deg, rgb(239 246 255 / 0.85) 0%, transparent 12%)" : "transparent")};

  &:hover {
    background: ${({ $admin }) =>
      $admin
        ? "linear-gradient(90deg, rgb(219 234 254 / 0.75) 0%, rgb(248 250 252 / 0.95) 14%)"
        : "rgb(248 250 252 / 0.95)"};
  }
  &:last-child td {
    border-bottom: none;
  }
`;

const Toggle = styled.button<{ $on: boolean; $variant?: "admin" }>`
  border-radius: 999px;
  padding: 7px 11px;
  font-weight: 800;
  font-size: 0.72rem;
  cursor: pointer;
  transition: filter 0.12s ease, box-shadow 0.12s ease;
  border: 1px solid
    ${({ $on, $variant }) =>
      $variant === "admin" ? ($on ? "#c4b5fd" : "#cbd5e1") : $on ? "#86efac" : "#cbd5e1"};
  background: ${({ $on, $variant }) =>
    $variant === "admin"
      ? $on
        ? "linear-gradient(180deg, #ede9fe 0%, #ddd6fe 100%)"
        : "#fff"
      : $on
        ? "linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)"
        : "#fff"};
  color: ${({ $on, $variant }) =>
    $variant === "admin" ? ($on ? "#5b21b6" : "#64748b") : $on ? "#166534" : "#64748b"};
  box-shadow: ${({ $on }) => ($on ? "0 2px 6px -2px rgb(15 23 42 / 0.12)" : "none")};

  &:hover {
    filter: brightness(1.02);
  }
`;

const EmptyState = styled.div`
  padding: 2.5rem 1.5rem;
  text-align: center;
  color: #64748b;
  font-size: 0.9rem;
  font-weight: 600;
`;

const ReqRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
  &:last-child {
    border-bottom: none;
  }
`;

const ReqMain = styled.div`
  min-width: 0;
  flex: 1;
`;

const ReqTitle = styled.div`
  font-size: 0.9rem;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 4px;
`;

const ReqSub = styled.div`
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.45;
`;

const ReqActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

function userMatchesQuery(u: DoctrineUser, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return (
    u.name.toLowerCase().includes(s) ||
    u.id.toLowerCase().includes(s) ||
    u.militaryNumber.toLowerCase().includes(s) ||
    u.rank.toLowerCase().includes(s) ||
    u.position.toLowerCase().includes(s)
  );
}

/**
 * 관리자 UI (PoC). 권한 변경은 localStorage에만 반영됩니다.
 * 운영 시 서버 권한·감사로그·인증이 필요합니다. @see frontend/lib/auth.ts
 */
function AdminPanel() {
  const router = useRouter();
  const [users, setUsers] = useState<DoctrineUser[]>(() => getUsers());
  const [pendingChatRequests, setPendingChatRequests] = useState<ChatAccessRequest[]>(() =>
    getPendingChatAccessRequests(),
  );
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setUsers(getUsers());
    setPendingChatRequests(getPendingChatAccessRequests());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const total = users.length;
    const adminN = users.filter((u) => u.permissions.includes("ADMIN")).length;
    const chatN = users.filter((u) => u.permissions.includes("CHAT")).length;
    const pending = pendingChatRequests.length;
    return { total, adminN, chatN, pending };
  }, [users, pendingChatRequests]);

  const filtered = useMemo(() => users.filter((u) => userMatchesQuery(u, query)), [users, query]);

  function applyPermissions(userId: string, next: Permission[]) {
    const res = setUserPermissions(userId, next);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setToast("권한이 저장되었습니다.");
    refresh();
  }

  function toggleChat(u: DoctrineUser, enabled: boolean) {
    const hasAdmin = u.permissions.includes("ADMIN");
    if (!enabled && hasAdmin) {
      setError("CHAT을 해제하려면 먼저 ADMIN 권한을 해제하세요.");
      return;
    }
    const base = new Set(u.permissions);
    if (enabled) base.add("CHAT");
    else base.delete("CHAT");
    applyPermissions(u.id, Array.from(base) as Permission[]);
  }

  function toggleAdmin(u: DoctrineUser, enabled: boolean) {
    const base = new Set(u.permissions);
    if (enabled) {
      base.add("ADMIN");
      base.add("CHAT");
    } else {
      base.delete("ADMIN");
    }
    applyPermissions(u.id, Array.from(base) as Permission[]);
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  function approvePendingRequest(requestId: string) {
    const res = approveChatAccessRequest(requestId);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setToast("CHAT 권한을 부여했습니다.");
    refresh();
  }

  function dismissPendingRequest(requestId: string) {
    dismissChatAccessRequest(requestId);
    setError(null);
    setToast("요청을 거절했습니다.");
    refresh();
  }

  return (
    <Shell>
      <Wash />
      <Top>
        <div>
          <Badge>Admin console</Badge>
          <Title>관리자</Title>
          <Sub>
            사용자 목록과 CHAT/ADMIN 권한을 관리합니다. (PoC — localStorage)
            <br />
            운영 환경에서는 JWT·RDBMS·서버 측 authorization이 필요합니다.
          </Sub>
        </div>
        <Actions>
          <Btn type="button" onClick={() => router.push("/chat")}>
            챗봇으로 이동
          </Btn>
          <Btn type="button" $tone="muted" onClick={() => { refresh(); setToast("목록을 새로고침했습니다."); }}>
            새로고침
          </Btn>
          <Btn type="button" $tone="ghost" onClick={handleLogout}>
            로그아웃
          </Btn>
        </Actions>
      </Top>

      <StatsGrid>
        <StatCard>
          <StatLabel>전체 사용자</StatLabel>
          <StatValue>{stats.total}</StatValue>
          <StatHint>등록된 계정 수</StatHint>
        </StatCard>
        <StatCard>
          <StatLabel>관리자</StatLabel>
          <StatValue>{stats.adminN}</StatValue>
          <StatHint>ADMIN 권한 보유</StatHint>
        </StatCard>
        <StatCard>
          <StatLabel>챗봇 허용</StatLabel>
          <StatValue>{stats.chatN}</StatValue>
          <StatHint>CHAT 권한 보유</StatHint>
        </StatCard>
        <StatCard>
          <StatLabel>승인 대기</StatLabel>
          <StatValue>{stats.pending}</StatValue>
          <StatHint>CHAT 권한 요청 대기 건수</StatHint>
        </StatCard>
      </StatsGrid>

      {toast ? <Toast>{toast}</Toast> : null}
      {error ? <Err role="alert">{error}</Err> : null}

      <Card style={{ marginBottom: 14 }}>
        <CardHead>
          <CardTitle>CHAT 권한 요청 ({pendingChatRequests.length})</CardTitle>
          <MetaText>사용자가 로그인 화면에서 보낸 대기 요청입니다.</MetaText>
        </CardHead>
        {pendingChatRequests.length === 0 ? (
          <EmptyState>대기 중인 CHAT 권한 요청이 없습니다.</EmptyState>
        ) : (
          <div>
            {pendingChatRequests.map((r) => (
              <ReqRow key={r.id}>
                <ReqMain>
                  <ReqTitle>
                    {r.name} <Mono style={{ fontWeight: 700 }}>({r.userId})</Mono>
                  </ReqTitle>
                  <ReqSub>
                    {r.rank} · {r.position} · 군번 {r.militaryNumber}
                    <br />
                    요청 시각 {new Date(r.createdAt).toLocaleString("ko-KR")}
                  </ReqSub>
                </ReqMain>
                <ReqActions>
                  <Btn type="button" onClick={() => approvePendingRequest(r.id)}>
                    승인
                  </Btn>
                  <Btn type="button" $tone="ghost" onClick={() => dismissPendingRequest(r.id)}>
                    거절
                  </Btn>
                </ReqActions>
              </ReqRow>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHead>
          <CardTitle>사용자 목록</CardTitle>
          <Toolbar>
            <SearchInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 · ID · 군번 · 계급 · 직책 검색"
              aria-label="사용자 검색"
            />
            <MetaText>
              {filtered.length} / {users.length}명 표시
            </MetaText>
          </Toolbar>
        </CardHead>

        <TableWrap>
          {filtered.length === 0 ? (
            <EmptyState>검색 조건에 맞는 사용자가 없습니다.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>이름</Th>
                  <Th>군번</Th>
                  <Th>계급</Th>
                  <Th>직책</Th>
                  <Th>ID</Th>
                  <Th>역할</Th>
                  <Th>권한</Th>
                  <Th>CHAT</Th>
                  <Th>ADMIN</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const chatOn = u.permissions.includes("CHAT");
                  const adminOn = u.permissions.includes("ADMIN");
                  const role: "ADMIN" | "USER" = u.role === "ADMIN" ? "ADMIN" : "USER";
                  return (
                    <Row key={u.id} $admin={adminOn}>
                      <Td>
                        <strong>{u.name}</strong>
                      </Td>
                      <Td>{u.militaryNumber}</Td>
                      <Td>{u.rank}</Td>
                      <Td>{u.position}</Td>
                      <Td>
                        <Mono>{u.id}</Mono>
                      </Td>
                      <Td>
                        <RolePill $role={role}>{role}</RolePill>
                      </Td>
                      <Td>
                        {u.permissions.length === 0 ? (
                          <PermEmpty>없음</PermEmpty>
                        ) : (
                          <PermGroup>
                            {u.permissions.includes("CHAT") ? <PermChip $kind="CHAT">CHAT</PermChip> : null}
                            {u.permissions.includes("ADMIN") ? <PermChip $kind="ADMIN">ADMIN</PermChip> : null}
                          </PermGroup>
                        )}
                      </Td>
                      <Td>
                        <Toggle type="button" $on={chatOn} onClick={() => toggleChat(u, !chatOn)}>
                          {chatOn ? "ON" : "OFF"}
                        </Toggle>
                      </Td>
                      <Td>
                        <Toggle type="button" $variant="admin" $on={adminOn} onClick={() => toggleAdmin(u, !adminOn)}>
                          {adminOn ? "ON" : "OFF"}
                        </Toggle>
                      </Td>
                    </Row>
                  );
                })}
              </tbody>
            </Table>
          )}
        </TableWrap>
      </Card>
    </Shell>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth permission="ADMIN">
      <AdminPanel />
    </RequireAuth>
  );
}
