# RecallAI Graph Schema

RecallAI uses FalkorDB as its memory and reasoning context layer. Each student gets a separate FalkorDB graph named `recallai_<user_id>`. Keeping user graphs separate makes ownership checks and memory retrieval explicit at the database boundary.

## Node labels

| Label | Properties | Meaning |
| --- | --- | --- |
| `User` | `id`, `name`, `created_at` | One student profile. The graph name also scopes all data to that user. The UI may call this node “Student.” |
| `Memory` | `id`, `kind`, `value`, `canonical_value`, `source_text`, `session_id`, `status`, `origin`, `dedupe_key`, `created_at` | A persistent learner statement. `kind` is `LEARNS`, `STRUGGLES_WITH`, `PREFERS`, or `GOAL`; `status` is `active` or `resolved`. `source_text` preserves the student's supporting words. |
| `Concept` | `id`, `name`, `canonical_name` | A curated Python topic in the 15-concept curriculum, such as `recursion`, `functions`, or `variables`. |

## Relationship types

| Relationship | Direction | Properties | Why it exists |
| --- | --- | --- | --- |
| `HAS_MEMORY` | `(User)-[:HAS_MEMORY]->(Memory)` | none | Records which student's statement this is. Retrieval starts from this edge, so another graph cannot supply the student's memories. |
| `ABOUT` | `(Memory)-[:ABOUT]->(Concept)` | none | Connects a student's memory to a curriculum topic, enabling personalized prerequisite traversal. General preferences can remain unlinked to a concept. |
| `REQUIRES` | `(Concept)-[:REQUIRES {origin: 'curated'}]->(Concept)` | `origin` | Encodes the curated prerequisite direction: the first concept depends on the second. For example, `recursion -> functions -> variables`. |

## How the graph shapes an answer

For a question about recursion, RecallAI matches `recursion`, follows its `REQUIRES` edges one and two hops, retrieves active memories connected to the matched concepts, ranks direct memories before prerequisite memories and preferences, then supplies that context to answer generation. The API returns `evidence_paths` from the matched memory and prerequisite edges; the frontend renders those paths in **Why this answer?**.

Example path:

```text
(User {id: "student_alice"})
  -[:HAS_MEMORY]-> (Memory {kind: "STRUGGLES_WITH", value: "recursion"})
  -[:ABOUT]-> (Concept {id: "recursion"})
  -[:REQUIRES {origin: "curated"}]-> (Concept {id: "functions"})
  -[:REQUIRES {origin: "curated"}]-> (Concept {id: "variables"})
```

The UI labels student-provided edges as **You said** and curriculum prerequisite edges as **Curated**. A generic question with no matching memory or concept can have no graph evidence; the app should say so rather than invent a path.

## Creation, updates, and persistence

- `backend/app/services/curriculum.py` seeds the 15 concepts and 19 prerequisite edges with `MERGE`, so repeated seeding does not duplicate them.
- `backend/app/services/memory_store.py` stores graph memories behind one service and uses a deterministic hash of memory kind plus canonical topic to deduplicate.
- Corrections change a memory's `status` to `resolved`; the node is retained for history.
- FalkorDB uses the named Docker volume `recallai_falkordb_data` for persistence across container recreation.
- Cypher templates live in `backend/app/queries.py`; runtime values are passed as query parameters.

## Source of truth

The implementation is authoritative: `backend/app/queries.py`, `backend/app/services/curriculum.py`, `backend/app/services/memory_store.py`, and `backend/app/services/retrieval.py`. The complete query reference is in [QUERIES.md](QUERIES.md).
