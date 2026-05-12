/**
 * PoC / 발표용: 인증·권한은 브라우저 localStorage에만 저장됩니다.
 * 운영 환경에서는 반드시 백엔드 JWT, RDBMS, bcrypt/argon2 등으로 비밀번호 해시,
 * 서버 측 권한 검증(authorization)을 적용해야 합니다.
 */

export type Permission = "CHAT" | "ADMIN";
export type UserRole = "USER" | "ADMIN";

export type DoctrineUser = {
  id: string;
  password: string;
  name: string;
  militaryNumber: string;
  rank: string;
  position: string;
  role: UserRole;
  permissions: Permission[];
};

export type RegisterUserInput = {
  name: string;
  militaryNumber: string;
  rank: string;
  position: string;
  id: string;
  password: string;
};

const STORAGE_USERS = "doctrine_rag_users";
const STORAGE_SESSION = "doctrine_rag_session";
const STORAGE_CHAT_REQUESTS = "doctrine_rag_chat_requests";

const AUTO_CHAT_RANKS = new Set(["중령", "대령", "준장", "소장"]);
const AUTO_CHAT_POSITIONS = new Set(["지휘관", "참모장", "작전참모", "정보참모"]);

export const DEFAULT_USERS: DoctrineUser[] = [
  {
    id: "admin",
    password: "admin1234",
    name: "관리자",
    militaryNumber: "ADMIN-0001",
    rank: "대령",
    position: "관리자",
    role: "ADMIN",
    permissions: ["CHAT", "ADMIN"],
  },
  {
    id: "staff01",
    password: "staff1234",
    name: "참모사용자",
    militaryNumber: "STAFF-0001",
    rank: "소령",
    position: "작전참모",
    role: "USER",
    permissions: ["CHAT"],
  },
];

function cloneDefaultUsers(): DoctrineUser[] {
  return DEFAULT_USERS.map((u) => ({ ...u, permissions: [...u.permissions] }));
}

function readRawUsers(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_USERS);
}

function writeRawUsers(json: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_USERS, json);
}

function readSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_SESSION);
}

function writeSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id === null) window.localStorage.removeItem(STORAGE_SESSION);
  else window.localStorage.setItem(STORAGE_SESSION, id);
}

function deriveRole(permissions: Permission[]): UserRole {
  return permissions.includes("ADMIN") ? "ADMIN" : "USER";
}

export function initialPermissionsForRegister(rank: string, position: string): Permission[] {
  const r = rank.trim();
  const p = position.trim();
  const perms: Permission[] = [];
  if (AUTO_CHAT_RANKS.has(r) || AUTO_CHAT_POSITIONS.has(p)) {
    perms.push("CHAT");
  }
  return perms;
}

export function getUsers(): DoctrineUser[] {
  if (typeof window === "undefined") return [];
  const raw = readRawUsers();
  if (!raw) {
    const initial = cloneDefaultUsers();
    writeRawUsers(JSON.stringify(initial));
    return initial;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return cloneDefaultUsers();
    return parsed as DoctrineUser[];
  } catch {
    return cloneDefaultUsers();
  }
}

export function saveUsers(users: DoctrineUser[]) {
  if (typeof window === "undefined") return;
  writeRawUsers(JSON.stringify(users));
}

