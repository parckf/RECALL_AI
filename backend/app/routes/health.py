"""
RecallAI Health Route
GET /health endpoint verifying database connectivity and LLM configuration state.
"""
from fastapi import APIRouter, Response, status
from backend.app.schemas import HealthResponse
from backend.app.database import db_manager
from backend.app.config import settings
from backend.app.services.chat_history import chat_history_service

router = APIRouter(tags=["Health"])

@router.get("/health", response_model=HealthResponse)
def get_health(response: Response) -> HealthResponse:
    """
    Checks database connectivity, LLM configuration, and Supabase status without making paid API calls.
    Returns 200 OK when FalkorDB is connected, or 503 Service Unavailable when disconnected.
    Never exposes API keys or secrets.
    """
    db_connected = db_manager.check_health()
    llm_ready = settings.is_llm_configured
    supabase_status = chat_history_service.check_health()

    if db_connected:
        return HealthResponse(
            status="ok",
            database="connected",
            llm_configured=llm_ready,
            supabase=supabase_status
        )
    else:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(
            status="degraded",
            database="disconnected",
            llm_configured=llm_ready,
            supabase=supabase_status
        )
