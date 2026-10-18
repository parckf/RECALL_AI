# RecallAI Central Cypher Queries Reference

This document provides a complete, copyable reference of every Cypher query utilized in RecallAI, directly corresponding to [backend/app/queries.py](../backend/app/queries.py).

---

## Design Principles
1. **Compile-Time Constant Labels & Relations**: Labels (`:User`, `:Memory`, `:Concept`) and relationship types (`:HAS_MEMORY`, `:ABOUT`, `:REQUIRES`) are fixed string constants in the code, never dynamically concatenated from user input.
2. **Strict Parameterization**: Every runtime value (user IDs, topic strings, dedupe keys, timestamps) is passed exclusively through query parameter dictionaries (`$user_id`, `$concept_id`, etc.). This guarantees zero Cypher-injection vulnerabilities.
3. **Graph-per-User Isolation**: Queries operate against user-scoped graphs (`recallai_<user_id>`), guaranteeing zero data leakage across student profiles.

---

## 1. Curriculum & Concept Map Queries

### 1.1 `SEED_CONCEPT_NODE`
- **Location**: `backend/app/services/curriculum.py`
- **Purpose**: Idempotently seeds foundational programming concepts into the user's graph during initialization.
```cypher
MERGE (c:Concept {id: $id})
ON CREATE SET c.name = $name, c.canonical_name = $canonical_name
RETURN c.id AS id
```
- **Parameters**: `id` (str), `name` (str), `canonical_name` (str)

### 1.2 `SEED_PREREQUISITE_EDGE`
- **Location**: `backend/app/services/curriculum.py`
- **Purpose**: Creates curated pedagogical dependency edges between concepts. Meaning: `$from_id` REQUIRES foundational mastery of `$to_id`.
```cypher
MATCH (from_concept:Concept {id: $from_id})
MATCH (to_concept:Concept {id: $to_id})
MERGE (from_concept)-[r:REQUIRES]->(to_concept)
ON CREATE SET r.origin = 'curated'
RETURN type(r) AS relation
```
- **Parameters**: `from_id` (str), `to_id` (str)

### 1.3 `COUNT_CONCEPTS`
- **Location**: `backend/app/services/curriculum.py`
- **Purpose**: Checks whether the 15 core concepts are already seeded to ensure zero redundant writes.
```cypher
MATCH (c:Concept)
RETURN count(c) AS total
```

---

## 2. User & Memory Management Queries

### 2.1 `MERGE_USER_NODE`
- **Location**: `backend/app/services/memory_store.py`
- **Purpose**: Ensures the root student node exists before linking memories.
```cypher
MERGE (u:User {id: $user_id})
ON CREATE SET u.name = $name, u.created_at = $created_at
RETURN u.id AS id
```
- **Parameters**: `user_id` (str), `name` (str), `created_at` (str)

### 2.2 `MERGE_MEMORY_NODE`
- **Location**: `backend/app/services/memory_store.py`
- **Purpose**: Stores or deduplicates a memory node based on a deterministic SHA-256 deduplication key (`$dedupe_key`).
```cypher
MERGE (m:Memory {dedupe_key: $dedupe_key})
ON CREATE SET 
    m.id = $id,
    m.kind = $kind,
    m.value = $value,
    m.canonical_value = $canonical_value,
    m.source_text = $source_text,
    m.session_id = $session_id,
    m.status = 'active',
    m.origin = 'user_stated',
    m.created_at = $created_at
RETURN m.id AS id, m.status AS status, m.created_at AS created_at
```
- **Parameters**: `dedupe_key`, `id`, `kind`, `value`, `canonical_value`, `source_text`, `session_id`, `created_at`

### 2.3 `LINK_USER_MEMORY`
- **Location**: `backend/app/services/memory_store.py`
- **Purpose**: Establishes ownership edge between the Student and the Memory node.
```cypher
MATCH (u:User {id: $user_id})
MATCH (m:Memory {id: $memory_id})
MERGE (u)-[r:HAS_MEMORY]->(m)
RETURN type(r) AS relation
```
- **Parameters**: `user_id` (str), `memory_id` (str)

### 2.4 `LINK_MEMORY_CONCEPT`
- **Location**: `backend/app/services/memory_store.py`
- **Purpose**: Links a memory (e.g. `STRUGGLES_WITH`) to its target curriculum concept.
```cypher
MATCH (m:Memory {id: $memory_id})
MATCH (c:Concept {id: $concept_id})
MERGE (m)-[r:ABOUT]->(c)
RETURN type(r) AS relation
```
- **Parameters**: `memory_id` (str), `concept_id` (str)

