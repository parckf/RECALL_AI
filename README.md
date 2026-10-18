# RecallAI — Graph-Native Educational Memory Agent

RecallAI is an explainable AI tutoring agent with a persistent graph memory architecture powered by **FalkorDB**. Built for the hackathon **"Graph Hacks: Context for AI Agents"** (WeMakeDevs x FalkorDB, Oct 15–18 2026, **Track 2: Agent Memory and Coordination**).

**One-line pitch:** RecallAI remembers what a student finds difficult, follows curriculum prerequisites in FalkorDB, and shows the graph path behind each personalized tutoring answer.

**Team:** Lovish Singla and Arjun Singha.

**Stack:** Python 3.14 + FastAPI + the official FalkorDB Python client; React + Vite; Gemini by default with OpenAI/Groq provider support. The agent loop is a small custom Python pipeline rather than a separate framework. FalkorDB stores and retrieves learner memory and curriculum relationships; Supabase stores chat transcripts only.

Unlike naive chatbots or flat vector stores that merely retrieve semantic similarity chunks, RecallAI maps student struggles to a **curated curriculum knowledge graph** and executes **multi-hop prerequisite traversals** in FalkorDB (`recursion -> functions -> variables`) to address foundational learning gaps.

---

## 🏗️ Graph Data Model

RecallAI models educational memory as a directed property graph isolated on a per-student basis (`recallai_<user_id>`).

### Nodes

| Node Label | Properties | Meaning & Role | Data Source | Associated Query | Runtime Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`:User`** (shown as `Student` in UI) | `id`, `name`, `created_at` | Root entity representing the student learner profile. | System on first access. | `MERGE_USER_NODE` | Idempotently merged on student's first turn; anchors all personal memories. |
| **`:Memory`** | `id`, `kind`, `value`, `canonical_value`, `source_text`, `session_id`, `status`, `origin`, `dedupe_key`, `created_at` | Specific extracted learner fact: `LEARNS`, `STRUGGLES_WITH`, `PREFERS`, or `GOAL`. | LLM extraction from verbatim student messages. | `MERGE_MEMORY_NODE` | Merged using deterministic key `sha256(kind:canonical_topic)`. Marked `active` on creation; transitions to `resolved` upon mastery. |
| **`:Concept`** | `id`, `name`, `canonical_name` | Educational curriculum topic (e.g. `recursion`, `functions`, `generators`). | Curated 15-concept Python syllabus. | `SEED_CONCEPT_NODE` | Idempotently seeded into user's graph on initialization; static curriculum reference. |

### Edges

| Edge Type | Traversal Direction | Meaning & Semantics | Evidence Origin | Associated Query | Runtime Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`:HAS_MEMORY`** | `(u:User)-[:HAS_MEMORY]->(m:Memory)` | Establishes ownership: this student explicitly expressed this memory. | `"You said"` | `LINK_USER_MEMORY` | Created when saving a new memory. Direct edge from student root. |
| **`:ABOUT`** | `(m:Memory)-[:ABOUT]->(c:Concept)` | Connects a student struggle or topic to a curriculum concept node. | `"You said"` | `LINK_MEMORY_CONCEPT` | Enables graph traversals from personal difficulties into the curriculum hierarchy. |
| **`:REQUIRES`** | `(c1:Concept)-[:REQUIRES]->(c2:Concept)` | Foundational prerequisite dependency: concept `c1` requires mastery of `c2`. | `"Curated"` | `SEED_PREREQUISITE_EDGE` | Traversed 1 to 2 hops deep during retrieval to surface prerequisite learning gaps. |

---

## 🚀 Clean-Clone Setup Guide

Follow these exact steps from a fresh clone to run the entire system locally:

### 1. Prerequisites
- **Docker & Docker Compose** (v20+ / Compose v2+)
- **Python 3.14** (tested: Python 3.14.3)
- **Node.js 18+** & npm

### 2. Start FalkorDB (Primary Graph Database)
Generate a strong database password:
```bash
# Generate a random 16-byte hex password (choose one):
openssl rand -hex 16
# or using Python:
python -c "import secrets; print(secrets.token_hex(16))"
```

```bash
# 1. Copy the root environment file
cp .env.example .env

# Set your generated password in .env:
# FALKORDB_PASSWORD=<your_generated_password>
# Note: docker-compose requires FALKORDB_PASSWORD and will error if unset.

# 2. Launch the FalkorDB container with persistent volume
docker compose up -d
```
Verify the container is running:
```bash
docker ps
```
FalkorDB runs on `127.0.0.1:6379`. The internal container data directory `/var/lib/falkordb/data` is mounted to the named volume `recallai_falkordb_data`. FalkorDB Browser is available at `http://localhost:3000`.

### 3. Backend Setup & Startup
```bash
# In the repository root:
python -m venv backend/venv

# Activate the virtual environment:
# Windows (PowerShell):
.\backend\venv\Scripts\Activate.ps1
# Linux / macOS:
source backend/venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Optional Python lint and formatter tools
pip install -r backend/requirements-dev.txt

# Create backend .env
cp backend/.env.example backend/.env
```

