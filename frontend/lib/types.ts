export type Conversation = {
  id: string;
  title: string;
  time: string;
  active?: boolean;
};

export type ChatSourceRow = {
  rank: number;
  docId: string;
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

export type BackendSource = {
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
  vector_db?: { documents?: number; collection?: string; path?: string };
  chroma_documents?: number;
  ollama?: OllamaHealth;
  ollama_reachable?: boolean;
  ollama_model?: string;
  ingest_flag?: boolean;
  /** Preprocessed chunk CSV directory (backend env CHUNKS_DATA_DIR) */
  chunks_data_dir?: string;
};

export type ChatApiResponse = {
  answer: string;
  citations?: BackendSource[];
  related_topics?: string[];
};
