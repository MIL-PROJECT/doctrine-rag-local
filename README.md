# DoctrineRAG · Ollama

전처리된 **RAG 청크 CSV**를 `backend/data/chunks/{army,navy,air_force}/`에 두고, **로컬 임베딩(SentenceTransformers) + 단일 ChromaDB 디렉터리 + 군별 컬렉션 + 원격 Ollama**로 질의응답하는 **Multi-Branch Doctrine RAG** 데모입니다. LLM은 **Google Colab GPU에서 실행하는 Ollama**를 **ngrok 등 공개 HTTPS URL**로 붙이는 구성을 기준으로 합니다. **OpenAI API·키·의존성은 사용하지 않습니다.**

## 프로젝트 개요

| 구분 | 기술 |
|------|------|
| 프론트 | Next.js 14 (Docker 또는 로컬) |
| API | FastAPI (Docker) |
| 벡터 DB | ChromaDB (로컬 영속 볼륨) |
| 임베딩 | 기본 `BAAI/bge-m3` (`EMBEDDING_MODEL`로 변경 가능) |
| LLM | Ollama `qwen2.5:3b` 등 — **`POST {OLLAMA_BASE_URL}/api/chat`** |
| 실행 | Docker Compose (**`frontend` + `backend`만**; Ollama 컨테이너 없음) |

사용자는 **문서를 업로드하지 않습니다.** 인제스트 소스는 `backend/data/chunks/{branch}/*.csv` 행 단위 본문·메타데이터이며, **branch(육군/해군/공군)마다 Chroma 컬렉션이 분리**됩니다. 원문 참고용 텍스트는 `backend/data/doctrine/`에 둘 수 있으나, **런타임 인제스트는 CSV만** 사용합니다.

## 아키텍처 (Multi-Branch)

```text
Frontend (로컬 Docker)
        ↓
Backend + RAG (로컬 Docker)
        ↓
ChromaDB (로컬 영속 저장)
        ↓  (검색된 컨텍스트만)
Remote Ollama — Colab GPU 위 ollama serve + ngrok → HTTPS (LLM은 1개 공유)
        ↑
ChromaDB collections: army_doctrine / navy_doctrine / air_force_doctrine
```

**Colab GPU를 쓰는 이유:** 무료/저비용으로 GPU에 가까운 추론 환경을 쓰기 쉽고, 로컬 머신에서는 임베딩·Chroma만 두고 무거운 생성은 원격으로 분리할 수 있습니다.

**ngrok이 필요한 이유:** Colab 런타임의 Ollama는 인터넷에서 바로 보이지 않습니다. 터널(ngrok 등)로 **공개 URL**을 만들어야 Docker 안의 백엔드가 `OLLAMA_BASE_URL`로 HTTP 접근할 수 있습니다.

## Hybrid Query Router 동작

1. **기동 시**: `backend/data/chunks/{army,navy,air_force}/*.csv`를 군별로 읽어 **각 컬렉션(army_doctrine/navy_doctrine/air_force_doctrine)** 에 적재합니다.  
2. **이후 기동**: 해당 군 컬렉션에 문서가 있으면 인제스트를 생략합니다(군별 플래그 `.ingested_{branch}`).  
3. **질의 (`POST /chat`)**: `mode=auto|rag|general`에 따라 라우팅됩니다.  
   - `rag`: 군(branch)별 컬렉션 검색 + 군별 프롬프트
   - `general`: Chroma 검색 없이 Ollama 일반 채팅
   - `auto`: 하이브리드 라우터가 질문 의도를 판별
     - Step 1: 일반 키워드 강한 경우 `general`
     - Step 2: 교리 키워드 강한 경우 `rag`
     - Step 3: 애매한 질문은 검색 거리 기반 판정 (`RETRIEVAL_MAX_DISTANCE`)

CSV 행은 **재청킹하지 않습니다.** 본문은 `embedding_text` → `chunk_text` → `content` 순으로 선택하고, 나머지 컬럼은 메타데이터로 저장합니다.
추가로 `metadata["service_branch"] = branch`가 자동으로 들어갑니다.

## 환경 변수 (`OLLAMA_BASE_URL`)

- **로컬에서 Ollama만 띄운 경우:** `OLLAMA_BASE_URL=http://localhost:11434` (호스트에서 `uvicorn` 실행 시)  
- **Docker Compose로 백엔드를 띄우는 경우:** 컨테이너의 `localhost`는 호스트가 아니므로 **`https://xxxx.ngrok-free.app` 같은 공개 URL**을 `.env`에 넣어야 합니다.  
- 프로덕션/개발 모두 **동일 변수**로 덮어씁니다. **하드코딩된 `http://ollama:11434`는 사용하지 않습니다.**

