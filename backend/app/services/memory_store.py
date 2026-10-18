"""
RecallAI Memory Store Service
Manages user memories in FalkorDB with deterministic deduplication and graph-per-user isolation.
"""
import uuid
import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from falkordb import Graph
from backend.app.database import db_manager
from backend.app.schemas import MemoryItem
from backend.app.services.curriculum import seed_curriculum_if_needed
from backend.app.queries import (
    MERGE_USER_NODE,
    MERGE_MEMORY_NODE,
    LINK_USER_MEMORY,
    LINK_MEMORY_CONCEPT,
    RESOLVE_MEMORY_BY_CANONICAL,
    GET_ALL_MEMORIES_FOR_USER,
    GET_ACTIVE_MEMORIES_FOR_USER
)

logger = logging.getLogger("recallai.memory_store")

def compute_dedupe_key(kind: str, canonical_value: str) -> str:
    """
    Computes a deterministic deduplication key for a memory kind and canonical topic.
    Example: 'STRUGGLES_WITH:recursion' -> sha256 hex digest
    """
    raw = f"{kind.upper()}:{canonical_value.strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

class MemoryStore:
    def __init__(self):
        self._db = db_manager

    def get_user_graph(self, user_id: str) -> Graph:
        """
        Retrieves the user's isolated graph and idempotently seeds the concept map.
        """
        graph = self._db.get_user_graph(user_id)
        # Idempotently seed curriculum concepts on first access
        seed_curriculum_if_needed(graph)
        return graph

    def save_memory(
        self,
        user_id: str,
        session_id: str,
        kind: str,
        value: str,
        source_text: str,
        concept_id: Optional[str] = None
    ) -> MemoryItem:
        """
        Saves or updates a memory in the user's FalkorDB graph using fixed MERGE templates.
        Guarantees idempotency via deterministic deduplication keys.
        """
        graph = self.get_user_graph(user_id)
        now_iso = datetime.now(timezone.utc).isoformat()
        canonical_val = value.strip().lower()
        dedupe_key = compute_dedupe_key(kind, canonical_val)
        memory_id = f"mem_{uuid.uuid4().hex[:12]}"

        # 1. Merge User node
        graph.query(MERGE_USER_NODE, {
            "user_id": user_id,
            "name": user_id,
            "created_at": now_iso
        })

        # 2. Check if memory already exists
        check_cypher = "MATCH (m:Memory {dedupe_key: $dedupe_key}) RETURN m.id, m.status, m.created_at, m.value, m.source_text"
        check_res = graph.ro_query(check_cypher, {"dedupe_key": dedupe_key})

        if check_res.result_set:
            existing = check_res.result_set[0]
            existing_id, existing_status, existing_created_at, existing_val, existing_source = existing
            # If it's already active, return as already_known
            logger.info("Memory already exists (key=%s, id=%s, status=%s)", dedupe_key, existing_id, existing_status)
            return MemoryItem(
                id=existing_id,
                kind=kind,
                value=existing_val or value,
                status=existing_status or "active",
                origin="user_stated",
                source_text=existing_source or source_text,
                session_id=session_id,
                created_at=str(existing_created_at),
                action="already_known"
            )

        # 3. Create new Memory node
        mem_res = graph.query(MERGE_MEMORY_NODE, {
            "dedupe_key": dedupe_key,
            "id": memory_id,
            "kind": kind,
            "value": value,
            "canonical_value": canonical_val,
            "source_text": source_text,
            "session_id": session_id,
            "created_at": now_iso
        })

        # 4. Link User to Memory
        graph.query(LINK_USER_MEMORY, {
            "user_id": user_id,
            "memory_id": memory_id
        })

        # 5. Link Memory to Concept if provided
        if concept_id:
            graph.query(LINK_MEMORY_CONCEPT, {
                "memory_id": memory_id,
                "concept_id": concept_id
            })

        logger.info("Created new memory %s for user %s (%s: %s)", memory_id, user_id, kind, value)
        return MemoryItem(
            id=memory_id,
            kind=kind,
            value=value,
            status="active",
            origin="user_stated",
            source_text=source_text,
            session_id=session_id,
            created_at=now_iso,
            action="created"
        )

    def resolve_memory(self, user_id: str, kind: str, canonical_value: str) -> Optional[MemoryItem]:
        """
        Marks an existing active memory as 'resolved' (e.g. 'I no longer struggle with recursion').
        Preserves the memory node for history; resolved memories are never deleted.
        """
        graph = self.get_user_graph(user_id)
        res = graph.query(RESOLVE_MEMORY_BY_CANONICAL, {
            "user_id": user_id,
            "kind": kind,
            "canonical_value": canonical_value.strip().lower()
        })

        if not res.result_set:
            return None

        mem_id, status_val, val = res.result_set[0]
        logger.info("Marked memory %s resolved for user %s", mem_id, user_id)
        return MemoryItem(
            id=mem_id,
            kind=kind,
            value=val,
            status="resolved",
            origin="user_stated",
            source_text="",
            session_id="",
            created_at=datetime.now(timezone.utc).isoformat(),
            action="resolved"
        )

    def get_all_memories(self, user_id: str) -> List[MemoryItem]:
        """
        Returns all memories (active and resolved) for the user, ordered newest first.
        """
        graph = self.get_user_graph(user_id)
        try:
            res = graph.ro_query(GET_ALL_MEMORIES_FOR_USER, {"user_id": user_id})
        except Exception as e:
            if "empty key" in str(e).lower():
                return []
            raise

        memories = []
        for row in res.result_set:
            memories.append(MemoryItem(
                id=row[0],
                kind=row[1],
                value=row[2],
                status=row[3],
                origin=row[4],
                source_text=row[5],
                session_id=row[6],
                created_at=str(row[7])
            ))
        return memories

    def get_active_memories(self, user_id: str) -> List[MemoryItem]:
        """
        Returns only currently active memories for the user.
        """
        graph = self.get_user_graph(user_id)
        try:
            res = graph.ro_query(GET_ACTIVE_MEMORIES_FOR_USER, {"user_id": user_id})
        except Exception as e:
            if "empty key" in str(e).lower():
                return []
            raise

        memories = []
        for row in res.result_set:
            memories.append(MemoryItem(
                id=row[0],
                kind=row[1],
                value=row[2],
                status=row[3],
                origin=row[4],
                source_text=row[5],
                session_id=row[6],
                created_at=str(row[7])
            ))
        return memories

memory_store = MemoryStore()
