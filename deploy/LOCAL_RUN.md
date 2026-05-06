# Local Run (Backup)

AWS 배포와 별개로 로컬에서 항상 재기동할 수 있도록 아래 명령으로 실행합니다.

## 1) 환경 파일 준비

```bash
cp .env.example .env
```

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
