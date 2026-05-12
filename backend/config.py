"""Configuration — Ollama + local embeddings only (no OpenAI)."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_ROOT = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_ROOT.parent

load_dotenv(_PROJECT_ROOT / ".env")
load_dotenv()

# --- Multi-Branch Doctrine RAG (army/navy/air_force) ---
SERVICE_BRANCHES = ("army", "navy", "air_force")
COLLECTION_MAP: dict[str, str] = {
    "army": os.getenv("CHROMA_COLLECTION_ARMY", "army_doctrine"),
    "navy": os.getenv("CHROMA_COLLECTION_NAVY", "navy_doctrine"),
    "air_force": os.getenv("CHROMA_COLLECTION_AIR_FORCE", "air_force_doctrine"),
}

# 디스크 경로(영구 저장). env 값은 상대 경로면 backend 기준으로 해석됩니다.
_CHROMA_ENV = os.getenv("CHROMA_DIR", "chroma_db").strip() or "chroma_db"
CHROMA_PATH_DISPLAY = _CHROMA_ENV
CHROMA_DIR = (_BACKEND_ROOT / _CHROMA_ENV).resolve()
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "doctrine_ollama")
# 전처리 RAG 청크 CSV 디렉터리 (backend 기준 상대 경로 또는 절대 경로)
_CHUNKS_REL = os.getenv("CHUNKS_DATA_DIR", "data/chunks").strip() or "data/chunks"
CHUNKS_PATH_DISPLAY = _CHUNKS_REL
CHUNKS_DATA_DIR = (_BACKEND_ROOT / _CHUNKS_REL).resolve()
# 비우면 embedding_text → chunk_text → content 순으로 본문 컬럼 자동 선택
CHUNK_TEXT_COLUMN = os.getenv("CHUNK_TEXT_COLUMN", "").strip() or None

INGEST_FLAG_PATH = CHROMA_DIR / ".ingested"

# 군별 청크 디렉터리: backend/data/chunks/{branch}/*.csv
def chunks_dir_for_branch(branch: str) -> Path:
    return (CHUNKS_DATA_DIR / branch).resolve()


PROMPTS_DIR = (_BACKEND_ROOT / "rag" / "prompts").resolve()

_raw_ollama_url = (os.getenv("OLLAMA_BASE_URL") or "http://localhost:11434").strip()
OLLAMA_BASE_URL = _raw_ollama_url.rstrip("/") or "http://localhost:11434"
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
# OLLAMA_TIMEOUT (초) 또는 OLLAMA_TIMEOUT_SECONDS — 미설정 시 180
_ollama_timeout = os.getenv("OLLAMA_TIMEOUT_SECONDS") or os.getenv("OLLAMA_TIMEOUT") or "180"
OLLAMA_TIMEOUT_SECONDS = float(_ollama_timeout)
OLLAMA_MAX_TOKENS = int(os.getenv("OLLAMA_MAX_TOKENS", "512"))
# A2A Supervisor 종합 답변 전용 토큰 상한 (각 군 답변과 별개로 제어)
SYNTHESIS_MAX_TOKENS = int(os.getenv("SYNTHESIS_MAX_TOKENS", "4096"))
OLLAMA_HEALTHCHECK_TIMEOUT = float(os.getenv("OLLAMA_HEALTHCHECK_TIMEOUT", "10"))

# BGE-M3 (1024-dim). 모델을 바꾼 뒤에는 기존 Chroma 벡터 차원과 맞지 않으므로 /reset 또는 chroma_db 삭제 후 재인제스트 필요.
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")

TOP_K_MAX = int(os.getenv("TOP_K_MAX", "20"))
RAG_CHUNK_CHAR_LIMIT = max(200, int(os.getenv("RAG_CHUNK_CHAR_LIMIT", "1200")))
RAG_CONTEXT_CHAR_LIMIT = max(2000, int(os.getenv("RAG_CONTEXT_CHAR_LIMIT", "4500")))
# Chroma distance(hnsw:space=cosine)는 일반적으로 "값이 작을수록 더 유사"입니다.
# RAG를 더 자주 타게 하려면 이 값을 올려(완화) 임계값을 더 관대하게 만듭니다.
RETRIEVAL_MAX_DISTANCE = float(os.getenv("RETRIEVAL_MAX_DISTANCE", "0.85"))

# CSV 인제스트 시 임베딩·Chroma 추가 단위 (행 수). 메모리 부담 줄이기용.
INGEST_BATCH_SIZE = max(1, int(os.getenv("INGEST_BATCH_SIZE", "64")))
# 임베딩 모델 인퍼런스 배치 크기 (OOM 완화용)
EMBEDDING_BATCH_SIZE = max(1, int(os.getenv("EMBEDDING_BATCH_SIZE", "8")))

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "*").split(",")
    if o.strip()
] or ["*"]

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
