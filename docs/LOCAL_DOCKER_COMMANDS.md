# 로컬 Docker 실행 명령 모음

Docker Desktop이 켜져 있고, 프로젝트 루트(`doctrine-rag-ollama`)에서 실행합니다.

## 1. 환경 파일

```powershell
cd C:\Users\user\Desktop\doctrine-rag-ollama
copy .env.example .env
notepad .env
```

- **호스트에서 Ollama(11434) 쓸 때:** `OLLAMA_BASE_URL=http://host.docker.internal:11434`
- **Colab + ngrok:** `OLLAMA_BASE_URL=https://xxxx.ngrok-free.dev` (본인 URL)
- **`OLLAMA_MODEL`** 은 원격/로컬에 맞게 유지 (예: `qwen3:8b`)

## 2. 이전 스택 정리 (ollama 컨테이너 등 잔여물 제거)

```powershell
cd C:\Users\user\Desktop\doctrine-rag-ollama
docker compose down --remove-orphans
```

## 3. 빌드 + 백그라운드 기동

```powershell
docker compose up --build -d
```

## 4. 상태·로그

```powershell
docker compose ps
```

```powershell
docker compose logs -f backend
```

```powershell
docker compose logs -f frontend
```

```powershell
docker compose logs -f backend frontend
```

## 5. 중지

```powershell
docker compose down
```

볼륨까지 지우려면 (Chroma·HF 캐시 초기화에 유의):

```powershell
docker compose down -v
```

## 6. 로컬 전용 compose 오버라이드 (`docker-compose.local.yml`)

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
```

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
```

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f backend
```

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

## 7. 원격 Ollama(ngrok) 동작 확인

백엔드 채팅 전에 터미널에서 JSON이 오는지 확인합니다.

```powershell
curl.exe https://your-ngrok-url.ngrok-free.dev/api/tags `
  -H "ngrok-skip-browser-warning: true"
```

## 8. 접속 URL

- 프론트: http://localhost:3000  
- API: http://localhost:8000  
- 헬스: http://localhost:8000/health  

## 9. 참고

- 첫 빌드는 백엔드 이미지에서 `torch` 등이 커서 **수십 분** 걸릴 수 있습니다.  
- 백엔드 헬스체크 `start_period` 동안 대기한 뒤 프론트가 뜹니다.  
- GPU가 필요 없는 임베딩만 컨테이너에서 돌고, LLM은 `OLLAMA_BASE_URL` 로만 붙습니다.
