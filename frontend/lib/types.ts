export type Conversation = {
  id: string;
  title: string;
  time: string;
  active?: boolean;
};

export type ChatSourceRow = {
  rank: number;
  docId: string;
  serviceBranch?: "army" | "navy" | "air_force";
  title: string;
  year: string;
  page: string;
  quote: string;
  score: string;
};

export type A2aLedgerChip = {
  skipped?: boolean;
  reason?: string;
  chainIndex?: number;
  eventHash?: string;
  previousHash?: string;
  error?: string;
  taskId?: string;
  fromCache?: boolean;
};

export type StandardLedgerChip = {
  chatId: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  time: string;
  /** A2A 응답에 포함된 로컬 해시 로그 메타(선택) */
  a2aLedger?: A2aLedgerChip;
  /** 표준 채팅 스트림의 원장 기록 ID(FastAPI X-Chat-Id)(선택) */
  standardLedger?: StandardLedgerChip;
};

export type ChatMode = "auto" | "rag" | "general";
/** 단일 채팅 스트림 응답 모드 · A2A는 슈퍼바이저 합성 응답 */
export type ChatResponseMode = "rag" | "general" | "a2a";

export type ChatPipeline = "standard" | "a2a";
export type BranchId = "common" | "army" | "navy" | "air_force";

export type BackendSource = {
  service_branch?: "army" | "navy" | "air_force" | null;
  source?: string | null;
  chunk_index?: number | string | null;
  distance?: number | null;
  preview?: string | null;
  document_title?: string | null;
  document_id?: string | null;
  chapter?: string | null;
  section?: string | null;
  pdf_page_start?: string | number | null;
  pdf_page_end?: string | number | null;
};

export type OllamaHealth = {
  reachable: boolean;
  base_url: string;
  model: string;
  models?: string[];
  error?: string;
};

export type LlmHealth = {
  provider?: string;
  base_url?: string;
  reachable?: boolean;
  model?: string | null;
  error?: string | null;
};

export type HealthPayload = {
  status?: string;
  api?: string;
  chroma_documents?: number;
  vector_db?: { documents?: number; collection?: string; path?: string };
  llm?: LlmHealth;
  ollama?: OllamaHealth;
  ollama_reachable?: boolean;
  ollama_model?: string;
  ingest_flag?: boolean;
  ingest_mode?: string;
  chunks_data_dir?: string;
  top_k_max?: number;
  blockchain?: {
    ledger_enabled?: boolean;
    chain_valid?: boolean;
    ledger_events?: number;
    error?: string;
  };
};

export type ChatApiResponse = {
  mode?: ChatResponseMode;
  branch?: BranchId;
  answer: string;
  sources?: BackendSource[];
  route_reason?: string;
  route_confidence?: number;
};
