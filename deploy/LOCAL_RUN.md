# Local Run (Backup)

AWS 배포와 별개로 로컬에서 항상 재기동할 수 있도록 아래 명령으로 실행합니다.

## 1) 환경 파일 준비

```bash
cp .env.example .env
```

`.env`의 **`OLLAMA_BASE_URL`** 을 Colab+ngrok 등 **원격 Ollama의 공개 URL**로 설정합니다. Docker 백엔드는 호스트의 `localhost:11434`에 직접 닿을 수 없습니다.

이미 `.env`가 있으면 생략합니다.

## 2) 로컬 전용 compose 오버라이드로 실행

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

## 3) 상태 확인

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f backend
```

## 4) 접속 주소

- UI: http://localhost:3000
- API: http://localhost:8000

## 5) 중지

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```
