"""
RecallAI Pydantic Schemas
Single source of truth matching docs/API_CONTRACT.md.
"""
import re
from typing import List, Optional, Literal, Union
from pydantic import BaseModel, Field, field_validator, ConfigDict

USER_ID_REGEX = re.compile(r"^[a-z0-9_-]{3,40}$")
SESSION_ID_REGEX = re.compile(r"^[a-z0-9_-]{3,64}$")

# Health
class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["connected", "disconnected"]
    llm_configured: bool
    supabase: Literal["connected", "unavailable", "not_configured"] = "not_configured"

# Memory
class MemoryItem(BaseModel):
    id: str
    kind: Literal["LEARNS", "STRUGGLES_WITH", "PREFERS", "GOAL"]
    value: str
    status: Literal["active", "resolved"]
    origin: Literal["user_stated", "curated"]
    source_text: str
    session_id: str
    created_at: str
    action: Optional[Literal["created", "already_known", "resolved"]] = None

# Evidence Traversal
class EvidenceStep(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_node: str = Field(..., alias="from")
    relation: str
    to_node: str = Field(..., alias="to")
    origin: Literal["You said", "Curated"]

class EvidencePath(BaseModel):
    steps: List[EvidenceStep]

# Warnings
class WarningItem(BaseModel):
    stage: Literal["extraction", "memory_write", "retrieval", "llm", "log", "history"]
    message: str

# Chat
class HistoryMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    text: str

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("text cannot be empty")
        if len(v) > 30000:
            raise ValueError("history message text cannot exceed 30000 characters")
        return v

class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str
    session_id: str
    message: str
    history: Optional[List[HistoryMessage]] = None

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, v: str) -> str:
        v = v.strip()
        if not USER_ID_REGEX.match(v):
            raise ValueError("user_id must match ^[a-z0-9_-]{3,40}$")
        return v

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        v = v.strip()
        if not SESSION_ID_REGEX.match(v):
            raise ValueError("session_id must match ^[a-z0-9_-]{3,64}$")
        return v

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message cannot be empty")
        if len(v) > 4000:
            raise ValueError("message cannot exceed 4000 characters")
        return v

    @field_validator("history")
    @classmethod
    def validate_history(cls, v: Optional[List[HistoryMessage]]) -> Optional[List[HistoryMessage]]:
        if v is None:
            return None
        if len(v) > 6:
            raise ValueError("history cannot exceed 6 messages")
        total_chars = sum(len(m.text) for m in v)
        if total_chars > 60000:
            raise ValueError("total history text cannot exceed 60000 characters")
        return v

class ChatResponse(BaseModel):
    reply: str
    saved_memories: List[MemoryItem] = Field(default_factory=list)
    retrieved_memories: List[MemoryItem] = Field(default_factory=list)
    evidence_paths: List[EvidencePath] = Field(default_factory=list)
    warnings: List[WarningItem] = Field(default_factory=list)
    explanation: str

# Memories Listing
class MemoriesResponse(BaseModel):
    memories: List[MemoryItem]

# Error
class ErrorDetail(BaseModel):
    code: str
    message: str

class ErrorResponse(BaseModel):
    error: ErrorDetail

# Chat History & Sessions
class SessionSummary(BaseModel):
    id: str
    title: str
    updated_at: str
    created_at: Optional[str] = None

class ChatMessageItem(BaseModel):
    id: Optional[Union[int, str]] = None
    session_id: str
    user_id: str
    role: Literal["user", "assistant", "system"]
    text: str
    turn: Optional[dict] = None
    created_at: Optional[str] = None

class SessionDetailResponse(BaseModel):
    id: str
    title: str
    user_id: str
    messages: List[ChatMessageItem] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class RenameSessionRequest(BaseModel):
    user_id: str
    title: str

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, v: str) -> str:
        v = v.strip()
        if not USER_ID_REGEX.match(v):
            raise ValueError("user_id must match ^[a-z0-9_-]{3,40}$")
        return v

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title cannot be empty")
        if len(v) > 100:
            raise ValueError("title cannot exceed 100 characters")
        return v

class DeleteSessionResponse(BaseModel):
    status: Literal["deleted"] = "deleted"
    id: str
