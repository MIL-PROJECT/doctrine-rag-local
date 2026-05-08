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

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  time: string;
};

export type ChatMode = "auto" | "rag" | "general";
export type ChatResponseMode = "rag" | "general";
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

export type HealthPayload = {
  status?: string;
  api?: string;
  chroma_documents?: number;
  vector_db?: { documents?: number; collection?: string; path?: string };
  ollama?: OllamaHealth;
  ollama_reachable?: boolean;
  ollama_model?: string;
  ingest_flag?: boolean;
  ingest_mode?: string;
  chunks_data_dir?: string;
  top_k_max?: number;
};

export type ChatApiResponse = {
  mode?: ChatResponseMode;
  branch?: BranchId;
  answer: string;
  sources?: BackendSource[];
  route_reason?: string;
  route_confidence?: number;
};
