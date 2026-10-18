"""
RecallAI Chat Sessions Routes
Provides REST endpoints for session history, restoration, renaming, and deletion.
Strictly parameterizes all queries and enforces user_id filtering for tenant isolation.
"""
import logging
from typing import List
from fastapi import APIRouter, Query, Path, HTTPException, status
from backend.app.schemas import (
    SessionSummary,
    SessionDetailResponse,
    RenameSessionRequest,
    DeleteSessionResponse,
    USER_ID_REGEX,
    SESSION_ID_REGEX
)
from backend.app.services.chat_history import chat_history_service

logger = logging.getLogger("recallai.sessions")

router = APIRouter(tags=["Sessions"])

def _validate_user_id(user_id: str) -> str:
    cleaned = user_id.strip() if user_id else ""
    if not USER_ID_REGEX.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid user_id format: '{user_id}'. Must match ^[a-z0-9_-]{{3,40}}$"
        )
    return cleaned

def _validate_session_id(session_id: str) -> str:
    cleaned = session_id.strip() if session_id else ""
    if not SESSION_ID_REGEX.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid session_id format: '{session_id}'. Must match ^[a-z0-9_-]{{3,64}}$"
        )
    return cleaned

@router.get("/sessions", response_model=List[SessionSummary])
def list_user_sessions(
    user_id: str = Query(..., description="Unique user identifier")
) -> List[SessionSummary]:
    """
    Lists recent chat sessions for the specified user, newest first (max 50).
    """
    valid_user_id = _validate_user_id(user_id)
    try:
        sessions = chat_history_service.list_sessions(user_id=valid_user_id, limit=50)
        return [
            SessionSummary(
                id=s["id"],
                title=s["title"],
                updated_at=s["updated_at"],
                created_at=s.get("created_at")
            )
            for s in sessions
        ]
    except Exception as e:
        logger.error("Failed to list sessions: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve chat sessions from history service."
        )

@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session_detail(
    session_id: str = Path(..., description="Session identifier"),
    user_id: str = Query(..., description="Unique user identifier")
) -> SessionDetailResponse:
    """
    Retrieves all messages for a session in order, including full turn metadata.
    Returns 404 if the session does not belong to user_id or does not exist.
    """
    valid_user_id = _validate_user_id(user_id)
    valid_session_id = _validate_session_id(session_id)

    try:
        session_data = chat_history_service.get_session_messages(
            session_id=valid_session_id,
            user_id=valid_user_id
        )
    except Exception as e:
        logger.error("Failed to get session messages: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve session detail from history service."
        )

    if session_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{valid_session_id}' not found for user '{valid_user_id}'."
        )

    return SessionDetailResponse(
        id=session_data["id"],
        title=session_data["title"],
        user_id=session_data["user_id"],
        messages=session_data.get("messages", []),
        created_at=session_data.get("created_at"),
        updated_at=session_data.get("updated_at")
    )

@router.patch("/sessions/{session_id}", response_model=SessionSummary)
def rename_session(
    body: RenameSessionRequest,
    session_id: str = Path(..., description="Session identifier")
) -> SessionSummary:
    """
    Renames a chat session. Returns 404 if the session does not exist or belong to user_id.
    """
    valid_session_id = _validate_session_id(session_id)

    try:
        updated = chat_history_service.rename_session(
            session_id=valid_session_id,
            user_id=body.user_id,
            title=body.title
        )
    except Exception as e:
        logger.error("Failed to rename session: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to rename session in history service."
        )

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{valid_session_id}' not found for user '{body.user_id}'."
        )

    return SessionSummary(
        id=updated["id"],
        title=updated["title"],
        updated_at=updated["updated_at"],
        created_at=updated.get("created_at")
    )

@router.delete("/sessions/{session_id}", response_model=DeleteSessionResponse)
def delete_session(
    session_id: str = Path(..., description="Session identifier"),
    user_id: str = Query(..., description="Unique user identifier")
) -> DeleteSessionResponse:
    """
    Deletes a session and its cascading messages. Returns 404 if session does not exist.
    """
    valid_user_id = _validate_user_id(user_id)
    valid_session_id = _validate_session_id(session_id)

    try:
        deleted = chat_history_service.delete_session(
            session_id=valid_session_id,
            user_id=valid_user_id
        )
    except Exception as e:
        logger.error("Failed to delete session: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete session in history service."
        )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{valid_session_id}' not found for user '{valid_user_id}'."
        )

    return DeleteSessionResponse(status="deleted", id=valid_session_id)