Open `backend/.env` and verify your configuration:
- `FALKORDB_PASSWORD`: Matches the `FALKORDB_PASSWORD` set in root `.env` and used by `docker-compose.yml` (required; no hard-coded default).
- `LLM_PROVIDER`: `gemini` (default)
- `LLM_MODEL`: `gemini-3.8-flash` (Google Gemini 3.8 Flash is configured as the default model; setting `LLM_MODEL` in `backend/.env` overrides it to any supported model such as `gemini-2.5-flash`, `gpt-4o-mini`, etc.)
- `GEMINI_API_KEY`: Add your Google Gemini API key here for live tutoring. (Automated tests run completely mocked without requiring an API key).
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY`: Configure persistent chat history. Use a server-only Supabase secret key (`sb_secret_...`), never a publishable key; keep it in `backend/.env`, not in frontend files or source control. Apply [`backend/migrations/001_chat_history.sql`](backend/migrations/001_chat_history.sql) once in the target project's SQL Editor. If omitted, chat history falls back to local storage.

### Seed the synthetic demo graph

After FalkorDB is running and `backend/.env` has the matching database password, run this from the repository root. It creates an example `student_alice` graph with a recursion struggle and a small-examples preference; repeated runs deduplicate them.

```bash
python -m backend.seed_demo
```

The graph labels, properties, and relationship rationale are documented in [`docs/schema.md`](docs/schema.md). The seed reuses the existing curriculum and memory services, keeping graph writes centralized.

Start the FastAPI server:
```bash
uvicorn backend.app.main:app --reload --port 8000
```
Verify backend health in your browser or terminal:
```bash
curl http://127.0.0.1:8000/health
# Returns status, FalkorDB connection, LLM readiness, and Supabase status without credentials.
```

### 4. Frontend Setup & Startup
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.
- Set **User ID**: `student_alice`
- The top-right connection badge will display **"Backend: Connected"** and **"API Mode: Live"**.

### GitHub Pages preview

The GitHub Actions workflow publishes the frontend at `https://parckf.github.io/RECALL_AI/` after a push to `main` (or a manual workflow run). This is an **offline UI preview** built with `VITE_API_MODE=mock`; it does not connect to FalkorDB, Gemini, or Supabase. Use the Docker and backend steps above for the live graph-backed agent. In the repository's **Settings → Pages**, choose **GitHub Actions** as the build and deployment source before the first deployment.

---

## 🎮 Run the Demo

Follow these exact interactive steps in the web app (`http://localhost:5173`) to observe RecallAI's graph-native memory, prerequisite traversals, and multi-session continuity:

### Turn 1: Express Struggles & Pedagogical Preferences
- **User ID**: `student_alice`
- **Type message**:
  ```text
  I'm learning Python, struggle with recursion, and prefer small examples.
  ```
- **What to observe**:
  - **Inline Memory Badge**: An inline badge appears beneath the assistant reply: `Remembered: recursion`.
  - **Graph Evidence Drawer**: Click **"Why this answer?"** on the assistant message (or **"Graph Evidence"** in the header) to open the slide-out drawer showing:
    - Real FalkorDB graph paths (`Student -> Memory -> Concept`).
    - The **"Saved memories"** tab listing Alice's active preferences and struggles with active count badge.
  - **Left Sidebar**: The conversation is automatically titled and saved in Supabase under **"Today"**.

### Turn 2: Prerequisite Graph Traversal in Action
- **Type message**:
  ```text
  Can you explain how recursion works?
  ```
- **What to observe**:
  - **Assistant Response**: Rendered in clean Markdown via `react-markdown` with code highlighting and a copy-to-clipboard button.
  - **Evidence Drawer**: Click **"Why this answer?"** to inspect the 2-hop prerequisite traversal:
    $$\text{Concept(recursion)} \xrightarrow{\text{REQUIRES}} \text{Concept(functions)} \xrightarrow{\text{REQUIRES}} \text{Concept(variables)}$$
    Origin labels: `ABOUT` labeled as **"You said"**, `REQUIRES` labeled as **"Curated"**.
  - **Tutor Response**: Teaches prerequisites first (base cases, call stack) and honors the preference by providing concise code snippets.

### Turn 3: Memory Correction & Dynamic Resolution
- **Type message**:
  ```text
  I no longer struggle with recursion, but generators confuse me.
  ```
- **What to observe**:
  - **Inline Memory Badge**: Shows `Updated: recursion resolved`.
  - **Evidence Drawer ("Saved memories" tab)**:
    - `recursion` node transitions to strikethrough with a **`RESOLVED`** badge.
    - A new active struggle node for `generators` is created.

