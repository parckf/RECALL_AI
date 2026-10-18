"""
RecallAI Curated Educational Curriculum & Concept Map
Provides a deterministic 15-topic prerequisite graph for Python concepts.
Seeds user-isolated graphs idempotently on initialization.
"""
import logging
from typing import List, Dict, Tuple
from falkordb import Graph
from backend.app.queries import (
    SEED_CONCEPT_NODE,
    SEED_PREREQUISITE_EDGE,
    COUNT_CONCEPTS,
    LOOKUP_CONCEPTS_BY_CANONICAL
)

logger = logging.getLogger("recallai.curriculum")

# 15 Core Python Programming Concepts
CURATED_CONCEPTS: List[Dict[str, str]] = [
    {"id": "variables", "name": "Variables & Types", "canonical_name": "variables"},
    {"id": "conditionals", "name": "Conditionals (If/Else)", "canonical_name": "conditionals"},
    {"id": "loops", "name": "Loops (For/While)", "canonical_name": "loops"},
    {"id": "functions", "name": "Functions & Scopes", "canonical_name": "functions"},
    {"id": "recursion", "name": "Recursion", "canonical_name": "recursion"},
    {"id": "lists", "name": "Lists & Tuples", "canonical_name": "lists"},
    {"id": "dictionaries", "name": "Dictionaries & Sets", "canonical_name": "dictionaries"},
    {"id": "list_comprehensions", "name": "List Comprehensions", "canonical_name": "list_comprehensions"},
    {"id": "generators", "name": "Generators & Iterators", "canonical_name": "generators"},
    {"id": "classes", "name": "Classes & Objects", "canonical_name": "classes"},
    {"id": "inheritance", "name": "Inheritance & Polymorphism", "canonical_name": "inheritance"},
    {"id": "error_handling", "name": "Error Handling (Try/Except)", "canonical_name": "error_handling"},
    {"id": "decorators", "name": "Decorators", "canonical_name": "decorators"},
    {"id": "file_io", "name": "File I/O", "canonical_name": "file_io"},
    {"id": "concurrency", "name": "Concurrency (Asyncio)", "canonical_name": "concurrency"},
]

# Curated Prerequisite Dependencies: (concept_id, requires_concept_id)
# Meaning: concept_id REQUIRES foundational mastery of requires_concept_id
CURATED_PREREQUISITES: List[Tuple[str, str]] = [
    ("conditionals", "variables"),
    ("loops", "conditionals"),
    ("functions", "variables"),
    ("recursion", "functions"),
    ("recursion", "conditionals"),
    ("lists", "variables"),
    ("dictionaries", "variables"),
    ("list_comprehensions", "lists"),
    ("list_comprehensions", "loops"),
    ("generators", "functions"),
    ("generators", "loops"),
    ("classes", "functions"),
    ("inheritance", "classes"),
    ("error_handling", "conditionals"),
    ("decorators", "functions"),
    ("file_io", "functions"),
    ("file_io", "error_handling"),
    ("concurrency", "functions"),
    ("concurrency", "generators"),
]

def seed_curriculum_if_needed(graph: Graph) -> bool:
    """
    Idempotently seeds the 15 curated concepts and their prerequisite edges
    into the specified user graph.
    Returns True if seeded, False if already up-to-date.
    """
    existing_count = 0
    try:
        count_res = graph.ro_query(COUNT_CONCEPTS)
        if count_res.result_set:
            existing_count = count_res.result_set[0][0]
    except Exception as e:
        # FalkorDB raises ResponseError('Invalid graph operation on empty key') when the graph doesn't exist yet
        if "empty key" in str(e).lower():
            logger.debug("Graph %s does not exist yet (empty key); proceeding with initial seed.", graph.name)
            existing_count = 0
        else:
            raise

    if existing_count >= len(CURATED_CONCEPTS):
        logger.debug("Graph already has %s concepts; skipping seed.", existing_count)
        return False

    logger.info("Seeding %s concepts into graph %s...", len(CURATED_CONCEPTS), graph.name)

    # 1. Merge each concept node individually
    for concept in CURATED_CONCEPTS:
        graph.query(SEED_CONCEPT_NODE, {
            "id": concept["id"],
            "name": concept["name"],
            "canonical_name": concept["canonical_name"]
        })

    # 2. Merge prerequisite relationships
    for from_id, to_id in CURATED_PREREQUISITES:
        graph.query(SEED_PREREQUISITE_EDGE, {
            "from_id": from_id,
            "to_id": to_id
        })

    logger.info("Curriculum graph seeded successfully with %s concepts.", len(CURATED_CONCEPTS))
    return True

def find_concepts_by_names(graph: Graph, names: List[str]) -> List[Dict[str, str]]:
    """
    Look up concept nodes by canonical names.
    """
    if not names:
        return []
    res = graph.ro_query(LOOKUP_CONCEPTS_BY_CANONICAL, {"names": [n.lower().strip() for n in names]})
    return [{"id": row[0], "name": row[1], "canonical_name": row[2]} for row in res.result_set]
