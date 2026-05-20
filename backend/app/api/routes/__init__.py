from fastapi import APIRouter

from app.api.routes import a2a, admin, chat, documents, health, llm_routes

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(chat.router)
api_router.include_router(documents.router)
api_router.include_router(admin.router)
api_router.include_router(llm_routes.router)
api_router.include_router(a2a.router)

__all__ = ["api_router"]
