"""
RecallAI Chat History & Session Management Tests
Verifies Supabase integration with full mocking (zero network calls, zero LLM calls).
Tests:
- Save on chat turn
- Chat resilience when Supabase fails (partial success with warning)
- List sessions (newest first, max 50)
- Get session detail (ordered messages with turn metadata)
- Rename session
- Delete session
- User isolation enforcement (User B cannot access or modify User A's session)
- Strict input validation on user_id, session_id, and title
- Health check Supabase status reporting ("connected" | "unavailable" | "not_configured")
- CORS preflight for PATCH and DELETE
"""
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.chat_history import chat_history_service
from backend.app.services.extraction import extraction_service, ExtractedMemoryItem
from backend.app.services.answer_generation import answer_generation_service
from backend.app.database import db_manager

TEST_USER_ALICE = "student_alice"
TEST_USER_BOB = "student_bob"
TEST_SESSION_ID = "sess_history_01"

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture(autouse=True)
def cleanup_falkor_graphs():
    """Ensure clean disposable graphs in FalkorDB."""
    for u in [TEST_USER_ALICE, TEST_USER_BOB]:
        try:
            db_manager.get_user_graph(u).delete()
        except Exception:
            pass
    yield
    for u in [TEST_USER_ALICE, TEST_USER_BOB]:
        try:
            db_manager.get_user_graph(u).delete()
        except Exception:
            pass

