"use client";

import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";

const Section = styled.section`
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  background: var(--surface);
  padding: 1.25rem 1.5rem;
  overflow: hidden;
`;

const Toolbar = styled.div`
  margin-bottom: 1.25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--border);
  border-bottom-color: color-mix(in srgb, var(--branch-accent) 45%, var(--border));
  padding-bottom: 1.25rem;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
`;

const Lead = styled.p`
  margin: 0.35rem 0 0;
  max-width: 42rem;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--text-muted);
`;

const Grid = styled.div`
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
`;

const Card = styled.div`
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface-muted);
  padding: 1rem 1.1rem;
`;

const CardTitle = styled.h3`
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
`;

const CardValue = styled.p`
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-all;
`;

const CardSub = styled.p`
  margin: 0.45rem 0 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.45;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const Btn = styled.button`
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--control-bg);
  cursor: pointer;

  &:hover {
    background: var(--control-hover);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 1rem;
  padding-right: 0.25rem;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
`;

const Th = styled.th`
  text-align: left;
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-weight: 700;
`;

const Td = styled.td`
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  color: var(--text-primary);
  vertical-align: top;
`;

const Mono = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.78rem;
  word-break: break-all;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-top: 1rem;
`;

const Input = styled.input`
  flex: 1;
  min-width: 12rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  background: var(--input-bg);
  color: var(--text-primary);
`;

const JsonBox = styled.pre`
  margin: 0.75rem 0 0;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  background: var(--page-bg);
  font-size: 0.75rem;
  overflow: auto;
  max-height: 12rem;
  color: var(--text-secondary);
`;

const SectionHeading = styled.h3`
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
`;

type LedgerSettings = { enabled?: boolean; ledger_path?: string; hash_algorithm?: string };
type VerifyChain = { valid?: boolean; total_events?: number; broken_at?: number | null; error?: string | null };
type LedgerEvent = Record<string, unknown>;

const BRANCH_KO: Record<string, string> = {
  army: "육군",
  navy: "해군",
  air_force: "공군",
  common: "공통",
};

function ledgerPipelineLabel(ev: LedgerEvent): string {
  const et = typeof ev.event_type === "string" ? ev.event_type : "";
  if (et === "A2A_TASK_COMPLETED") return "A2A";
  if (et === "STANDARD_CHAT_COMPLETED") {
    const p = typeof ev.pipeline === "string" ? ev.pipeline : "";
    if (p === "standard_sync") return "표준·동기";
    if (p === "standard_stream") return "표준·스트림";
    return p ? `표준 (${p})` : "표준";
  }
  return "—";
}

function ledgerBranchLabel(ev: LedgerEvent): string {
  const routing = ev.routing;
  if (!routing || typeof routing !== "object") return "—";
  const r = routing as Record<string, unknown>;
  const bc = r.branches_consulted;
  if (Array.isArray(bc)) {
    const parts = bc.filter((x): x is string => typeof x === "string").map((b) => BRANCH_KO[b] ?? b);
    return parts.length ? parts.join(", ") : "—";
  }
  const br = r.branch;
  if (typeof br === "string" && br.length) return BRANCH_KO[br] ?? br;
  return "—";
}

export function LedgerWorkspace() {
  const [settings, setSettings] = useState<LedgerSettings | null>(null);
  const [verify, setVerify] = useState<VerifyChain | null>(null);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [taskResult, setTaskResult] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [sRes, vRes, eRes] = await Promise.all([
        fetch("/api/a2a/ledger/settings", { cache: "no-store" }),
        fetch("/api/a2a/ledger/verify", { cache: "no-store" }),
        fetch("/api/a2a/ledger/recent?limit=30", { cache: "no-store" }),
      ]);
      const s = (await sRes.json().catch(() => ({}))) as LedgerSettings;
      const v = (await vRes.json().catch(() => ({}))) as VerifyChain;
      const eBody = (await eRes.json().catch(() => ({}))) as { events?: LedgerEvent[] };
      if (!sRes.ok) setErr(typeof (s as { detail?: string }).detail === "string" ? (s as { detail: string }).detail : "설정 조회 실패");
      setSettings(sRes.ok ? s : null);
      setVerify(vRes.ok ? v : null);
      setEvents(Array.isArray(eBody.events) ? eBody.events : []);
    } catch {
      setErr("API 호출 실패");
      setSettings(null);
      setVerify(null);
      setEvents([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function verifyTask() {
    const id = taskId.trim();
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/a2a/ledger/task/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setTaskResult(null);
        setErr(typeof data.detail === "string" ? data.detail : `조회 실패 (${res.status})`);
        return;
      }
      setTaskResult(data);
    } catch {
      setTaskResult(null);
      setErr("task 검증 요청 실패");
    } finally {
      setBusy(false);
    }
  }

  const enabledLabel = settings?.enabled === true ? "ON" : settings?.enabled === false ? "OFF" : "—";
  const chainOk = verify?.valid === true;
  const chainBad = verify?.valid === false;

  return (
    <Section aria-label="로컬 해시 로그">
      <Toolbar>
        <div>
          <Title>로그 (로컬 해시 체인)</Title>
          <Lead>
            질의가 끝나면 동일한 로컬 JSONL에 해시 체인으로 append 됩니다. 표준 채팅은{" "}
            <Mono>STANDARD_CHAT_COMPLETED</Mono>, A2A는 <Mono>A2A_TASK_COMPLETED</Mono> 유형으로 구분됩니다. 환경 변수{" "}
            <Mono>A2A_BLOCKCHAIN_ENABLED=true</Mono> 일 때만 기록되며, 꺼져 있으면 검증은 빈 로그 기준으로 정상입니다.
          </Lead>
        </div>
        <Actions>
          <Btn type="button" onClick={() => void loadAll()} disabled={busy}>
            새로고침
          </Btn>
        </Actions>
      </Toolbar>

      {err ? <CardSub style={{ color: "#b91c1c", marginBottom: "0.5rem" }}>{err}</CardSub> : null}

      <Grid>
        <Card>
          <CardTitle>로그 스위치</CardTitle>
          <CardValue>{enabledLabel}</CardValue>
          <CardSub>{settings?.ledger_path ? `경로: ${settings.ledger_path}` : "백엔드 설정을 불러오지 못했습니다."}</CardSub>
        </Card>
        <Card>
          <CardTitle>전체 체인 검증</CardTitle>
          <CardValue style={{ color: chainBad ? "#b91c1c" : chainOk ? "#0f766e" : "inherit" }}>
            {verify == null ? "—" : chainOk ? "유효" : chainBad ? "무결성 실패" : "—"}
          </CardValue>
          <CardSub>
            이벤트 수: {verify?.total_events ?? "—"}
            {verify?.error ? ` · ${verify.error}` : ""}
          </CardSub>
        </Card>
        <Card>
          <CardTitle>알고리즘</CardTitle>
          <CardValue>{settings?.hash_algorithm ?? "sha256"}</CardValue>
          <CardSub>이전 블록 해시 + canonical JSON 페이로드 결합 후 SHA-256</CardSub>
        </Card>
      </Grid>

      <Row>
        <Input
          placeholder="기록 ID (A2A task_id 또는 표준 채팅 chat_id)"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          aria-label="기록 ID task 또는 chat"
        />
        <Btn type="button" onClick={() => void verifyTask()} disabled={busy || !taskId.trim()}>
          단건 검증
        </Btn>
      </Row>
      {taskResult ? <JsonBox>{JSON.stringify(taskResult, null, 2)}</JsonBox> : null}

      <Scroll>
        <SectionHeading>최근 로그 이벤트</SectionHeading>
        {events.length === 0 ? (
          <CardSub>표시할 이벤트가 없습니다. 채팅 또는 A2A로 질문을 보내고 로그 기록이 켜져 있는지 확인하세요.</CardSub>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>기록 ID</Th>
                <Th>pipeline</Th>
                <Th>branch</Th>
                <Th>사용자 ID</Th>
                <Th>군번</Th>
                <Th>event_hash (앞 12자)</Th>
                <Th>유형</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const integ = (ev.integrity as Record<string, unknown> | undefined) || {};
                const h = typeof integ.event_hash === "string" ? integ.event_hash : "";
                const idx = typeof integ.chain_index === "number" ? integ.chain_index : "—";
                const actor = ev.actor as { user_id?: unknown; military_number?: unknown } | undefined;
                const uid = typeof actor?.user_id === "string" ? actor.user_id : "";
                const mid = typeof actor?.military_number === "string" ? actor.military_number : "";
                const rid =
                  typeof ev.chat_id === "string" && ev.chat_id
                    ? ev.chat_id
                    : typeof ev.task_id === "string"
                      ? ev.task_id
                      : "—";
                return (
                  <tr key={`${h}-${i}`}>
                    <Td>{String(idx)}</Td>
                    <Td>
                      <Mono>{rid}</Mono>
                    </Td>
                    <Td>{ledgerPipelineLabel(ev)}</Td>
                    <Td>{ledgerBranchLabel(ev)}</Td>
                    <Td>
                      <Mono>{uid || "—"}</Mono>
                    </Td>
                    <Td>
                      <Mono>{mid || "—"}</Mono>
                    </Td>
                    <Td>
                      <Mono>{h ? `${h.slice(0, 12)}…` : "—"}</Mono>
                    </Td>
                    <Td>
                      <Mono>{typeof ev.event_type === "string" ? ev.event_type : "—"}</Mono>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Scroll>
    </Section>
  );
}
