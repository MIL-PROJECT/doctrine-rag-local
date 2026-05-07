# DoctrineRAG · Ollama

전처리된 **RAG 청크 CSV**를 `backend/data/chunks/`에 두고, **로컬 임베딩(SentenceTransformers) + ChromaDB + Ollama**로 질의응답하는 RAG 데모입니다. **OpenAI API·키·의존성은 사용하지 않습니다.**

## 프로젝트 개요

| 구분 | 기술 |
|------|------|
| 프론트 | Next.js 14 |
| API | FastAPI |
| 벡터 DB | ChromaDB (영속 볼륨) |
| 임베딩 | 기본 `BAAI/bge-m3` (`EMBEDDING_MODEL`로 변경 가능, 차원 바뀌면 Chroma 재구축 필요) |
| LLM | Ollama `qwen2.5:3b` (`/api/chat`) |
| 실행 | Docker Compose (`ollama`, `ollama-init`, `backend`, `frontend`) |

사용자는 **문서를 업로드하지 않습니다.** 인제스트 소스는 `backend/data/chunks/*.csv` 행 단위 본문·메타데이터입니다. 원문 참고용 텍스트는 `backend/data/doctrine/`에 둘 수 있으나, **런타임 인제스트는 CSV만** 사용합니다.

## 아키텍처

```text
[Browser] ──► Next.js :3000
                  │
                  ▼ POST /chat
            FastAPI :8000
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
data/chunks    Chroma      Ollama :11434
 (*.csv 행)    (벡터)       (qwen2.5:3b)
 (기동 시
  임베딩·적재)
     │
     ▼
SentenceTransformers
 (질문·청크 임베딩)
```

## RAG 동작

1. **기동 시** (`main` lifespan): Chroma에 문서가 없으면 `data/chunks/*.csv`를 읽어 행마다 임베딩 후 적재하고, 성공 시 `chroma_db/.ingested` 생성  
2. **이후 기동**: 컬렉션에 문서가 있으면 인제스트 생략  
3. **질의**: 질문 임베딩 → Chroma 상위 `top_k` 검색 → 컨텍스트 구성 → Ollama 채팅 → 답변 + 출처  

## OpenAI 대신 Ollama를 쓰는 방식

| 역할 | OpenAI 버전 | 이 저장소 |
|------|-------------|-----------|
| 임베딩 | `embeddings.create` | SentenceTransformers (Hugging Face 캐시) |
| 생성 | Chat Completions | `POST {OLLAMA_BASE_URL}/api/chat`, `stream: false` |
| 인증 | API 키 | 없음 (로컬 Ollama) |

환경 변수 `OLLAMA_BASE_URL`은 Compose에서 `http://ollama:11434` 로 설정합니다.

## Docker로 실행

**요구:** Docker Desktop, 충분한 디스크(RAM 권장 8GB+, 첫 빌드·모델 다운로드에 시간 소요).

```bash
cd doctrine-rag-ollama
docker compose up --build
```

접속:

- UI: http://localhost:3000  
- API: http://localhost:8000  
- 헬스: http://localhost:8000/health  
- Ollama(호스트 디버깅): http://localhost:11434  

### 첫 실행 시 주의 (시간이 오래 걸릴 수 있음)

1. **`ollama-init`**: `qwen2.5:3b` pull (네트워크·용량에 따라 수 분~십 수 분).  
2. **백엔드 기동**: Hugging Face에서 임베딩 모델을 받아 캐시 볼륨에 저장(최초 1회 크고 느릴 수 있음).  
3. **인제스트**: CSV 행 수에 따라 추가 시간.  
4. 프론트는 백엔드 **헬스체크 통과 후** 기동합니다. `start_period`를 길게 두었으나, 여전히 **로그를 보며** 기다리는 것이 안전합니다.

```bash
docker compose logs -f backend ollama-init
```

## API

### `GET /health`

상태, Chroma 문서 수, Ollama 연결 여부, 인제스트 플래그 등.

### `POST /chat`

