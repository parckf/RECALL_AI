# RecallAI Hackathon Demonstration Script

This script walks through a complete, verifiable demonstration of RecallAI for hackathon judges and evaluators (Track 2: Agent Memory & Coordination).

> **Note on Verification**: Automated backend test suites verify every step below against real FalkorDB using deterministic model mocks. Live browser interactions using real Gemini API keys are marked as **`[PENDING real run]`** for manual verification once API quota resets.

---

## Pre-Demo Checklist
1. Docker daemon running.
2. FalkorDB container active: `docker compose up -d` (verify with `docker ps`).
3. Backend running: `uvicorn backend.app.main:app --reload --port 8000` (or `npm run dev` in frontend).
4. Verify `/health`: visit `http://127.0.0.1:8000/health` (returns `{"status":"ok","database":"connected"}`).

---

## Step 1: Health Check & Isolated Slate
- **Action**: Open the RecallAI web app at `http://localhost:5173`.
- **User ID**: `student_alice`
- **Expected UI**:
  - Connection status badge shows **"Backend: Connected"** (green indicator).
  - Mode badge shows **"API Mode: Live"**.
  - Left panel shows **"Active Memories (0)"** — clean slate.

---

## Step 2: Turn 1 — Expressing Struggles & Preferences
- **Message**:
  > `"I'm learning Python, struggle with recursion, and prefer small examples."`
- **Execution Pipeline**:
  1. Guardrail filter detects personal pronouns (`"I'm"`) and cue words (`"struggle"`, `"prefer"`).
  2. Extraction model parses 3 distinct learner items.
  3. FalkorDB idempotently seeds 15-concept curriculum graph and merges memory nodes:
     - `LEARNS("python")`
     - `STRUGGLES_WITH("recursion")` linked via `-[:ABOUT]-> Concept(recursion)`
     - `PREFERS("small examples")`
- **Expected UI Output**:
  - **Memory Panel**: 3 new memory cards appear with badges (`LEARNS`, `STRUGGLES_WITH`, `PREFERS`).
  - **Evidence Inspector**: Shows real graph traversal steps from FalkorDB.
- **Verification Status**:
  - Automated Mock Test: **PASS** (`backend/tests/test_phase5_eval.py::test_scenario_09`)
  - Live Browser Gemini Run: **`[PENDING real run]`**

---

## Step 3: Turn 2 — Prerequisite Graph Traversal
- **Message**:
  > `"Can you explain how recursion works?"`
- **Execution Pipeline**:
  1. Topic `recursion` matches Concept node.
  2. FalkorDB executes 2-hop prerequisite traversal:
     $$\text{Concept(recursion)} \xrightarrow{\text{REQUIRES}} \text{Concept(functions)} \xrightarrow{\text{REQUIRES}} \text{Concept(variables)}$$
  3. Active memories (`STRUGGLES_WITH: recursion`, `PREFERS: small examples`) retrieved.
  4. Answer generation receives structured `<user_stored_data>` and is instructed:
     - *TEACH PREREQUISITES FIRST* (explains base cases and call stacks).
     - *HONOR PEDAGOGICAL PREFERENCES* (uses small, runnable code snippets).
- **Expected UI Output**:
  - **Evidence Inspector**:
    ```text
    Student ─[:HAS_MEMORY]─▶ Memory("Struggles with recursion") [You said]
    Memory("Struggles with recursion") ─[:ABOUT]─▶ Concept(recursion) [You said]
    Concept(recursion) ─[:REQUIRES]─▶ functions [Curated]
    functions ─[:REQUIRES]─▶ variables [Curated]
    ```
  - **Tutor Reply**: Grounded in foundational prerequisites with short code snippets.
- **Verification Status**:
  - Automated Mock Test: **PASS** (`backend/tests/test_phase5_eval.py::test_scenario_12`)
  - Live Browser Gemini Run: **`[PENDING real run]`**

---