### 2.5 `RESOLVE_MEMORY_BY_CANONICAL`
- **Location**: `backend/app/services/memory_store.py`
- **Purpose**: Marks an active struggle as `resolved` when the student expresses mastery or states a correction. Preserves historical continuity rather than deleting.
```cypher
MATCH (u:User {id: $user_id})-[:HAS_MEMORY]->(m:Memory)
WHERE m.canonical_value = $canonical_value AND m.kind = $kind AND m.status = 'active'
SET m.status = 'resolved'
RETURN m.id AS id, m.status AS status, m.value AS value
```
- **Parameters**: `user_id` (str), `canonical_value` (str), `kind` (str)

### 2.6 `GET_ACTIVE_MEMORIES_FOR_USER`
- **Location**: `backend/app/services/memory_store.py`
- **Purpose**: Fetches active memories for `/memories` endpoint.
```cypher
MATCH (u:User {id: $user_id})-[:HAS_MEMORY]->(m:Memory)
WHERE m.status = 'active'
RETURN 
    m.id AS id,
    m.kind AS kind,
    m.value AS value,
    m.status AS status,
    m.origin AS origin,
    m.source_text AS source_text,
    m.session_id AS session_id,
    m.created_at AS created_at
ORDER BY m.created_at DESC
```
- **Parameters**: `user_id` (str)

### 2.7 `GET_ALL_MEMORIES_FOR_USER`
- **Location**: `backend/app/services/memory_store.py`
- **Purpose**: Fetches both active and resolved memories for complete audit trail.
```cypher
MATCH (u:User {id: $user_id})-[:HAS_MEMORY]->(m:Memory)
RETURN 
    m.id AS id,
    m.kind AS kind,
    m.value AS value,
    m.status AS status,
    m.origin AS origin,
    m.source_text AS source_text,
    m.session_id AS session_id,
    m.created_at AS created_at
ORDER BY m.created_at DESC
```
- **Parameters**: `user_id` (str)

---

## 3. Retrieval & Prerequisite Traversal Queries

### 3.1 `LOOKUP_CONCEPTS_BY_CANONICAL`
- **Location**: `backend/app/services/retrieval.py`
- **Purpose**: Identifies curriculum concepts matching tokens extracted from the student's message.
```cypher
MATCH (c:Concept)
WHERE c.canonical_name IN $names
RETURN c.id AS id, c.name AS name, c.canonical_name AS canonical_name
```
- **Parameters**: `names` (list of str)

### 3.2 `TRAVERSE_PREREQUISITES_1_HOP`
- **Location**: `backend/app/services/retrieval.py`
- **Purpose**: Traverses 1-hop prerequisite dependencies for targeted concepts.
```cypher
MATCH (start:Concept)
WHERE start.id IN $concept_ids
MATCH (start)-[r:REQUIRES]->(prereq:Concept)
RETURN start.id AS from_id, start.name AS from_name, type(r) AS relation, prereq.id AS to_id, prereq.name AS to_name
```
- **Parameters**: `concept_ids` (list of str)

### 3.3 `TRAVERSE_PREREQUISITES_2_HOP`
- **Location**: `backend/app/services/retrieval.py`
- **Purpose**: Traverses transitive 2-hop prerequisite dependencies (e.g. `recursion -> functions -> variables`).
```cypher
MATCH (start:Concept)
WHERE start.id IN $concept_ids
MATCH (start)-[r1:REQUIRES]->(mid:Concept)-[r2:REQUIRES]->(prereq2:Concept)
RETURN start.id AS from_id, mid.id AS mid_id, mid.name AS mid_name, type(r2) AS relation, prereq2.id AS to_id, prereq2.name AS to_name
```
- **Parameters**: `concept_ids` (list of str)

### 3.4 `GET_MEMORIES_FOR_CONCEPTS`
- **Location**: `backend/app/services/retrieval.py`
- **Purpose**: Fetches active student memories linked to matched concepts or their prerequisites.
```cypher
MATCH (u:User {id: $user_id})-[:HAS_MEMORY]->(m:Memory)-[:ABOUT]->(c:Concept)
WHERE c.id IN $concept_ids AND m.status = 'active'
RETURN 
    m.id AS id,
    m.kind AS kind,
    m.value AS value,
    m.status AS status,
    m.origin AS origin,
    m.source_text AS source_text,
    m.session_id AS session_id,
    m.created_at AS created_at,
    c.id AS concept_id,
    c.name AS concept_name
```
- **Parameters**: `user_id` (str), `concept_ids` (list of str)

### 3.5 `GET_ACTIVE_PREFERENCES`
- **Location**: `backend/app/services/retrieval.py`
- **Purpose**: Retrieves top pedagogical preferences (`PREFERS`) to shape the tutoring style.
```cypher
MATCH (u:User {id: $user_id})-[:HAS_MEMORY]->(m:Memory)
WHERE m.kind = 'PREFERS' AND m.status = 'active'
RETURN 
    m.id AS id,
    m.kind AS kind,
    m.value AS value,
    m.status AS status,
    m.origin AS origin,
    m.source_text AS source_text,
    m.session_id AS session_id,
    m.created_at AS created_at
LIMIT 3
```
- **Parameters**: `user_id` (str)