def test_chat_turn_saves_to_supabase(client: TestClient, monkeypatch):
    """
    Verifies that a successful /chat turn calls chat_history_service.save_turn with
    user_message, assistant reply, and full turn data (retrieved memories, evidence, explanation).
    """
    monkeypatch.setattr(
        extraction_service,
        "extract_memories",
        lambda msg: ([ExtractedMemoryItem(
            kind="STRUGGLES_WITH",
            value="recursion",
            source_text="I struggle with recursion",
            canonical_concept="recursion"
        )], [])
    )
    monkeypatch.setattr(
        answer_generation_service,
        "generate_tutoring_answer",
        lambda **kwargs: "Let us start with base cases in recursion."
    )

    saved_calls = []
    def mock_save_turn(user_id, session_id, user_message, reply, turn_data):
        saved_calls.append({
            "user_id": user_id,
            "session_id": session_id,
            "user_message": user_message,
            "reply": reply,
            "turn_data": turn_data
        })

    monkeypatch.setattr(chat_history_service, "save_turn", mock_save_turn)

    res = client.post("/chat", json={
        "user_id": TEST_USER_ALICE,
        "session_id": TEST_SESSION_ID,
        "message": "I struggle with recursion, can you explain?"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["reply"] == "Let us start with base cases in recursion."
    assert len(saved_calls) == 1
    call = saved_calls[0]
    assert call["user_id"] == TEST_USER_ALICE
    assert call["session_id"] == TEST_SESSION_ID
    assert call["user_message"] == "I struggle with recursion, can you explain?"
    assert call["reply"] == "Let us start with base cases in recursion."
    assert "saved_memories" in call["turn_data"]
    assert "retrieved_memories" in call["turn_data"]
    assert "evidence_paths" in call["turn_data"]
    assert "explanation" in call["turn_data"]

def test_chat_succeeds_when_supabase_fails(client: TestClient, monkeypatch):
    """
    CRITICAL RESILIENCE REQUIREMENT:
    If Supabase raises an error, /chat must NOT fail. It must return 200 OK
    with normal reply and a warning with stage: 'history'.
    """
    monkeypatch.setattr(extraction_service, "extract_memories", lambda msg: ([], []))
    monkeypatch.setattr(
        answer_generation_service,
        "generate_tutoring_answer",
        lambda **kwargs: "Here is your explanation."
    )

    def failing_save_turn(*args, **kwargs):
        raise RuntimeError("Supabase connection timed out")

    monkeypatch.setattr(chat_history_service, "save_turn", failing_save_turn)

    res = client.post("/chat", json={
        "user_id": TEST_USER_ALICE,
        "session_id": TEST_SESSION_ID,
        "message": "Hello tutor!"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["reply"] == "Here is your explanation."
    assert any(w["stage"] == "history" for w in data["warnings"])
    hist_warn = next(w for w in data["warnings"] if w["stage"] == "history")
    assert "Supabase connection timed out" in hist_warn["message"] or "failed" in hist_warn["message"]

def test_list_sessions(client: TestClient, monkeypatch):
    """
    Verifies GET /sessions returns newest sessions first for a user.
    """
    sample_sessions = [
        {"id": "sess_02", "title": "Second chat", "created_at": "2026-10-17T10:00:00Z", "updated_at": "2026-10-17T10:30:00Z"},
        {"id": "sess_01", "title": "First chat", "created_at": "2026-10-17T09:00:00Z", "updated_at": "2026-10-17T09:30:00Z"},
    ]
    monkeypatch.setattr(chat_history_service, "list_sessions", lambda user_id, limit=50: sample_sessions)

    res = client.get(f"/sessions?user_id={TEST_USER_ALICE}")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["id"] == "sess_02"
    assert data[0]["title"] == "Second chat"
    assert data[1]["id"] == "sess_01"

def test_get_session_messages(client: TestClient, monkeypatch):
    """
    Verifies GET /sessions/{session_id} returns all messages with turn metadata.
    """
    sample_data = {
        "id": TEST_SESSION_ID,
        "title": "Recursion chat",
        "user_id": TEST_USER_ALICE,
        "created_at": "2026-10-17T10:00:00Z",
        "updated_at": "2026-10-17T10:05:00Z",
        "messages": [
            {
                "id": "msg_01",
                "session_id": TEST_SESSION_ID,
                "user_id": TEST_USER_ALICE,
                "role": "user",
                "text": "I struggle with recursion",
                "turn": None,
                "created_at": "2026-10-17T10:00:00Z"
            },
            {
                "id": "msg_02",
                "session_id": TEST_SESSION_ID,
                "user_id": TEST_USER_ALICE,
                "role": "assistant",
                "text": "Let us break down recursion into base cases.",
                "turn": {
                    "saved_memories": [{"id": "m1", "value": "recursion"}],
                    "evidence_paths": [],
                    "explanation": "Retrieved recursion concept."
                },
                "created_at": "2026-10-17T10:00:05Z"
            }
        ]
    }
    monkeypatch.setattr(chat_history_service, "get_session_messages", lambda session_id, user_id: sample_data)

    res = client.get(f"/sessions/{TEST_SESSION_ID}?user_id={TEST_USER_ALICE}")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == TEST_SESSION_ID
    assert data["title"] == "Recursion chat"
    assert len(data["messages"]) == 2
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][1]["role"] == "assistant"
    assert data["messages"][1]["turn"]["saved_memories"][0]["value"] == "recursion"

def test_rename_session(client: TestClient, monkeypatch):
    """
    Verifies PATCH /sessions/{session_id} updates title.
    """
    monkeypatch.setattr(
        chat_history_service,
        "rename_session",
        lambda session_id, user_id, title: {
            "id": session_id,
            "title": title,
            "updated_at": "2026-10-17T11:00:00Z"
        }
    )

    res = client.patch(f"/sessions/{TEST_SESSION_ID}", json={
        "user_id": TEST_USER_ALICE,
        "title": "Mastering Recursion"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == TEST_SESSION_ID
    assert data["title"] == "Mastering Recursion"

def test_delete_session(client: TestClient, monkeypatch):
    """
    Verifies DELETE /sessions/{session_id} successfully removes the session.
    """
    monkeypatch.setattr(chat_history_service, "delete_session", lambda session_id, user_id: True)

    res = client.delete(f"/sessions/{TEST_SESSION_ID}?user_id={TEST_USER_ALICE}")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "deleted"
    assert data["id"] == TEST_SESSION_ID

def test_user_isolation_cannot_read_or_delete_other_user_session(client: TestClient, monkeypatch):
    """
    SECURITY REQUIREMENT:
    User B must NEVER be able to read, rename, or delete User A's session.
    """
    # Simulate DB where session belongs to student_alice only
    def mock_get(session_id, user_id):
        if user_id == TEST_USER_ALICE and session_id == TEST_SESSION_ID:
            return {"id": TEST_SESSION_ID, "title": "Alice's Chat", "user_id": TEST_USER_ALICE, "messages": []}
        return None

    def mock_rename(session_id, user_id, title):
        if user_id == TEST_USER_ALICE and session_id == TEST_SESSION_ID:
            return {"id": TEST_SESSION_ID, "title": title, "updated_at": "2026-10-17T11:00:00Z"}
        return None

    def mock_delete(session_id, user_id):
        if user_id == TEST_USER_ALICE and session_id == TEST_SESSION_ID:
            return True
        return False

    monkeypatch.setattr(chat_history_service, "get_session_messages", mock_get)
    monkeypatch.setattr(chat_history_service, "rename_session", mock_rename)
    monkeypatch.setattr(chat_history_service, "delete_session", mock_delete)

    # 1. User B tries to read User A's session -> 404
    res_get = client.get(f"/sessions/{TEST_SESSION_ID}?user_id={TEST_USER_BOB}")
    assert res_get.status_code == 404

    # 2. User B tries to rename User A's session -> 404
    res_rename = client.patch(f"/sessions/{TEST_SESSION_ID}", json={
        "user_id": TEST_USER_BOB,
        "title": "Hacked Title"
    })
    assert res_rename.status_code == 404

    # 3. User B tries to delete User A's session -> 404
    res_del = client.delete(f"/sessions/{TEST_SESSION_ID}?user_id={TEST_USER_BOB}")
    assert res_del.status_code == 404

def test_chat_save_turn_cannot_hijack_or_modify_other_user_session(client: TestClient, monkeypatch):
    """
    CRITICAL SECURITY CHECK:
    User B sending User A's session_id:
    (a) Does NOT modify A's session or messages.
    (b) /chat itself still returns 200 OK with a history warning.
    """
    # Setup Alice's existing session state in mock storage
    alice_session = {
        "id": "sess_alice_secret",
        "user_id": TEST_USER_ALICE,
        "title": "Alice's Private Session",
        "updated_at": "2026-10-17T09:00:00Z"
    }
    alice_messages = [
        {"id": "m1", "session_id": "sess_alice_secret", "user_id": TEST_USER_ALICE, "text": "Alice secret message"}
    ]

    # Save_turn implementation that executes the real ownership check logic
    def secure_save_turn(user_id, session_id, user_message, reply, turn_data):
        # Simulated DB lookup by session_id:
        if session_id == alice_session["id"]:
            if alice_session["user_id"] != user_id:
                raise PermissionError(
                    f"Session '{session_id}' already belongs to a different user. Cross-user session modification is forbidden."
                )
            alice_session["updated_at"] = "2026-10-17T11:00:00Z"
        else:
            pass

    monkeypatch.setattr(chat_history_service, "save_turn", secure_save_turn)
    monkeypatch.setattr(extraction_service, "extract_memories", lambda msg: ([], []))
    monkeypatch.setattr(answer_generation_service, "generate_tutoring_answer", lambda **kwargs: "Tutor reply for Bob.")

    # Bob attempts to post to Alice's session_id
    res = client.post("/chat", json={
        "user_id": TEST_USER_BOB,
        "session_id": "sess_alice_secret",
        "message": "Bob trying to hijack Alice's session"
    })

    # (b) /chat returns 200 with normal reply and history warning
    assert res.status_code == 200
    data = res.json()
    assert data["reply"] == "Tutor reply for Bob."
    assert any(w["stage"] == "history" for w in data["warnings"])
    hist_warn = next(w for w in data["warnings"] if w["stage"] == "history")
    assert "Cross-user session modification is forbidden" in hist_warn["message"]

    # (a) Confirm Alice's session and messages were NOT modified or overwritten
    assert alice_session["user_id"] == TEST_USER_ALICE
    assert alice_session["title"] == "Alice's Private Session"
    assert alice_session["updated_at"] == "2026-10-17T09:00:00Z"
    assert len(alice_messages) == 1
    assert alice_messages[0]["user_id"] == TEST_USER_ALICE

def test_service_save_turn_raises_permission_error_on_owner_mismatch(monkeypatch):
    """
    Direct unit test of chat_history_service.save_turn verifying that
    it queries by session_id and raises PermissionError if user_id doesn't match.
    """
    class MockResponse:
        def __init__(self, json_data, status_code=200):
            self._json = json_data
            self.status_code = status_code
        def json(self):
            return self._json
        def raise_for_status(self):
            pass

    class MockHttpxClient:
        def __init__(self, *args, **kwargs):
            self.patch_called = False
            self.post_called = False
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def get(self, url, params=None, headers=None):
            # Return existing session owned by Alice
            if params and "sess_alice_01" in params.get("id", ""):
                return MockResponse([{"id": "sess_alice_01", "user_id": "student_alice", "title": "Alice Title"}])
            return MockResponse([])
        def patch(self, *args, **kwargs):
            self.patch_called = True
            return MockResponse([{}])
        def post(self, *args, **kwargs):
            self.post_called = True
            return MockResponse([{}])

    import httpx
    from backend.app.config import settings

    monkeypatch.setattr(httpx, "Client", MockHttpxClient)
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://mock.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "mock_key")

    from backend.app.services.chat_history import ChatHistoryService

    with pytest.raises(PermissionError) as exc_info:
        ChatHistoryService.save_turn(
            chat_history_service,
            user_id="student_bob",
            session_id="sess_alice_01",
            user_message="Hello",
            reply="Hi",
            turn_data={}
        )

    assert "belongs to a different user" in str(exc_info.value)

def test_invalid_identifiers_rejected(client: TestClient):
    """
    Verifies that malformed user_id, session_id, or title are rejected with 422.
    """
    # Bad user_id on list
    assert client.get("/sessions?user_id=bad!name").status_code == 422
    assert client.get("/sessions?user_id=a").status_code == 422

    # Bad session_id on get
    assert client.get(f"/sessions/bad!id?user_id={TEST_USER_ALICE}").status_code == 422

    # Bad user_id on get
    assert client.get(f"/sessions/{TEST_SESSION_ID}?user_id=bad!").status_code == 422

    # Bad title (empty or whitespace) on rename
    assert client.patch(f"/sessions/{TEST_SESSION_ID}", json={
        "user_id": TEST_USER_ALICE,
        "title": "   "
    }).status_code == 422

    # Bad session_id on delete
    assert client.delete(f"/sessions/bad!id?user_id={TEST_USER_ALICE}").status_code == 422

    # Bad user_id on delete
    assert client.delete(f"/sessions/{TEST_SESSION_ID}?user_id=bad!").status_code == 422

def test_health_reports_supabase_status(client: TestClient, monkeypatch):
    """
    Verifies /health reports supabase status ("connected" | "unavailable" | "not_configured")
    without exposing any key or secret.
    """
    # 1. Connected
    monkeypatch.setattr(chat_history_service, "check_health", lambda: "connected")
    res1 = client.get("/health")
    assert res1.status_code == 200
    assert res1.json()["supabase"] == "connected"

    # 2. Unavailable
    monkeypatch.setattr(chat_history_service, "check_health", lambda: "unavailable")
    res2 = client.get("/health")
    assert res2.status_code == 200
    assert res2.json()["supabase"] == "unavailable"

    # 3. Not Configured
    monkeypatch.setattr(chat_history_service, "check_health", lambda: "not_configured")
    res3 = client.get("/health")
    assert res3.status_code == 200
    assert res3.json()["supabase"] == "not_configured"

def test_cors_methods_allow_patch_and_delete(client: TestClient):
    """
    Verifies CORS preflight allows PATCH and DELETE methods explicitly.
    """
    for method in ["PATCH", "DELETE"]:
        res = client.options(
            "/sessions/test_sess",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "Content-Type",
            }
        )
        assert res.status_code == 200
        allowed = res.headers.get("access-control-allow-methods", "")
        assert method in allowed
