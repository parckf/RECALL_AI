# RecallAI Project Status

Updated: 2026-10-18 (Finalization Pass)

## Finalization Snapshot — 2026-10-18

- The core Track 2 implementation is present: per-user FalkorDB graphs, persistent memory, multi-hop prerequisite retrieval, graph evidence paths, and the React evidence drawer.
- Supabase chat history is configured for the selected project. A synthetic save/read/delete round-trip passed; its temporary records were removed.
- Added `docs/schema.md`, an idempotent `python -m backend.seed_demo` entry point, a reusable Supabase migration, and Python Ruff lint/format configuration.
- Verification in this workspace: frontend tests **27/27 passed**; extraction tests **12/12 passed**; Vite production build passed; Oxlint completed with warnings. Python compilation of the seed script passed.
- Full backend integration tests are **not verified in this environment**: they require FalkorDB, and no local backend was listening on port 8000 during this pass. The FalkorDB integration tests stalled on graph connection and were stopped; no passing result is claimed.
- Remaining gap against the expanded team checklist: the product renders returned graph evidence paths, but does not yet log every Cypher call with its raw returned subgraph, and it has one tutor agent rather than a peer-agent coordination demo.
- This workspace is a downloaded source archive and has no `.git` directory, so branch cleanliness, commit history, and pushing changes are not verifiable here. No history was rewritten.
- Manual submission items still need team action: record the demo video, confirm roster and submission form, arrange a public deployment if available, and post the schema/demo question to the FalkorDB community.

## Historical development log

The following phase notes were carried in the downloaded project archive and describe work recorded before this finalization pass. They are not a current Git status report.

## Done
- [x] Inspected repo state and git log (clean dev branch on remote `origin/dev`).
- [x] Verified local toolchains: Node.js v24.14.1, Python 3.14.3, Docker 29.8.2 & Docker Compose v5.6.0.
- [x] Aligned on core architecture:
  - FalkorDB primary memory graph database with graph-per-user isolation (`recallai_<user_id>`).
  - Google Gemini (`gemini-3.8-flash`) as the selected LLM provider behind provider-agnostic `llm_client.py`.
  - Strict API contract established in `docs/API_CONTRACT.md`.
- [x] Created root `.gitignore` protecting env secrets, python artifacts, node_modules.
- [x] Created root `.env.example` and `backend/.env.example`.
- [x] Implemented `docker-compose.yml` with password protection, AOF persistence (`--appendonly yes --appendfsync everysec`), and 127.0.0.1 port bindings.
- [x] Determined exact FalkorDB data directory inside container via `CONFIG GET dir` (`/var/lib/falkordb/data`) and mounted named volume `recallai_falkordb_data`.
- [x] Proved database persistence across:
  - Container restart with volume kept (`docker compose restart falkordb`).
  - Container teardown and restart without `-v` (`docker compose down; docker compose up -d`).
- [x] Built backend core foundation: `config.py`, `database.py`, `schemas.py`, `queries.py`, `routes/health.py`, `main.py`.
- [x] Configured strict CORS middleware matching allowed Vite origins without wildcards.
- [x] Phase 2: Built curated 15-concept curriculum graph (`curriculum.py`) with idempotent seeding on graph creation.
- [x] Phase 2: Implemented `MemoryStore` service with deterministic deduplication keys, memory resolution, and user isolation.
- [x] Phase 2: Implemented `GET /memories` endpoint with input validation and registered in FastAPI app.
- [x] Phase 2: Built full frontend shell with React + Vite, vanilla CSS, and offline mock adapter in `src/api.js`.
- [x] Phase 3: Implemented provider-agnostic `llm_client.py` supporting Google Gemini (`gemini-3.8-flash`) and OpenAI/Groq fallback with rate-limit retry backoff.
- [x] Phase 3: Built `extraction.py` enforcing Pydantic schemas, verbatim `source_text` substrings, question-rejection guardrails, and single-repair recovery logic.
- [x] Phase 3: Live real Gemini evaluation on 5 hackathon test scenarios (all passed, commit `40ce862`).
- [x] Phase 4: Graph Retrieval Service (`retrieval.py`): 2-hop prerequisite traversal (`-[:REQUIRES]->`), active memory ranking (direct > prereq > preferences, cap 8), real evidence steps from returned rows, and deterministic explanation formatting.
- [x] Phase 4: Answer Generation Service (`answer_generation.py`): Tutoring response with strict prompt injection hygiene (`<user_stored_data>` data isolation block).
- [x] Phase 4: Complete `POST /chat` Route (`chat.py`): Validate -> Extract -> Store/Correct in FalkorDB -> Retrieve -> Generate. Partial success guarantee (HTTP 200 with warnings if DB succeeds but LLM fails).
- [x] Phase 5: Comprehensive evaluation suite with 17 scenarios (`backend/tests/test_phase5_eval.py`) covering fast-path queries, pronoun & cue word handling, struggle extractions, pedagogical preferences, learning goals, mixed turns, corrections, idempotency, 2-hop traversals, user isolation, error handling, prompt injection safety, input validation, and multi-session continuity. All 17 scenarios pass in 1.1s.
- [x] Phase 5: Empirical persistence testing verified across all 4 modes (new session, backend process restart, container restart with volume kept, docker compose down without `-v` then up).
- [x] Phase 5: Real data directory confirmed via live `CONFIG GET dir` (`/var/lib/falkordb/data`).
- [x] Phase 5: Full test suite passing (50 backend pytest tests in 2.1s, 7 frontend node tests in 1.9s, zero quota consumed).

## In Progress
- [ ] Phase 6: Frontend Evidence Inspector Polish & Verification.

## Next
- Phase 6: Frontend Evidence Inspector Polish & Verification.
- Phase 7: Optional Supabase audit logging (write-only).

## Blocked
- None currently.

## Questions / Notes for Partner
- Always verify no secret keys are in staged git diff before pushing.
