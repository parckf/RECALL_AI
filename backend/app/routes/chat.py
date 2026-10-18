"""
RecallAI Chat Turn Route
POST /chat endpoint executing the complete Agent Memory & Tutoring pipeline.
"""
import re
import logging
from fastapi import APIRouter, status
from backend.app.config import settings
from backend.app.schemas import ChatRequest, ChatResponse, WarningItem, MemoryItem
from backend.app.services.extraction import extraction_service
from backend.app.services.memory_store import memory_store
from backend.app.services.retrieval import retrieval_service
from backend.app.services.answer_generation import answer_generation_service
from backend.app.services.chat_history import chat_history_service

logger = logging.getLogger("recallai.chat")

def scrub_sensitive_info(text: str) -> str:
    """Removes API keys and secrets from error messages before storing in warnings."""
    if not text:
        return ""
    result = str(text)
    for key in [settings.GEMINI_API_KEY, settings.OPENAI_API_KEY, settings.GROQ_API_KEY, settings.SUPABASE_SECRET_KEY]:
        if key and len(key) >= 6:
            result = result.replace(key, "[REDACTED]")
    result = re.sub(r'AIza[0-9A-Za-z\-_]{35}', '[REDACTED]', result)
    result = re.sub(r'(?:key|api_key|token|secret|password)=([^\s&"\'<>]+)', r'key=[REDACTED]', result, flags=re.IGNORECASE)
    result = re.sub(r'Bearer\s+([^\s"\'<>]+)', 'Bearer [REDACTED]', result, flags=re.IGNORECASE)
    return result

router = APIRouter(tags=["Chat"])

@router.post("/chat", response_model=ChatResponse)
def chat_turn(request: ChatRequest) -> ChatResponse:
    """
    Executes a single chat turn:
    1. Validates input schemas.
    2. Extracts explicit facts/struggles/preferences with guardrails.
    3. Persists memories or resolves corrections in the user's isolated FalkorDB graph.
    4. Traverses 2-hop prerequisite graph to retrieve relevant context and real evidence.
    5. Synthesizes a personalized educational response using retrieved context as data.
    6. Persists turn history to Supabase (graceful fallback if offline).
    """
    all_warnings: list[WarningItem] = []
    saved_memories: list[MemoryItem] = []

    # Step 1: Memory Extraction
    extracted_items, extract_warnings = extraction_service.extract_memories(request.message)
    all_warnings.extend(extract_warnings)

    # Step 2: Store or Resolve Memories in FalkorDB
    for item in extracted_items:
        try:
            if item.is_correction:
                resolved = memory_store.resolve_memory(
                    user_id=request.user_id,
                    kind=item.kind,
                    canonical_value=item.value
                )
                if resolved:
                    saved_memories.append(resolved)
            else:
                saved = memory_store.save_memory(
                    user_id=request.user_id,
                    session_id=request.session_id,
                    kind=item.kind,
                    value=item.value,
                    source_text=item.source_text,
                    concept_id=item.canonical_concept
                )
                saved_memories.append(saved)
        except Exception as e:
            logger.error("Failed to persist memory in FalkorDB: %s", e)
            all_warnings.append(WarningItem(stage="memory_write", message=f"FalkorDB write failed: {e}"))

    # Step 3: Graph Retrieval (2-hop prerequisite traversal)
    retrieved_memories = []
    evidence_paths = []
    explanation = "No relevant memories matched this query."
    prereq_concepts = []

    try:
        retrieved_memories, evidence_paths, explanation, prereq_concepts = retrieval_service.retrieve_context(
            user_id=request.user_id,
            message=request.message,
            history=request.history
        )
    except Exception as e:
        logger.error("Retrieval stage failed: %s", e)
        all_warnings.append(WarningItem(stage="retrieval", message=f"Retrieval error: {e}"))

    # Step 4: Answer Generation
    reply = ""
    try:
        reply = answer_generation_service.generate_tutoring_answer(
            user_message=request.message,
            retrieved_memories=retrieved_memories,
            prerequisite_concepts=prereq_concepts,
            history=request.history
        )
    except Exception as e:
        logger.error("Answer generation failed: %s", e)
        raw_reason = str(e).strip()
        sanitized_reason = scrub_sensitive_info(raw_reason)
        all_warnings.append(WarningItem(stage="llm", message=f"Answer generation error: {sanitized_reason}"))

        # Friendly quota/model errors: Never show raw JSON, URLs, or keys in the chat bubble.
        # Raw provider error is available only in the "Why this answer?" drawer under warnings.
        reason_lower = raw_reason.lower()
        if any(term in reason_lower for term in ["429", "resource_exhausted", "quota", "rate limit", "ratelimit", "too many requests"]):
            friendly_text = "The AI model is busy or out of free quota. Try again later."
        else:
            friendly_text = "The AI model is temporarily unavailable. Try again later."

        # Partial success guarantee: Clearly labeled system message, never disguised as a tutor reply
        if saved_memories:
            reply = f"[System Message] {friendly_text} Your memory was saved to your knowledge graph."
        else:
            reply = f"[System Message] {friendly_text}"

    # Step 5: Persist Chat History to Supabase
    try:
        turn_data = {
            "saved_memories": [m.model_dump() for m in saved_memories],
            "retrieved_memories": [m.model_dump() for m in retrieved_memories],
            "evidence_paths": [p.model_dump(by_alias=True) for p in evidence_paths],
            "warnings": [w.model_dump() for w in all_warnings],
            "explanation": explanation
        }
        chat_history_service.save_turn(
            user_id=request.user_id,
            session_id=request.session_id,
            user_message=request.message,
            reply=reply,
            turn_data=turn_data
        )
    except Exception as e:
        logger.error("Chat history persistence failed: %s", type(e).__name__)
        all_warnings.append(WarningItem(stage="history", message=f"Chat history write failed: {str(e)}"))

    return ChatResponse(
        reply=reply,
        saved_memories=saved_memories,
        retrieved_memories=retrieved_memories,
        evidence_paths=evidence_paths,
        warnings=all_warnings,
        explanation=explanation
    )
