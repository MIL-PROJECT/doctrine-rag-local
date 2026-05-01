"""Configuration — Ollama + local embeddings only (no OpenAI)."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_ROOT = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_ROOT.parent

load_dotenv(_PROJECT_ROOT / ".env")
load_dotenv()

CHROMA_DIR = _BACKEND_ROOT / os.getenv("CHROMA_DIR", "chroma_db")
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "doctrine_ollama")
DOCTRINE_DATA_DIR = _BACKEND_ROOT / os.getenv("DOCTRINE_DATA_DIR", "data/doctrine")
INGEST_FLAG_PATH = CHROMA_DIR / ".ingested"

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "300"))

EMBEDDING_MODEL_NAME = os.getenv(
    "EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "900"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))
TOP_K_MAX = int(os.getenv("TOP_K_MAX", "20"))

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "*").split(",")
    if o.strip()
] or ["*"]

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
