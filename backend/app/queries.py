"""
RecallAI Central Cypher Query Repository
Single place for ALL Cypher queries across the application.
Labels and relationship types are compile-time constants (fixed text).
All runtime variables are strictly passed as parameters ($param).
"""

# -------------------------------------------------------------------------
# Concept Map & Curriculum Seed Queries
# -------------------------------------------------------------------------
SEED_CONCEPT_NODE = """
MERGE (c:Concept {id: $id})
ON CREATE SET c.name = $name, c.canonical_name = $canonical_name
RETURN c.id AS id
"""

SEED_PREREQUISITE_EDGE = """
MATCH (from_concept:Concept {id: $from_id})
MATCH (to_concept:Concept {id: $to_id})
MERGE (from_concept)-[r:REQUIRES]->(to_concept)
ON CREATE SET r.origin = 'curated'
RETURN type(r) AS relation
"""

# Check if concept map is already seeded
COUNT_CONCEPTS = """
MATCH (c:Concept)
RETURN count(c) AS total
"""

# -------------------------------------------------------------------------
# User & Memory Store Queries
# -------------------------------------------------------------------------
MERGE_USER_NODE = """
MERGE (u:User {id: $user_id})
ON CREATE SET u.name = $name, u.created_at = $created_at
RETURN u.id AS id
"""

MERGE_MEMORY_NODE = """
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
"""

LINK_USER_MEMORY = """
MATCH (u:User {id: $user_id})
MATCH (m:Memory {id: $memory_id})
MERGE (u)-[r:HAS_MEMORY]->(m)
RETURN type(r) AS relation
"""

LINK_MEMORY_CONCEPT = """
MATCH (m:Memory {id: $memory_id})
MATCH (c:Concept {id: $concept_id})
MERGE (m)-[r:ABOUT]->(c)
RETURN type(r) AS relation
"""

RESOLVE_MEMORY_BY_CANONICAL = """
MATCH (u:User {id: $user_id})-[:HAS_MEMORY]->(m:Memory)
WHERE m.canonical_value = $canonical_value AND m.kind = $kind AND m.status = 'active'
SET m.status = 'resolved'
RETURN m.id AS id, m.status AS status, m.value AS value
"""

GET_ACTIVE_MEMORIES_FOR_USER = """
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
"""

GET_ALL_MEMORIES_FOR_USER = """
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
"""

# -------------------------------------------------------------------------
# Concept Lookups & Traversal Queries
# -------------------------------------------------------------------------
LOOKUP_CONCEPTS_BY_CANONICAL = """
MATCH (c:Concept)
WHERE c.canonical_name IN $names
RETURN c.id AS id, c.name AS name, c.canonical_name AS canonical_name
"""

# 1-Hop prerequisite traversal
TRAVERSE_PREREQUISITES_1_HOP = """
MATCH (start:Concept)
WHERE start.id IN $concept_ids
MATCH (start)-[r:REQUIRES]->(prereq:Concept)
RETURN start.id AS from_id, start.name AS from_name, type(r) AS relation, prereq.id AS to_id, prereq.name AS to_name
"""

# 2-Hop prerequisite traversal (explicit two hops for evidence generation)
TRAVERSE_PREREQUISITES_2_HOP = """
MATCH (start:Concept)
WHERE start.id IN $concept_ids
MATCH (start)-[r1:REQUIRES]->(mid:Concept)-[r2:REQUIRES]->(prereq2:Concept)
RETURN start.id AS from_id, mid.id AS mid_id, mid.name AS mid_name, type(r2) AS relation, prereq2.id AS to_id, prereq2.name AS to_name
"""

# Fetch active memories for a given list of concept IDs (direct memories)
GET_MEMORIES_FOR_CONCEPTS = """
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
"""

# Fetch active pedagogical preferences for a user
GET_ACTIVE_PREFERENCES = """
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
"""
