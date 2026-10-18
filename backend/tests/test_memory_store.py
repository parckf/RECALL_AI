"""
Tests for Curriculum Seeding, MemoryStore, Deduplication, and GET /memories.
Uses isolated disposable test graphs that are cleaned up after execution.
"""
import pytest
from fastapi.testclient import TestClient
from backend.app.database import db_manager
from backend.app.services.curriculum import seed_curriculum_if_needed, CURATED_CONCEPTS
from backend.app.services.memory_store import memory_store
from backend.app.queries import COUNT_CONCEPTS

TEST_USER_A = "test_user_alice"
TEST_USER_B = "test_user_bob"

@pytest.fixture(autouse=True)
def cleanup_test_graphs():
    """
    Guarantees test graphs are deleted before and after each test.
    Never modifies production or shared graphs.
    """
    for user_id in [TEST_USER_A, TEST_USER_B]:
        try:
            g = db_manager.get_user_graph(user_id)
            g.delete()
        except Exception:
            pass
    yield
    for user_id in [TEST_USER_A, TEST_USER_B]:
        try:
            g = db_manager.get_user_graph(user_id)
            g.delete()
        except Exception:
            pass

def test_idempotent_curriculum_seeding():
    """
    Verifies that the concept map seeds exactly 15 concepts on first call
    and is strictly idempotent on subsequent calls.
    """
    graph = db_manager.get_user_graph(TEST_USER_A)
    
    # First seed: should return True and populate all concepts
    seeded_first = seed_curriculum_if_needed(graph)
    assert seeded_first is True
    
    count_res = graph.ro_query(COUNT_CONCEPTS)
    assert count_res.result_set[0][0] == len(CURATED_CONCEPTS)
    assert count_res.result_set[0][0] == 15
    
    # Second seed: should return False and keep count at 15
    seeded_second = seed_curriculum_if_needed(graph)
    assert seeded_second is False
    
    count_res_again = graph.ro_query(COUNT_CONCEPTS)
    assert count_res_again.result_set[0][0] == 15

def test_memory_save_and_deduplication():
    """
    Tests saving a memory, verifying its properties, and ensuring duplicate statements
    result in action='already_known' without creating redundant nodes.
    """
    # 1. First save
    mem1 = memory_store.save_memory(
        user_id=TEST_USER_A,
        session_id="sess_001",
        kind="STRUGGLES_WITH",
        value="recursion",
        source_text="I find recursion really hard",
        concept_id="recursion"
    )
    assert mem1.action == "created"
    assert mem1.status == "active"
    assert mem1.value == "recursion"
    
    # 2. Duplicate save with same kind and canonical value
    mem2 = memory_store.save_memory(
        user_id=TEST_USER_A,
        session_id="sess_002",
        kind="STRUGGLES_WITH",
        value="Recursion",  # different case
        source_text="I still struggle with recursion",
        concept_id="recursion"
    )
    assert mem2.action == "already_known"
    assert mem2.id == mem1.id  # Same node preserved!
    
    # Verify count of memories in user graph is still 1
    all_mems = memory_store.get_all_memories(TEST_USER_A)
    assert len(all_mems) == 1

def test_memory_resolution():
    """
    Tests that 'I no longer struggle with X' marks memory as resolved rather than deleting it.
    """
    # Create active memory
    memory_store.save_memory(
        user_id=TEST_USER_A,
        session_id="sess_001",
        kind="STRUGGLES_WITH",
        value="recursion",
        source_text="I find recursion tricky",
        concept_id="recursion"
    )
    
    # Resolve memory
    resolved = memory_store.resolve_memory(
        user_id=TEST_USER_A,
        kind="STRUGGLES_WITH",
        canonical_value="recursion"
    )
    assert resolved is not None
    assert resolved.action == "resolved"
    assert resolved.status == "resolved"
    
    # Verify memory still exists in history
    all_mems = memory_store.get_all_memories(TEST_USER_A)
    assert len(all_mems) == 1
    assert all_mems[0].status == "resolved"
    
    # Verify memory is NOT in active memories
    active_mems = memory_store.get_active_memories(TEST_USER_A)
    assert len(active_mems) == 0

def test_user_isolation(client: TestClient):
    """
    Critical requirement: User B can NEVER see User A's data.
    """
    # Add memory to User A
    memory_store.save_memory(
        user_id=TEST_USER_A,
        session_id="sess_alice",
        kind="STRUGGLES_WITH",
        value="recursion",
        source_text="I struggle with recursion"
    )
    
    # Query memories endpoint for User A
    res_a = client.get(f"/memories?user_id={TEST_USER_A}")
    assert res_a.status_code == 200
    assert len(res_a.json()["memories"]) == 1
    
    # Query memories endpoint for User B
    res_b = client.get(f"/memories?user_id={TEST_USER_B}")
    assert res_b.status_code == 200
    assert len(res_b.json()["memories"]) == 0

def test_get_memories_validation(client: TestClient):
    """
    Tests validation rules on user_id format for /memories.
    """
    # Invalid user_id with special characters or too short
    bad_res = client.get("/memories?user_id=a!")
    assert bad_res.status_code == 422
    
    # Valid user_id
    good_res = client.get(f"/memories?user_id={TEST_USER_A}")
    assert good_res.status_code == 200
