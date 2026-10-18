# RecallAI — Official Hackathon Submission Checklist

**Hackathon**: [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb)  
**Organizers**: WeMakeDevs & FalkorDB  
**Event Window**: October 15, 12:01 AM IST – October 18, 11:59 PM IST, 2026  
**Project Name**: RecallAI  
**Target Track**: **Agent Memory and Coordination** (Track 2)

---

## 📋 Deliverables Matrix (Official Rule 10 & Core Requirements)

Every official requirement from the [Official Hackathon Rules](https://www.wemakedevs.org/hackathons/falkordb/rules) is mapped below to the exact file, URL, or code artifact that satisfies it.

| # | Official Requirement | Satisfying File / URL | Status | Details & Notes |
| :-: | :--- | :--- | :-: | :--- |
| **1** | **Target Track Named** | [README.md](../README.md), [ARCHITECTURE.md](ARCHITECTURE.md) | **`[DONE]`** | Project targets **Track 2: Agent Memory and Coordination**, with persistent, explainable graph memory across sessions. |
| **2** | **Public Source-Code Repository** | [GitHub Repository](https://github.com/lovishsingla00001-hub/Graph_hacks_hackathon) | **`[DONE]`** | Publicly accessible GitHub repository with clear commit history starting within the hackathon window. |
| **3** | **FalkorDB as Primary Graph Database** | [docker-compose.yml](../docker-compose.yml), [backend/app/database.py](../backend/app/database.py) | **`[DONE]`** | FalkorDB is the primary store for learner memory and curriculum graph; Supabase is used only for chat transcripts. |
| **4** | **Graph Performs Essential Work** | [retrieval.py](../backend/app/services/retrieval.py), [memory_store.py](../backend/app/services/memory_store.py) | **`[DONE]`** | FalkorDB performs 1- and 2-hop prerequisite traversals; it powers personalized retrieval and memory continuity. |
| **5** | **Graph Data Model Specification** | [schema.md](schema.md), [ARCHITECTURE.md](ARCHITECTURE.md) | **`[DONE]`** | Node labels, properties, relationship semantics, and an evidence path are documented. |
| **6** | **Cypher Queries & Graph Logic** | [QUERIES.md](QUERIES.md), [queries.py](../backend/app/queries.py) | **`[DONE]`** | Parameterized Cypher templates and their purposes are documented. |
| **7** | **Complete Local Setup Instructions** | [README.md](../README.md) | **`[DONE]`** | Step-by-step local setup covers Docker, Python/FastAPI, database configuration, graph seeding, and React/Vite. A fresh-machine run is still pending verification. |
| **8** | **Interactive Demo Script & Walkthrough** | [README.md](../README.md), [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | **`[DONE]`** | Five-turn demo walkthrough covers memory, prerequisite retrieval, resolution, continuity, and user isolation. |
| **9** | **AI-Use Disclosure** | [AI_USE.md](../AI_USE.md) | **`[DONE]`** | AI-use disclosure is included. |
| **10** | **Demo Video of Working Project** | Video URL: **PENDING** | **`[PENDING - TEAM ACTION]`** | Record and upload a short demo using [DEMO_SCRIPT.md](DEMO_SCRIPT.md), then paste the URL into the submission form. |

---

## 🔍 Rule-by-Rule Compliance Check

Comparison against the official rules at **[https://www.wemakedevs.org/hackathons/falkordb/rules](https://www.wemakedevs.org/hackathons/falkordb/rules)**:

1. **Rule 1 (Team Size)**: Solo / Team up to 4 members.  
   *RecallAI Status*: Compliant.
2. **Rule 2 & 3 (FalkorDB as Primary Store & Real Graph Work)**:  
   *RecallAI Status*: Compliant. FalkorDB is the primary database mounted with named volume persistence (`recallai_falkordb_data`). Multi-hop prerequisite reasoning (`Concept -[:REQUIRES]-> Concept`) is central to the application.
3. **Rule 4 (Deployment & Execution Flexibility)**:  
   *RecallAI Status*: Compliant. Runs via standard Docker Compose with local FastAPI backend and Vite frontend.
4. **Rule 5 (Challenge Tracks)**:  
   *RecallAI Status*: Compliant. Specifically targeted to **Track 2: Agent Memory and Coordination**.
5. **Rule 6 (Data Permissions & Hygiene)**:  
   *RecallAI Status*: Compliant. Uses a curated, public 15-concept Python syllabus. Zero private, copyrighted, or sensitive user data is loaded.
6. **Rule 7 & 8 (Hackathon Timeline & Fresh Work)**:  
   *RecallAI Status*: Compliant. Initial commit created October 15, 2026. All development completed inside the Oct 15–18, 2026 window.
7. **Rule 9 (Open-Source Tools & Libraries)**:  
   *RecallAI Status*: Compliant. Built with standard open-source tools (FastAPI, React, FalkorDB Python client).
8. **Rule 10 (Mandatory Submission Items)**:  
   *RecallAI Status*: Repository docs and local demo materials are present. Video upload and form submission still need team completion.
9. **Rule 11, 12, 13 (AI Disclosure & Code Understanding)**:  
   *RecallAI Status*: AI-use, architecture, and learning documents are included. Current local tests: 27 frontend tests passed; full backend integration suite needs FalkorDB running and was not verified in this workspace. See [TEST_CHECKLIST.md](TEST_CHECKLIST.md).

> **Finalization note (2026-10-18)**: The official rules require a public source repository, README with setup and graph model, essential Cypher/graph logic, a working-project demo video, and either a live deployment or complete local setup instructions. The video remains pending, fresh-machine setup was not verified in this workspace, and the submission form/team roster still need a final human check. This downloaded workspace has no Git metadata, so local edits here have not been pushed to the public repository.
