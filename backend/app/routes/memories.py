"""
RecallAI Memories Route
GET /memories endpoint for retrieving user memories.
"""
from fastapi import APIRouter, Query, HTTPException, status
from backend.app.schemas import MemoriesResponse, USER_ID_REGEX
from backend.app.services.memory_store import memory_store

router = APIRouter(tags=["Memories"])

@router.get("/memories", response_model=MemoriesResponse)
def get_user_memories(
    user_id: str = Query(..., description="Unique alphanumeric user identifier")
) -> MemoriesResponse:
    """
    Returns all memories for the specified user (active and resolved),
    sorted with newest memories first.
    """
    user_id = user_id.strip()
    if not USER_ID_REGEX.match(user_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid user_id format: '{user_id}'. Must match ^[a-z0-9_-]{{3,40}}$"
        )

    memories = memory_store.get_all_memories(user_id)
    return MemoriesResponse(memories=memories)