export function login(id: string, password: string): { ok: true } | { ok: false; error: string } {
  const trimmedId = id.trim();
  const users = getUsers();
  const user = users.find((u) => u.id === trimmedId);
  if (!user || user.password !== password) {
    return { ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }
  writeSessionId(user.id);
  return { ok: true };
}

export function logout() {
  writeSessionId(null);
}

export function getCurrentUser(): DoctrineUser | null {
  if (typeof window === "undefined") return null;
  const sessionId = readSessionId();
  if (!sessionId) return null;
  const users = getUsers();
  return users.find((u) => u.id === sessionId) ?? null;
}

export function registerUser(input: RegisterUserInput): { ok: true } | { ok: false; error: string } {
  const name = input.name.trim();
  const militaryNumber = input.militaryNumber.trim();
  const rank = input.rank.trim();
  const position = input.position.trim();
  const id = input.id.trim();
  const password = input.password;

  if (!name || !militaryNumber || !rank || !position || !id || !password) {
    return { ok: false, error: "모든 항목을 입력해 주세요." };
  }

  const users = getUsers();
  if (users.some((u) => u.id === id)) {
    return { ok: false, error: "이미 사용 중인 ID입니다." };
  }

  const permissions = initialPermissionsForRegister(rank, position);
  const newUser: DoctrineUser = {
    id,
    password,
    name,
    militaryNumber,
    rank,
    position,
    role: deriveRole(permissions),
    permissions,
  };

  saveUsers([...users, newUser]);
  return { ok: true };
}

export function hasPermission(user: DoctrineUser | null, permission: Permission): boolean {
  if (!user) return false;
  return user.permissions.includes(permission);
}

export function normalizePermissions(perms: Permission[]): Permission[] {
  const s = new Set(perms);
  if (s.has("ADMIN")) s.add("CHAT");
  return Array.from(s) as Permission[];
}

export function setUserPermissions(
  userId: string,
  next: Permission[],
): { ok: true } | { ok: false; error: string } {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return { ok: false, error: "사용자를 찾을 수 없습니다." };

  const dedup = normalizePermissions(Array.from(new Set(next)) as Permission[]);

  const adminCount = users.filter((u) => u.permissions.includes("ADMIN")).length;
  const wasAdmin = users[idx].permissions.includes("ADMIN");
  const willBeAdmin = dedup.includes("ADMIN");
  if (wasAdmin && !willBeAdmin && adminCount <= 1) {
    return { ok: false, error: "시스템에 최소 1명의 관리자(ADMIN)가 필요합니다." };
  }

  const updated = { ...users[idx], permissions: dedup, role: deriveRole(dedup) };
  const copy = [...users];
  copy[idx] = updated;
  saveUsers(copy);
  return { ok: true };
}

export type ChatAccessRequestStatus = "pending" | "approved" | "dismissed";

export type ChatAccessRequest = {
  id: string;
  userId: string;
  name: string;
  militaryNumber: string;
  rank: string;
  position: string;
  createdAt: string;
  status: ChatAccessRequestStatus;
};

export type ChatAccessRequestProfile = {
  userId: string;
  name: string;
  militaryNumber: string;
  rank: string;
  position: string;
};

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readChatRequestsRaw(): ChatAccessRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_CHAT_REQUESTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ChatAccessRequest[];
  } catch {
    return [];
  }
}

function writeChatRequests(requests: ChatAccessRequest[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_CHAT_REQUESTS, JSON.stringify(requests));
}

export function getChatAccessRequests(): ChatAccessRequest[] {
  return readChatRequestsRaw();
}

export function getPendingChatAccessRequests(): ChatAccessRequest[] {
  return readChatRequestsRaw()
    .filter((r) => r.status === "pending")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function createChatAccessRequest(
  profile: ChatAccessRequestProfile,
): { ok: true } | { ok: false; error: string } {
  const users = getUsers();
  const user = users.find((u) => u.id === profile.userId);
  if (!user) {
    return { ok: false, error: "등록된 사용자를 찾을 수 없습니다." };
  }
  if (user.permissions.includes("CHAT")) {
    return { ok: false, error: "이미 CHAT 권한이 있습니다. 다시 로그인해 보세요." };
  }
  const list = readChatRequestsRaw();
  if (list.some((r) => r.userId === profile.userId && r.status === "pending")) {
    return { ok: false, error: "이미 접수된 요청이 있습니다. 관리자 승인을 기다려 주세요." };
  }
  const row: ChatAccessRequest = {
    id: newRequestId(),
    userId: profile.userId,
    name: profile.name,
    militaryNumber: profile.militaryNumber,
    rank: profile.rank,
    position: profile.position,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  writeChatRequests([...list, row]);
  return { ok: true };
}

export function approveChatAccessRequest(
  requestId: string,
): { ok: true } | { ok: false; error: string } {
  const list = readChatRequestsRaw();
  const idx = list.findIndex((r) => r.id === requestId && r.status === "pending");
  if (idx < 0) {
    return { ok: false, error: "대기 중인 요청을 찾을 수 없습니다." };
  }
  const req = list[idx];
  const users = getUsers();
  const u = users.find((x) => x.id === req.userId);
  if (!u) {
    return { ok: false, error: "사용자가 삭제되었거나 찾을 수 없습니다." };
  }
  const next = normalizePermissions([...u.permissions, "CHAT"] as Permission[]);
  const permRes = setUserPermissions(req.userId, next);
  if (!permRes.ok) {
    return permRes;
  }
  const copy = [...list];
  copy[idx] = { ...req, status: "approved" };
  writeChatRequests(copy);
  return { ok: true };
}

export function dismissChatAccessRequest(requestId: string): void {
  const list = readChatRequestsRaw();
  const idx = list.findIndex((r) => r.id === requestId && r.status === "pending");
  if (idx < 0) return;
  const copy = [...list];
  copy[idx] = { ...list[idx], status: "dismissed" };
  writeChatRequests(copy);
}