## Step 4: Turn 3 — Memory Correction & Topic Transition
- **Message**:
  > `"I no longer struggle with recursion, but generators confuse me."`
- **Execution Pipeline**:
  1. Negative indicator (`"no longer struggle"`) marks previous `recursion` struggle as `resolved` in FalkorDB (`RESOLVE_MEMORY_BY_CANONICAL`).
  2. New struggle `generators` is extracted and linked to `Concept(generators)`.
- **Expected UI Output**:
  - **Memory Panel**:
    - `recursion` card transitions to faded dashed border with `RESOLVED` badge.
    - New `generators` card appears with `ACTIVE` badge.
- **Verification Status**:
  - Automated Mock Test: **PASS** (`backend/tests/test_phase5_eval.py::test_scenario_10`)
  - Live Browser Gemini Run: **`[PENDING real run]`**

---

## Step 5: Turn 4 — Multi-Session Memory Continuity
- **Action**:
  1. In the header bar, click **"New Session"** (switches `session_id` from `sess_1` to `sess_2`).
  2. Send message:
     > `"How should I write my first generator?"`
- **Execution Pipeline**:
  1. New session starts with empty message history.
  2. Query checks active FalkorDB memories for `student_alice`:
     - Recalls that student prefers small examples and struggles with generators.
     - Prerequisite traversal pulls `functions` and `loops`.
- **Expected UI Output**:
  - Evidence Inspector shows persistent memories recalled across session boundary.
- **Verification Status**:
  - Automated Mock Test: **PASS** (`backend/tests/test_phase5_eval.py::test_scenario_17`)
  - Live Browser Gemini Run: **`[PENDING real run]`**

---

## Step 6: User Isolation Verification
- **Action**: Change User ID in UI to `student_bob`.
- **Expected UI Output**:
  - Memory panel immediately shows **"Active Memories (0)"**.
  - Alice's struggles, preferences, and evidence paths are completely invisible to Bob.
- **Verification Status**:
  - Automated Mock Test: **PASS** (`backend/tests/test_phase5_eval.py::test_scenario_13`)
  - Live Browser Gemini Run: **`[PENDING real run]`**

---

## Step 7: Chat History Persistence, Renaming & Search (Supabase via Backend)
- **Action**:
  1. In the left sidebar, observe previous chats grouped under **"Today"**.
  2. Click on a previous session in the list:
     - The complete message thread is restored with formatted Markdown.
     - Click **"Why this answer?"** on an assistant reply: the right drawer opens displaying the exact multi-hop graph traversal and memories retrieved.
  3. Hover over the session in the sidebar and click the rename icon (`✎`):
     - In the modal, rename the session to `"Python Recursion & Call Stacks"`.
     - Click **Save**: the new title immediately updates in the sidebar and persists to Supabase.
  4. Press `Ctrl+K` (or `Cmd+K` on macOS) to focus the search bar in the sidebar:
     - Type `"Recursion"`: observe real-time client-side filtering.
  5. Delete a session:
     - Hover over a session and click delete (`✕`).
     - Confirm deletion in the confirmation modal: the session is permanently removed from Supabase, while personal graph memories remain preserved in FalkorDB.
- **Verification Status**:
  - Automated Tests: **PASS** (`backend/tests/test_chat_history.py`, `frontend/test/api.test.mjs`)
  - Live Verification: **PASS** (`scratch/live_supabase_test.py` against live backend and Supabase).

---

## Step 8: Offline LocalStorage Fallback Verification
- **Action**: Simulate Supabase being temporarily unreachable (or toggle mock mode).
- **Expected UI Output**:
  - The header displays **"History: LocalStorage"** with an amber pill.
  - A subtle warning badge appears in the sidebar: **"Offline storage active. Sessions saved locally in browser."**
  - All chat sessions, turns, and messages continue to function smoothly without crashing.
- **Verification Status**:
  - Automated Unit Tests: **PASS** (`frontend/test/api.test.mjs` test: *localStorage fallback functions handle missing window gracefully without crashing*).
