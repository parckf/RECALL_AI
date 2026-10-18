# RecallAI Learning Log & Architectural Decisions

This log documents every major technical decision, Cypher query structure, and design rationale so that any team member can clearly explain every aspect of RecallAI during hackathon evaluations.

---

## 1. Why FalkorDB as the Graph Memory Store?
- **Graph vs Vector / Flat Memory**: Real learning is non-linear and prerequisite-driven. A student who struggles with recursion usually lacks a solid foundation in function call stacks or base cases. A flat list of memories or vector similarity search cannot traverse transitive dependency chains `(Student)-[:HAS_MEMORY]->(Memory)-[:ABOUT]->(Concept)-[:REQUIRES]->(Concept)`. FalkorDB provides low-latency graph traversals on top of Redis protocol.
- **Explainability**: Every retrieved memory has a clear graph path (evidence path) showing exactly *why* it was pulled (e.g., direct memory vs curated educational prerequisite).

---

## 2. Graph Per User vs Single Multi-Tenant Graph
- **Decision**: One FalkorDB graph per user, named `recallai_<validated_user_id>`.
- **Reasoning**:
  1. **Strict Isolation**: Eliminates any possibility of data leakage between students (e.g. User B querying User A's struggles).
  2. **Performance**: Smaller graph indexes per user, faster traversals.
  3. **Clean Teardown / Reset**: Testing or resetting a single user's state is as simple as deleting their graph without affecting other users.
- **Trade-off**: The concept prerequisite map is idempotently seeded into each user's graph on their first turn (~15 nodes, ~15 edges — negligible memory footprint in Redis/FalkorDB).

---

## 3. Memory Kinds & Properties
- `LEARNS`: Topics the user is currently studying.
- `STRUGGLES_WITH`: Topics or concepts where the user expressed confusion or difficulty.
- `PREFERS`: Pedagogical preferences (e.g., "explain with visual analogies", "use code examples first").
- `GOAL`: Long-term learning objectives.
- **Property instead of Relationship Name**: Using `kind` as a property rather than dynamic edge types prevents Cypher injection and allows fixed, parameterized Cypher templates.

---

## 4. FalkorDB Protocol & Client
- Uses Redis protocol (`GRAPH.QUERY` / `GRAPH.RO_QUERY`).
- We use the official `falkordb` Python client (`falkordb==1.8.0`, `redis==8.1.0`).
- `ro_query` is strictly used for read operations (which guarantees read-only safety), and `query` for writes.
- Fixed parameterized templates (`$param` in Cypher) are used exclusively to enable RedisGraph query plan caching and prevent Cypher injection.
- **Persistence Verification**: Tested `CONFIG GET dir` inside the running container, confirming `/var/lib/falkordb/data`. Persistence across container restart and compose down/up (without `-v`) was verified empirically.
- **Path Traversal Syntax**: Tested both variable-length path syntax `[:REQUIRES*1..2]` and explicit 1-hop and 2-hop traversals on the installed FalkorDB module (version `42201`). Both succeed, with explicit multi-hop traversal chosen for generating explainable evidence steps.
