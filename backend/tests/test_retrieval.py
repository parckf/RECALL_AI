"""
Tests for 2-Hop Prerequisite Graph Retrieval and Evidence Step Construction.
Uses disposable test graphs that are cleaned up after execution.
"""
import pytest
from backend.app.database import db_manager
from backend.app.services.curriculum import seed_curriculum_if_needed
from backend.app.services.memory_store import memory_store
from backend.app.services.retrieval import retrieval_service, identify_concepts_in_text

TEST_USER_RETRIEVAL = "test_user_retrieval"

@pytest.fixture(autouse=True)
def cleanup_retrieval_graph():
    try:
        g = db_manager.get_user_graph(TEST_USER_RETRIEVAL)
        g.delete()
    except Exception:
        pass
    yield
    try:
        g = db_manager.get_user_graph(TEST_USER_RETRIEVAL)
        g.delete()
    except Exception:
        pass

def test_concept_identification():
    """
    Test identifying concepts from user text using aliases.
    """
    assert "recursion" in identify_concepts_in_text("I want to understand recursive functions")
    assert "functions" in identify_concepts_in_text("How do def functions work?")
    assert "generators" in identify_concepts_in_text("What does the yield keyword do?")
    assert len(identify_concepts_in_text("What is the weather in Paris?")) == 0

def test_prerequisite_traversal_and_evidence_steps():
    """
    Test that a message on recursion traverses prerequisite concepts (functions, variables)
    and constructs real evidence steps from FalkorDB.
    """
    # 1. Save user struggle with recursion
    memory_store.save_memory(
        user_id=TEST_USER_RETRIEVAL,
        session_id="sess_1",
        kind="STRUGGLES_WITH",
        value="recursion",
        source_text="I find recursion tricky",
        concept_id="recursion"
    )

    # 2. Also save pedagogical preference
    memory_store.save_memory(
        user_id=TEST_USER_RETRIEVAL,
        session_id="sess_1",
        kind="PREFERS",
        value="visual diagrams",
        source_text="I prefer visual diagrams"
    )

    # 3. Retrieve context for a question about recursion
    retrieved_mems, evidence_paths, explanation, prereqs = retrieval_service.retrieve_context(
        user_id=TEST_USER_RETRIEVAL,
        message="Can you explain how recursive calls work?"
    )

    # Verify retrieved memories
    assert len(retrieved_mems) >= 1
    assert any(m.value == "recursion" for m in retrieved_mems)
    assert any(m.kind == "PREFERS" for m in retrieved_mems)

    # Verify prerequisite concepts list
    assert len(prereqs) >= 1
    assert "functions" in prereqs

    # Verify evidence paths: Student -HAS_MEMORY-> Memory(...) -ABOUT-> Concept(...) -REQUIRES-> prereq
    assert len(evidence_paths) > 0
    first_path = evidence_paths[0]
    assert len(first_path.steps) >= 3

    # Step 1: Student -> HAS_MEMORY -> Memory(...)
    assert first_path.steps[0].from_node == "Student"
    assert first_path.steps[0].relation == "HAS_MEMORY"
    assert first_path.steps[0].to_node == 'Memory("Struggles with recursion")'
    assert first_path.steps[0].origin == "You said"

    # Step 2: Memory(...) -> ABOUT -> Concept(recursion)
    assert first_path.steps[1].from_node == 'Memory("Struggles with recursion")'
    assert first_path.steps[1].relation == "ABOUT"
    assert first_path.steps[1].to_node == "Concept(recursion)"
    assert first_path.steps[1].origin == "You said"

    # Step 3: Concept(recursion) -> REQUIRES -> (prerequisite)
    assert first_path.steps[2].from_node == "Concept(recursion)"
    assert first_path.steps[2].relation == "REQUIRES"
    assert first_path.steps[2].origin == "Curated"

    # Verify explanation string
    assert "Retrieved" in explanation
    assert "recursion" in explanation

def test_resolved_memories_are_excluded_from_retrieval():
    """
    Resolved memories must never influence answers or be retrieved in context.
    """
    # 1. Save memory
    memory_store.save_memory(
        user_id=TEST_USER_RETRIEVAL,
        session_id="sess_1",
        kind="STRUGGLES_WITH",
        value="recursion",
        source_text="I find recursion tricky",
        concept_id="recursion"
    )

    # 2. Resolve memory
    memory_store.resolve_memory(
        user_id=TEST_USER_RETRIEVAL,
        kind="STRUGGLES_WITH",
        canonical_value="recursion"
    )

    # 3. Retrieve context
    retrieved_mems, evidence_paths, explanation, prereqs = retrieval_service.retrieve_context(
        user_id=TEST_USER_RETRIEVAL,
        message="Explain recursion to me"
    )

    # Resolved memory must not appear in retrieved active context
    assert not any(m.value == "recursion" for m in retrieved_mems)

def test_irrelevant_query_retrieves_nothing():
    """
    Questions unrelated to programming concepts or user memory must retrieve nothing.
    """
    retrieved_mems, evidence_paths, explanation, prereqs = retrieval_service.retrieve_context(
        user_id=TEST_USER_RETRIEVAL,
        message="What is the capital of France?"
    )

    assert len(retrieved_mems) == 0
    assert len(evidence_paths) == 0
    assert "No relevant memories" in explanation
    assert len(prereqs) == 0