`.env.example`을 복사해 `.env`를 만든 뒤 ngrok URL을 설정하세요.

```bash
cp .env.example .env
# 편집: OLLAMA_BASE_URL=https://your-subdomain.ngrok-free.app
# (선택) 애매한 질문의 RAG 판정 임계값
# RETRIEVAL_MAX_DISTANCE=0.75
```

### 원격 Ollama·ngrok 동작 확인 (필수)

백엔드 채팅이 되려면 **ngrok URL이 Ollama JSON을 반환**해야 합니다. 무료 ngrok는 아래 헤더 없이 HTML 경고만 줄 수 있으므로, 터미널에서 먼저 확인하세요.

```powershell
curl.exe https://your-ngrok-url.ngrok-free.dev/api/tags `
  -H "ngrok-skip-browser-warning: true"
```

응답에 `"models": [...]` 가 포함된 JSON이 와야 합니다. HTML이 오면 URL·헤더·Colab의 `ollama serve` 상태를 다시 점검하세요. 백엔드는 동일 헤더로 `/api/tags`와 `/api/chat`을 호출합니다.

## Colab에서 Ollama 기동 (요약)

1. Colab에서 GPU 런타임 선택 후 Ollama 설치·실행 (예: `ollama serve`가 **11434**에서 대기).  
2. 동일 런타임에서 사용할 모델 pull (예: `ollama pull qwen2.5:3b`).  
3. ngrok 등으로 **11434**를 인터넷에 노출하고, 발급된 **HTTPS 기본 URL**을 복사합니다.  
4. 로컬/서버의 `.env`에서 `OLLAMA_BASE_URL`을 그 URL로 설정하고 백엔드를 재시작합니다.  

Colab 세션이 끊기면 터널 URL도 무효화될 수 있으므로, 그때마다 ngrok URL을 갱신해야 합니다.

## Docker로 실행

**요구:** Docker Desktop, 충분한 디스크(RAM 권장 8GB+, 첫 빌드·임베딩 모델 다운로드에 시간 소요). **사전에 `.env`에 유효한 `OLLAMA_BASE_URL`을 넣어 두세요.**

```bash
cd doctrine-rag-ollama
docker compose up --build
```

### 개발 모드 (핫리로드, 재빌드 최소화)

코드 수정을 빠르게 반영하려면 `docker-compose.local.yml` 오버라이드를 사용하세요.

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

- backend: `uvicorn --reload` + `./backend:/app` 바인드 마운트
- frontend: `npm run dev` + `./frontend:/app` 바인드 마운트
- 코드 저장 시 컨테이너 재빌드 없이 반영됩니다.

종료:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

접속:

- UI: http://localhost:3000  
- API: http://localhost:8000  
- 헬스: http://localhost:8000/health  

### 첫 실행 시 주의

1. **백엔드 기동**: Hugging Face에서 임베딩 모델을 받아 캐시 볼륨에 저장(최초 1회 느릴 수 있음).  
2. **인제스트**: CSV 행 수에 따라 추가 시간.  
3. **원격 Ollama**: Colab·ngrok이 꺼져 있으면 채팅 답변 대신 안내 문구가 반환되고, `/health`의 `ollama.reachable`이 `false`입니다.  

```bash
docker compose logs -f backend
```

## API

### `GET /health`

상태, 군별 벡터 문서 수, 인제스트 진행 여부, 원격 Ollama 상태를 반환합니다.

정상 시:

```json
{
  "api": "ok",
  "status": "ok",
  "ollama": {
    "reachable": true,
    "base_url": "https://xxxx.ngrok-free.dev",
    "model": "qwen2.5:3b",
    "models": ["qwen2.5:3b"]
  },
  "vector_db": {
    "army_doctrine": 0,
    "navy_doctrine": 256,
    "air_force_doctrine": 0
  },
  "chroma_documents": 256,
  "ingest_mode": "csv_chunks",
  "ingest_in_progress": false,
  "top_k_max": 20
}
```

불가 시:

```json
{
  "api": "ok",
  "ollama": {
    "reachable": false,
    "base_url": "https://xxxx.ngrok-free.dev",
    "model": "qwen2.5:3b",
    "error": "Remote Ollama server unavailable"
  },
  "vector_db": {
    "army_doctrine": 0,
    "navy_doctrine": 256,
    "air_force_doctrine": 0
  }
}
```

호환을 위해 `chroma_documents`, `ollama_reachable`, `ollama_model` 필드도 유지합니다.

### `POST /chat`

요청:

```json
{
  "branch": "navy",
  "question": "방어작전에서 예비대의 역할은 무엇인가?",
  "top_k": 5,
  "mode": "auto"
}
```

지원 모드:

- `auto` (기본): 하이브리드 라우터가 `rag/general` 자동 선택
- `rag`: 항상 branch 기반 RAG 사용
- `general`: 항상 일반 채팅 사용(출처 없음)

응답:

```json
{
  "mode": "rag",
  "branch": "navy",
  "answer": "...",
  "sources": [...],
  "route_reason": "keyword_doctrine_only(d=2)",
  "route_confidence": 0.88
}
```

일반 채팅 응답 예시:

```json
{
  "mode": "general",
  "branch": "navy",
  "answer": "...",
  "sources": [],
  "route_reason": "keyword_general_only(g=1)",
  "route_confidence": 0.81
}
```

원격 Ollama에 연결할 수 없으면 `answer`에 **프론트에 표시 가능한 영문 안내**가 담깁니다 (예: `Remote Ollama server is unavailable. Please check Colab and ngrok URL.`).

검증 규칙:

- `mode`는 `auto|rag|general`만 허용
- `branch`는 `army|navy|air_force`만 허용
- `general` 모드는 branch를 보내도 검색에는 사용하지 않음
- `rag` 모드는 branch 기준 컬렉션 검색을 수행

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

## Hybrid Router 수동 테스트

아래 요청은 `POST /chat` 기준입니다.

1. `"오늘 저녁 추천해줘"`  
   기대: `mode=general`, `sources=[]`
2. `"해상작전에서 지휘통제의 핵심은?"` (`branch=navy`)  
   기대: `mode=rag`, `sources` 존재(해군 데이터가 있으면)
3. `"공군 출신인데 오늘 저녁 뭐 먹을까?"`  
   기대: `mode=general`
4. `"공군 교리에서 공중작전 개념 설명해줘"` (`branch=air_force`)  
   기대: `mode=rag`
5. `"예비대 역할은?"`  
   기대: 거리 기반 자동 분기  
   - best distance ≤ `RETRIEVAL_MAX_DISTANCE` → `rag`  
   - best distance > `RETRIEVAL_MAX_DISTANCE` → `general`

## 청크·교리 데이터 넣는 법

1. 전처리된 RAG 청크 CSV를 호스트의 `backend/data/chunks/` 에 추가.  
2. 이미 인제스트된 볼륨이면: `docker compose down` 후 Chroma 볼륨 정리 **또는** `DELETE /reset` 호출  
3. 백엔드 재시작 후 반영  

## 트러블슈팅

| 증상 | 점검 |
|------|------|
| 프론트가 안 뜸 | `docker compose logs backend` — 임베딩 다운로드·인제스트 대기 중일 수 있음 |
| Ollama 연결 안 됨 | `.env`의 `OLLAMA_BASE_URL`, Colab 세션·ngrok 만료, 방화벽. `curl {OLLAMA_BASE_URL}/api/tags` |
| 채팅만 실패 | 원격에서 모델 pull 여부, `OLLAMA_MODEL` 이름 일치 |
| 인덱스 0건 | `backend/data/chunks`에 `*.csv`가 있는지, 본문 컬럼이 비어 있지 않은지 |
| 느리다 | Colab GPU·네트워크 지연, 더 작은 모델로 테스트 |
| 디스크 부족 | `docker system prune`, HF 캐시 볼륨 정리 |

## 로컬 개발 (선택)

- Backend: `cd backend && pip install -r requirements.txt` 후 `OLLAMA_BASE_URL=http://127.0.0.1:11434 uvicorn main:app --reload` (호스트에서 Ollama를 직접 띄운 경우)  
- Frontend: `cd frontend && npm install && npm run dev`  
- 루트에서 프론트만: `npm install` 후 `npm run dev`  

Docker 없이 쓸 때도 `data/chunks`·`chroma_db` 경로는 백엔드 기준으로 동일하게 유지하세요.

## 디렉터리 구조

```text
doctrine-rag-ollama/
├─ backend/
│  ├─ main.py
│  ├─ config.py
│  ├─ rag/
│  │  ├─ query_router.py
│  │  └─ prompts/
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
├─ docker-compose.yml    # frontend + backend 만
├─ docker-compose.local.yml
├─ package.json
├─ .env.example
└─ README.md
```

## 라이선스

데모·교육용. 문서 내용·배포 환경에 맞게 이용약관·보안을 별도 검토하세요.
