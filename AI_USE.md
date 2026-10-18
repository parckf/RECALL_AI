# AI Assistance & Tooling Disclosure

In compliance with the Hackathon Transparency Guidelines for **Graph Hacks: Context for AI Agents** (WeMakeDevs x FalkorDB, Oct 15–18 2026), this document details all AI tools and assistance utilized in the architecture, implementation, and verification of **RecallAI**.

---

## 1. Overview of Tools Used

| Tool | Provider | Purpose & Usage Scope |
| :--- | :--- | :--- |
| **Antigravity IDE & Agentic Pair Programmer** | Google DeepMind | Interactive pair-programming agent used for code generation, test scaffolding, automated documentation, and live terminal sandbox execution. |
| **Google Gemini 3.8 Flash (`gemini-3.8-flash`)** | Google Cloud Vertex / AI Studio | Model configured via `LLM_MODEL` in `backend/app/config.py` and `.env.example`. Used at runtime for learner fact extraction (few-shot JSON extraction) and personalized pedagogical tutoring response generation. |
| **OpenAI / Groq (Fallback)** | OpenAI / Groq | Configured runtime fallback providers for LLM extraction and tutoring if primary quota limits are reached. |

---

## 2. Scope of AI-Generated vs Human-Authored Work

### A. Architecture & Engineering Design (Human-Led)
- **Primary Data Store Selection**: Decision to use FalkorDB exclusively as the primary memory graph, explicitly ruling out vector stores or flat document stores in favor of 2-hop prerequisite graph traversals (`Concept -[:REQUIRES]-> Concept`).
- **Graph-per-User Isolation Model**: Decided upon `recallai_<user_id>` graph isolation to provide zero possibility of cross-student data leakage.
- **Strict Anti-Scope Constraints**: Rejection of heavy multi-agent frameworks (e.g. LangChain, Cognee, Graphiti) to maintain small, explainable, and parameter-safe Cypher queries.
- **Deterministic Guardrails & Fast-Paths**: Personal pronoun and pedagogical cue word filter (`MEMORY_CUE_PATTERN`) designed to bypass unnecessary LLM calls for questions and commands.
- **Prompt Injection Hygiene**: Structural design enclosing user memories strictly in `<user_stored_data>` tags to prevent jailbreak execution.

### B. Implementation & Code Scaffolding (AI-Assisted)
- **Backend**: FastAPI route scaffolding, Pydantic schemas, and Cypher query templates in `backend/app/queries.py`.
- **Frontend**: React 18 + Vite components (`ChatWindow`, `MemoryList`, `EvidenceInspector`), CSS design tokens, and local offline mock adapter in `frontend/src/api.js`.
- **Testing**: 50 automated backend tests (pytest) and 7 frontend node tests, including the comprehensive 17-scenario evaluation suite in `backend/tests/test_phase5_eval.py`.
- **Documentation**: Generation of initial markdown templates (`docs/QUERIES.md`, `docs/ARCHITECTURE.md`, `docs/TEST_CHECKLIST.md`).

---

## 3. Human Review & Verification Rigor
1. **Zero Secret Leaks**: Strict gitignore policy, automated `git check-ignore` checks, and review of all diffs before every commit.
2. **Empirical Verification**: All persistence tests (Docker container restarts, volume attachments, backend process restarts) were executed against real running FalkorDB containers.
3. **No Unmeasured Claims**: All metrics, benchmark figures, and capability claims in documentation reflect actual measured test outputs.