요청:

```json
{
  "question": "방어작전에서 예비대의 역할은 무엇인가?",
  "top_k": 5
}
```

응답:

```json
{
  "answer": "...",
  "sources": [
    {
      "source": "sample_doctrine.txt",
      "chunk_index": 0,
      "distance": 0.123,
      "preview": "..."
    }
  ]
}
```

### `DELETE /reset`

Chroma 초기화, `.ingested` 삭제 후 **동일 청크 디렉터리에서 재인제스트** (관리/개발용).

**공개 `POST /upload`는 없습니다.**

로컬에서 서버 없이 Chroma만 재적재하려면: `cd backend && python rebuild_chroma.py`

## 데모 질문 예시

- 방어작전의 목적은 무엇인가?  
- 예비대는 어떤 상황에서 운용되는가?  
- 지휘관 판단 시 고려 요소는?  
- RAG가 환각을 줄이는 이유는?

(색인 데이터: `backend/data/chunks`의 CSV — 예: `All_RAG_Chunks.csv`)

## 청크·교리 데이터 넣는 법

1. 전처리된 RAG 청크 CSV를 호스트의 `backend/data/chunks/` 에 추가 (`embedding_text` / `chunk_text` / `content` 등 본문 컬럼은 `chunk_table_loader` 규칙 따름).  
2. 이미 인제스트된 볼륨이면: `docker compose down` 후 Chroma 볼륨 정리 **또는** `DELETE /reset` 호출  
3. 백엔드 재시작 후 반영  

## 트러블슈팅

| 증상 | 점검 |
|------|------|
| 프론트가 안 뜸 | `docker compose logs backend` — 임베딩 다운로드·인제스트 대기 중일 수 있음 |
| `502` / Ollama 오류 | `ollama-init` 성공 여부, `docker compose logs ollama-init`. 호스트에서 `curl http://localhost:11434/api/tags` |
| 인덱스 0건 | `backend/data/chunks`에 `*.csv`가 있는지, 본문 컬럼이 비어 있지 않은지 |
| 느리다 | CPU만 사용 시 임베딩·LLM 모두 느림. 더 작은 Ollama 모델·짧은 문서로 테스트 |
| 디스크 부족 | `docker system prune`, HF/Ollama 볼륨 정리 |

## 로컬 개발 (선택)

- Backend: `cd backend && pip install -r requirements.txt` 후 Ollama를 호스트에 띄우고 `OLLAMA_BASE_URL=http://127.0.0.1:11434 uvicorn main:app --reload`  
- Frontend: `cd frontend && npm install && npm run dev`  
- 루트에서 프론트만: `npm install` 후 `npm run dev` (루트 `package.json`이 `frontend`로 위임)  
- Docker 없이 쓸 때도 `data/chunks`·`chroma_db` 경로는 백엔드 기준으로 동일하게 유지하세요.

## 디렉터리 구조

```text
doctrine-rag-ollama/
├─ backend/
│  ├─ main.py
│  ├─ config.py
│  ├─ chunk_table_loader.py
│  ├─ embeddings.py
│  ├─ vector_store.py
│  ├─ llm.py
│  ├─ rag_service.py
│  ├─ ingest_seed.py
│  ├─ rebuild_chroma.py
│  ├─ requirements.txt
│  ├─ Dockerfile
│  ├─ data/chunks/       # 인제스트용 RAG 청크 CSV (*.csv)
│  ├─ data/doctrine/     # 원문 참고·샘플 (런타임 인제스트 대상 아님)
│  └─ chroma_db/         # 로컬 개발용 (Compose는 볼륨 마운트)
├─ frontend/
├─ deploy/               # AWS 등 배포 스크립트·문서
├─ docker-compose.yml
├─ docker-compose.local.yml
├─ package.json          # 프론트 npm 스크립트 위임용
├─ .env.example
└─ README.md
```

## 라이선스

데모·교육용. 문서 내용·배포 환경에 맞게 이용약관·보안을 별도 검토하세요.
