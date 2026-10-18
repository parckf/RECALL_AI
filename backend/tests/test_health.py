"""
Tests for GET /health endpoint and CORS configuration.
"""
from fastapi.testclient import TestClient
from backend.app.database import db_manager

def test_health_ok_when_db_connected(client: TestClient):
    """
    Test that /health returns 200 OK with connected status when FalkorDB is running.
    """
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert "llm_configured" in data

def test_health_503_when_db_disconnected(client: TestClient, monkeypatch):
    """
    Test that /health returns 503 Service Unavailable when FalkorDB is unreachable.
    """
    # Mock check_health to simulate database failure
    monkeypatch.setattr(db_manager, "check_health", lambda: False)
    
    response = client.get("/health")
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["database"] == "disconnected"

def test_cors_preflight_allowed_origin(client: TestClient):
    """
    Test CORS preflight headers for Vite origin http://localhost:5173.
    """
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Content-Type",
        }
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "GET" in response.headers.get("access-control-allow-methods", "")

def test_cors_preflight_disallowed_origin(client: TestClient):
    """
    Test that unauthorized origins do not receive allow headers.
    """
    response = client.options(
        "/health",
        headers={
            "Origin": "http://evil-origin.example.com",
            "Access-Control-Request-Method": "GET",
        }
    )
    assert response.headers.get("access-control-allow-origin") is None