### Turn 4: Multi-Session Memory Continuity & Chat History
- **Action**:
  1. Click **"+ New chat"** at the top of the sidebar.
  2. Notice the empty-state screen with a Cormorant Garamond serif greeting (`"Hey there, Alice"`), centered composer, and 3 suggestion chips.
  3. Send message:
     ```text
     How should I write my first generator?
     ```
- **What to observe**:
  - Even in a fresh session, RecallAI recalls Alice's persistent struggle (`generators`) and preference (`small examples`) from FalkorDB, and retrieves prerequisite concepts (`functions`, `loops`).
  - Click on the previous chat under **"Today"** in the sidebar: the complete previous thread is restored with Markdown formatting and turn evidence.
  - Hover over a chat in the sidebar to **Rename** (`✎`) or **Delete** (`✕`) with confirmation dialogs. Press `Ctrl+K` to search chats.

### Turn 5: Strict Multi-Tenant User Isolation
- **Action**: Change **Demo Student Graph** at the bottom of the sidebar to `student_bob`.
- **What to observe**:
  - The Graph Evidence drawer immediately displays **"No memories stored in FalkorDB for student_bob yet"**.
  - Student Alice's graph (`recallai_student_alice`) and chat history are strictly isolated from Bob's graph (`recallai_student_bob`), ensuring zero cross-student data leakage.

---

## 🧪 Running Automated Tests

Start FalkorDB first (`docker compose up -d falkordb`). Backend tests exercise graph and API behavior, but the suite is not fully isolated from the configured LLM provider; tests that call `/chat` may use API quota. Frontend tests use Node's built-in test runner.

```bash
# Run the backend suite (review tests that call /chat before running with a paid or quota-limited key)
pytest backend/tests -v

# Run frontend tests, lint, and production build
cd frontend
node --test test/api.test.mjs
npm run lint
npm run build

# From repository root: Python lint and format check
ruff check backend
ruff format --check backend
```

---

## ⚠️ Honest Limitations & Disclosures

1. **Scripted Model Outputs in Automated Tests**:
   - The backend suite contains graph and API tests, and some `/chat` tests can call the configured LLM provider. A full backend pass has not been verified in this workspace. The frontend suite has 27 tests and can run without external service credentials.
2. **Prompt Injection Mitigation vs Guarantee**:
   - RecallAI wraps all retrieved student profile memories inside structured `<user_stored_data>` XML containers and in-session conversation history inside `<conversation_so_far>` containers, commanding the tutor model to treat both strictly as factual data/context. While this defends against standard instruction-hijacking and jailbreak attempts, prompt injection defense in Large Language Models is an active defense-in-depth mitigation, not a formal mathematical guarantee against all novel jailbreak vectors.
3. **Scope of Persistence Verification**:
   - Persistence was empirically tested for **graceful restart cycles only**:
     - Fast process teardown & restarts of the backend.
     - Graceful container restarts (`docker compose restart falkordb`).
     - Recreating containers while keeping volumes (`docker compose down` without `-v` followed by `docker compose up -d`).
   - Hard kernel panics, abrupt machine power-cuts, or dirty ungraceful process terminations were not stress-tested.
4. **Single-User Graph Boundary**:
   - Isolation is enforced at the graph namespace boundary (`recallai_<user_id>`). Inter-student collaborative memory or classroom-level aggregation is outside the scope of this hackathon submission.
5. **Free-Tier Gemini API Quota Constraints**:
   - Live tutoring calls use the configured provider's quota. Automated tests that send `/chat` requests may also consume provider quota unless that test path is mocked. Use the frontend tests for a quick offline regression check.
6. **Chat History Storage, Demo User IDs & Privacy Notice**:
   - **Storage Split**: Personal educational memory (struggles, preferences, goals, curriculum links) is stored exclusively in **FalkorDB**. Full chat conversation messages and session turns are persisted in **Supabase** via backend-mediated REST calls.
   - **Demo User ID is NOT Authentication**: In this hackathon demo, the user ID (e.g. `student_alice`) is a client-provided label to demonstrate graph isolation, **not an authenticated identity**. Anyone who knows or enters another user's ID could access or read those chat transcripts.
   - **Synthetic Data Only**: Because there is no authentication layer or password protection for student IDs, **only synthetic demo data must be used**. Never enter real-world personal identifying information (PII), sensitive data, or real secrets into the application.

---

## 📚 Project Documentation

- [docs/schema.md](docs/schema.md): Graph labels, properties, relationship semantics, and a worked evidence path.
- [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md): Official WeMakeDevs x FalkorDB submission checklist mapping requirements.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): System architecture, pipeline, and sequence diagrams.
- [docs/QUERIES.md](docs/QUERIES.md): Reference for parameterized Cypher queries.
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md): Step-by-step judge walkthrough.
- [docs/TEST_CHECKLIST.md](docs/TEST_CHECKLIST.md): Verification checklist and test status.
- [AI_USE.md](AI_USE.md): Disclosure of AI tools and pair-programming usage.
