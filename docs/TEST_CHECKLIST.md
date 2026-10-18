# RecallAI Verification & Test Checklist

> **Honest Reporting Standard**: Every item is marked strictly as `[RUN - PASS]`, `[RUN - FAIL]`, `[MANUAL - PASS]`, or `[NOT RUN]`. No item is marked passed unless verified.

## Current finalization run — 2026-10-18

- [x] **[RUN - PASS]** Frontend unit suite: 27/27 tests passed (`npm.cmd test` in `frontend/`).
- [x] **[RUN - PASS]** Graph-independent extraction suite: 12/12 tests passed (`pytest backend/tests/test_extraction.py`).
- [x] **[RUN - PASS]** Frontend production build completed (`npm.cmd run build`).
- [x] **[RUN - PASS]** Frontend lint completed; Oxlint emitted existing warnings (not a clean lint run).
- [x] **[RUN - PASS]** Supabase synthetic chat-history save/read/delete round-trip succeeded; temporary records were removed.
- [x] **[RUN - PASS]** Schema query confirmed both Supabase tables have RLS enabled and service-role access.
- [x] **[RUN - PASS]** Python syntax check passed for the new demo seed script and updated Supabase service.
- [ ] **[NOT RUN]** Full 67-test backend integration suite: requires reachable FalkorDB. The run stalled while its first graph integration test tried to connect, so it was stopped without a pass claim.
- [ ] **[NOT RUN]** Fresh-clone seed-and-run verification: this workspace was provided as a source archive without `.git`, and FalkorDB was not reachable from this run.

The backend result recorded later in this file is a prior project log and is not the result of the current finalization run.

---

## 1. Database & Persistence Tests
- [x] **[RUN - PASS]** FalkorDB container startup with custom password (`FALKORDB_PASSWORD`) and AOF persistence enabled.
- [x] **[RUN - PASS]** Verification of real container data directory via `CONFIG GET dir` (`/var/lib/falkordb/data`).
- [x] **[RUN - PASS]** Basic write query via `g.query()` and read query via `g.ro_query()`.
- [x] **[RUN - PASS]** **Persistence Test 3**: Database container restart with volume kept (`docker compose restart falkordb`) — node survived.
- [x] **[RUN - PASS]** **Persistence Test 4**: Docker compose teardown without volume wipe (`docker compose down` then `up -d`) — node survived.
- [x] **[RUN - PASS]** **Persistence Test 1**: New session retrieves existing user memories across sessions (`backend/tests/test_e2e_sessions_flow.py` and `test_chat_persistence_across_sessions`).
- [x] **[RUN - PASS]** **Persistence Test 2**: Backend process restart preserves user memories in FalkorDB (verified across distinct Python process lifecycles against live FalkorDB).

---

## 2. API Contract & Core Endpoints
- [x] **[RUN - PASS]** `GET /health` returns 200 OK with `database: "connected"` when FalkorDB is running.
- [x] **[RUN - PASS]** `GET /health` returns 503 Service Unavailable when FalkorDB is stopped / mocked disconnected.
- [x] **[RUN - PASS]** `GET /health` does not call paid LLM endpoints.
- [x] **[RUN - PASS]** CORS preflight and headers correctly allow Vite origins (`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:5174`, `http://127.0.0.1:5174`) and reject disallowed origins.
- [x] **[RUN - PASS]** `POST /chat` input validation (rejects invalid `user_id`, empty message, >4000 characters) (`backend/tests/test_chat.py::test_chat_validation_errors`).
- [x] **[RUN - PASS]** `GET /memories` returns memories for specified `user_id` and validates format (422 on invalid).

---

## 3. Extraction & Memory Integrity
- [x] **[RUN - PASS]** Facts vs Questions: Questions ("What is recursion?") never saved as struggles.
- [x] **[RUN - PASS]** Negation & Correction: "I no longer struggle with X" marks previous memory resolved, not deleted.
- [x] **[RUN - PASS]** Deduplication: Repeated identical statements update/deduplicate rather than creating duplicate nodes.
- [x] **[RUN - PASS]** Exact source text: `source_text` matches user input substring (with casing and whitespace tolerance).
- [x] **[RUN - PASS]** Schema validation: Extraction output strictly validates against Pydantic schema with at most one repair attempt.
- [x] **[RUN - PASS]** Real Gemini live extraction evaluation across 5 test scenarios (all 5 passed).
- [x] **[RUN - PASS]** First-person pronoun & cue word guardrail: non-first-person messages without cue words bypass extraction immediately without calling LLM (`backend/tests/test_extraction.py::test_no_first_person_statements_skips_llm_call` and `test_cue_words_without_pronouns_reach_extraction`).

---

