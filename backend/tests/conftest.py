import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.chat_history import chat_history_service

@pytest.fixture
def client():
    """Returns a TestClient instance for FastAPI application testing."""
    return TestClient(app)

@pytest.fixture(autouse=True)
def mock_supabase_network(monkeypatch):
    """
    Guarantees zero network calls to Supabase during automated testing.
    Individual tests in test_chat_history.py override these mocks as needed.
    """
    monkeypatch.setattr(chat_history_service, "save_turn", lambda *args, **kwargs: None)
    monkeypatch.setattr(chat_history_service, "check_health", lambda: "connected")
