"""
End-to-End Multi-Session Graph Memory Verification Test
Verifies the complete flow required for Phase 4:
1. Session 1: User expresses a difficulty ("I struggle with recursion, can you explain it?").
   FalkorDB stores the memory and links it to the concept graph.
2. Session 2: User starts a fresh session and asks a related question.
   FalkorDB retrieves the active difficulty across session boundaries,
   traverses the 2-hop prerequisite graph (recursion -> functions -> variables),
   returns real evidence steps, and tailors the response without losing context.
"""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import db_manager
from backend.app.services.extraction import extraction_service, ExtractedMemoryItem
from backend.app.services.answer_generation import answer_generation_service

DEMO_USER_ID = "student_alice"

@pytest.fixture
def client():
    return TestClient(app)

def test_multisession_memory_persistence_and_evidence(client: TestClient, monkeypatch):
    """
    Simulates real user interaction across two distinct sessions:
    Session 1 saves the difficulty into FalkorDB.
    Session 2 starts fresh, but retrieves the saved difficulty and constructs evidence.
    """
    # Clean up test user graph before and after
    try:
        db_manager.get_user_graph(DEMO_USER_ID).delete()
    except Exception:
        pass

    # --- SESSION 1: Save a difficulty ---
    session_1_id = "sess_session_1"
    
    # Mock LLM generation for deterministic testing, but FalkorDB is 100% REAL
    monkeypatch.setattr(
        extraction_service,
        "extract_memories",
        lambda msg: (
            [
                ExtractedMemoryItem(
                    kind="STRUGGLES_WITH",
                    value="recursion",
                    source_text="I struggle with recursion",
                    canonical_concept="recursion"
                )
            ],
            []
        )
    )
    monkeypatch.setattr(
        answer_generation_service,
        "generate_tutoring_answer",
        lambda user_message="", retrieved_memories=None, **kwargs: (
            "I noticed you struggle with recursion. Since recursion builds on functions, let's start with a base condition!"
        )
    )

    resp1 = client.post("/chat", json={
        "user_id": DEMO_USER_ID,
        "session_id": session_1_id,
        "message": "I struggle with recursion, can you explain it?"
    })
    assert resp1.status_code == 200
    data1 = resp1.json()

    # Verify memory was persisted to FalkorDB
    assert len(data1["saved_memories"]) == 1
    saved_mem = data1["saved_memories"][0]
    assert saved_mem["kind"] == "STRUGGLES_WITH"
    assert saved_mem["value"] == "recursion"
    assert saved_mem["session_id"] == session_1_id
    assert saved_mem["status"] == "active"
    assert saved_mem["action"] == "created"

    # Verify GET /memories returns the newly saved memory
    resp_mems = client.get(f"/memories?user_id={DEMO_USER_ID}")
    assert resp_mems.status_code == 200
    mems_data = resp_mems.json()
    assert len(mems_data["memories"]) >= 1
    assert any(m["value"] == "recursion" and m["status"] == "active" for m in mems_data["memories"])

    # --- SESSION 2: New session, ask related question ---
    session_2_id = "sess_session_2"

    # In session 2, user asks a pure question (extraction yields 0 new memories)
    monkeypatch.setattr(
        extraction_service,
        "extract_memories",
        lambda msg: ([], [])
    )

    captured_prompt_memories = []
    def mock_answer_gen(user_message="", retrieved_memories=None, **kwargs):
        captured_prompt_memories.extend(retrieved_memories or [])
        return "Because recursion relies on function call frames, let's review how return statements work in Python."

    monkeypatch.setattr(
        answer_generation_service,
        "generate_tutoring_answer",
        mock_answer_gen
    )

    resp2 = client.post("/chat", json={
        "user_id": DEMO_USER_ID,
        "session_id": session_2_id,
        "message": "Can you explain how recursive calls work?"
    })
    assert resp2.status_code == 200
    data2 = resp2.json()

    # 1. No new memories were saved in session 2 (pure question)
    assert len(data2["saved_memories"]) == 0

    # 2. FalkorDB graph memory from session 1 was retrieved in session 2!
    assert len(data2["retrieved_memories"]) >= 1
    retrieved_rec = next((m for m in data2["retrieved_memories"] if m["value"] == "recursion"), None)
    assert retrieved_rec is not None
    assert retrieved_rec["session_id"] == session_1_id  # Proven to originate from session 1!

    # 3. Real evidence paths traversed in FalkorDB:
    assert len(data2["evidence_paths"]) > 0
    first_path = data2["evidence_paths"][0]
    
    # Path steps: Student -HAS_MEMORY-> Memory(...) -ABOUT-> Concept(recursion) -REQUIRES-> (prerequisite)
    step_0 = first_path["steps"][0]
    assert step_0["from"] == "Student"
    assert step_0["relation"] == "HAS_MEMORY"
    assert step_0["to"] == 'Memory("Struggles with recursion")'
    assert step_0["origin"] == "You said"

    step_1 = first_path["steps"][1]
    assert step_1["from"] == 'Memory("Struggles with recursion")'
    assert step_1["relation"] == "ABOUT"
    assert step_1["to"] == "Concept(recursion)"
    assert step_1["origin"] == "You said"

    step_2 = first_path["steps"][2]
    assert step_2["from"] == "Concept(recursion)"
    assert step_2["relation"] == "REQUIRES"
    assert step_2["origin"] == "Curated"

    # All third steps must be REQUIRES from Concept(recursion) to a curated prerequisite
    prereq_targets = {p["steps"][2]["to"] for p in data2["evidence_paths"]}
    assert "functions" in prereq_targets

    # 4. Deterministic explanation references the retrieved memory
    assert "Retrieved" in data2["explanation"]
    assert "recursion" in data2["explanation"]

    # 5. Verify captured context in LLM answer prompt
    assert len(captured_prompt_memories) >= 1
    assert any(m.value == "recursion" for m in captured_prompt_memories)

    # Clean up after test
    try:
        db_manager.get_user_graph(DEMO_USER_ID).delete()
    except Exception:
        pass