## 4. Graph Retrieval & Education Reasoning
- [x] **[RUN - PASS]** Direct concept match: Topic in message retrieves corresponding active memory (`backend/tests/test_retrieval.py`).
- [x] **[RUN - PASS]** Prerequisite traversal: 2-hop prerequisite traversal (`-[:REQUIRES]->`) pulls foundational concepts (`backend/tests/test_retrieval.py` and `backend/tests/test_e2e_sessions_flow.py`).
- [x] **[RUN - PASS]** Real continuous graph evidence paths: `Student -HAS_MEMORY-> Memory -ABOUT-> Concept -REQUIRES-> prereqs` (`backend/tests/test_retrieval.py` and `backend/tests/test_e2e_sessions_flow.py`). Step origin `ABOUT` labeled "You said"; only `REQUIRES` labeled "Curated".
- [x] **[RUN - PASS]** Answer generation prompt receives prerequisite concepts and PREFERS memories, and instructs tutor to teach prerequisites first (`backend/tests/test_chat.py::test_answer_generation_prompt_prerequisites_and_preferences`).
- [x] **[RUN - PASS]** Pedagogical preference: Active `PREFERS` memories are included in context (`backend/tests/test_retrieval.py`).
- [x] **[RUN - PASS]** Irrelevant questions: Questions unrelated to user memory retrieve nothing (`test_irrelevant_query_retrieves_nothing`).
- [x] **[RUN - PASS]** Resolved memories excluded: Resolved memories are excluded from retrieval context (`test_resolved_memories_are_excluded_from_retrieval`).
- [x] **[RUN - PASS]** User isolation: User B's queries never retrieve User A's memories or concepts (`test_user_isolation`).

---

## 5. Resilience & Error Handling
- [x] **[RUN - PASS]** Clearly labeled system error message returned when LLM model is unavailable, preserving memory write (`backend/tests/test_chat.py::test_chat_partial_success_handling`).
- [x] **[RUN - PASS]** Prompt injection attempt inside `source_text` is treated strictly as data inside `<user_stored_data>` (`test_prompt_injection_isolation_in_answer_generation` and `test_scenario_15_prompt_injection_safety`).
- [x] **[RUN - PASS]** Database write failure simulation (`/simulate-write-failure`) caught gracefully, returning 200 with WarningItem(stage="memory_write") (`backend/tests/test_phase5_eval.py::test_scenario_14_error_handling_and_warnings`).
- [x] **[RUN - PASS]** Server error simulation (`/simulate-error`) returns HTTP 500 error (`backend/tests/test_phase5_eval.py::test_scenario_14_error_handling_and_warnings`).
- [x] **[RUN - PASS]** Supabase chat history integration: failure never impacts chat turn, returns 200 with WarningItem(stage="history").

---

## 6. Phase 5 Comprehensive Evaluation Suite (17 Scenarios)
- [x] **[RUN - PASS]** Scenario 1: Pure concept question fast-path (`backend/tests/test_phase5_eval.py::test_scenario_01_pure_concept_question_bypasses_extraction`).
- [x] **[RUN - PASS]** Scenario 2: Command without pronouns fast-path (`backend/tests/test_phase5_eval.py::test_scenario_02_command_without_pronouns_bypasses_extraction`).
- [x] **[RUN - PASS]** Scenario 3: Command with pronoun matches pronoun filter, returns 0 facts (`backend/tests/test_phase5_eval.py::test_scenario_03_command_with_pronoun_no_facts`).
- [x] **[RUN - PASS]** Scenario 4: Explicit struggle statement extracts and saves (`backend/tests/test_phase5_eval.py::test_scenario_04_explicit_struggle_statement`).
- [x] **[RUN - PASS]** Scenario 5: Elliptical struggle with cue word reaches extraction and saves (`backend/tests/test_phase5_eval.py::test_scenario_05_elliptical_struggle_cue_without_pronoun`).
- [x] **[RUN - PASS]** Scenario 6: Pedagogical preference cue reaches extraction and saves (`backend/tests/test_phase5_eval.py::test_scenario_06_pedagogical_preference_cue_without_pronoun`).
- [x] **[RUN - PASS]** Scenario 7: Explicit learning topic statement extracts and saves (`backend/tests/test_phase5_eval.py::test_scenario_07_explicit_learning_topic`).
- [x] **[RUN - PASS]** Scenario 8: Learning goal statement extracts and saves (`backend/tests/test_phase5_eval.py::test_scenario_08_learning_goal_statement`).
- [x] **[RUN - PASS]** Scenario 9: Mixed fact + question saves fact and answers with prerequisite context (`backend/tests/test_phase5_eval.py::test_scenario_09_mixed_fact_and_question`).
- [x] **[RUN - PASS]** Scenario 10: Memory correction resolves previous struggle and creates new struggle (`backend/tests/test_phase5_eval.py::test_scenario_10_memory_correction_resolution`).
- [x] **[RUN - PASS]** Scenario 11: Idempotent deduplication maintains single active node (`backend/tests/test_phase5_eval.py::test_scenario_11_idempotent_deduplication`).
- [x] **[RUN - PASS]** Scenario 12: 2-hop prerequisite graph traversal and evidence step origin verification (`backend/tests/test_phase5_eval.py::test_scenario_12_two_hop_prerequisite_traversal_and_origin_labels`).
- [x] **[RUN - PASS]** Scenario 13: Strict multi-tenant user isolation between student graphs (`backend/tests/test_phase5_eval.py::test_scenario_13_strict_user_isolation`).
- [x] **[RUN - PASS]** Scenario 14: Error handling and warnings (`backend/tests/test_phase5_eval.py::test_scenario_14_error_handling_and_warnings`).
- [x] **[RUN - PASS]** Scenario 15: Prompt injection hygiene in stored memory data tags (`backend/tests/test_phase5_eval.py::test_scenario_15_prompt_injection_safety`).
- [x] **[RUN - PASS]** Scenario 16: Input validation rejections (`backend/tests/test_phase5_eval.py::test_scenario_16_input_validation_rejections`).
- [x] **[RUN - PASS]** Scenario 17: Multi-session continuity across different session IDs (`backend/tests/test_phase5_eval.py::test_scenario_17_multisession_memory_continuity`).

---

## 7. Supabase Chat History & Frontend Claude UI (Phases A & B)
- [x] **[RUN - PASS]** `GET /health` reports `"supabase": "connected"` with zero secret key leakage.
- [x] **[RUN - PASS]** Live Supabase operations verified against live Supabase: `save_turn`, `GET /sessions`, `GET /sessions/{id}`, `PATCH /sessions/{id}`, `DELETE /sessions/{id}` for user `student_test`. Zero LLM calls made and zero keys exposed.
- [x] **[RUN - PASS]** Cross-user session hijacking security: user B sending user A's session ID is rejected from overwriting user A's session/messages; `/chat` returns 200 with history warning (`backend/tests/test_chat_history.py::test_save_turn_hijacking_rejection_and_chat_warning`).
- [x] **[RUN - PASS]** URL and filter safety: strictly validated IDs via regex (`^[a-zA-Z0-9_\-]+$`) and encoded query parameters (`encodeURIComponent`).
- [ ] **[NOT RUN - CURRENT RUN]** Backend test suite: a prior project log records 62 passing tests; the current finalization run did not complete the FalkorDB-dependent suite (see above).
- [x] **[RUN - PASS]** Frontend test suite: 19/19 unit tests passing (`npm test` in `frontend/`).
- [x] **[RUN - PASS]** Frontend production build: `npm run build` completes cleanly without warnings or errors.
- [x] **[RUN - PASS]** Claude-inspired UI: Left sidebar with grouped chat history (Today/Yesterday/Earlier), client-side search with `Ctrl+K`, per-chat Rename and Delete with confirm dialogs.
- [x] **[RUN - PASS]** Centered empty state: Cormorant Garamond serif greeting (`"Hey there, <student>"`), large composer box, and 3 suggestion chips matching demo queries.
- [x] **[RUN - PASS]** Active chat thread: Centered column (`max-width: ~760px`), assistant replies rendered in clean Markdown via `react-markdown`, copy-to-clipboard button, inline memory badge, and "Why this answer?" drawer trigger.
- [x] **[RUN - PASS]** Graph Evidence Drawer: Slide-out drawer / mobile bottom sheet with "Why this answer?" (chain traversal with "You said" / "Curated" chips) and "Saved memories" tabs with active count badge.
- [x] **[RUN - PASS]** Offline fallback: Per-user `localStorage` fallback with warning banner if Supabase is unreachable.
- [x] **[RUN - PASS]** Reopen last active chat on load: URL hash prioritized over localStorage (`#/chat/<sessionId>`), with graceful fallback to clean empty state on 404 or missing session.
- [x] **[RUN - PASS]** Stop button while reply pending: Send button replaced by square Stop button with champagne outline (`Esc` also stops when composer focused); `sendChatMessage` / `sendChat` accepts `AbortSignal` and handles abort cleanly without delivery failure errors or retry buttons.
- [x] **[RUN - PASS]** Stop state cleanup: Removes typing indicator, keeps user message with muted note ("Stopped. The tutor may still have saved this to memory - check Saved memories."), restores composer text only if message was not saved, and refreshes memories and sidebar.
- [x] **[RUN - PASS]** Epoch guard late response suppression: Late-arriving response after Stop, user switch, or new chat is silently ignored in UI.
- [x] **[RUN - PASS]** Mock-mode Stop support: AbortSignal cancelation verified in `VITE_API_MODE=mock`.
