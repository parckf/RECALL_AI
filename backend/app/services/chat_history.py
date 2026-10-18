"""
RecallAI Supabase Chat History Service
Persists conversation turns and sessions to Supabase via PostgREST REST API.
Guarantees user isolation by strictly filtering all queries and mutations by user_id.
Never logs, exposes, or leaks secret credentials.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal
import httpx
from backend.app.config import settings

logger = logging.getLogger("recallai.chat_history")

class ChatHistoryService:
    def __init__(self):
        self._timeout = 5.0

    @property
    def _headers(self) -> Dict[str, str]:
        headers = {
            "apikey": settings.SUPABASE_SECRET_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        # Current Supabase sb_secret_* API keys are not JWTs and must only be
        # sent in the apikey header. Legacy service_role JWT keys still need
        # Authorization so PostgREST assumes the service_role database role.
        if not settings.SUPABASE_SECRET_KEY.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {settings.SUPABASE_SECRET_KEY}"
        return headers

    @property
    def _rest_url(self) -> str:
        base = settings.SUPABASE_URL.rstrip("/")
        return f"{base}/rest/v1"

    def check_health(self) -> Literal["connected", "unavailable", "not_configured"]:
        """
        Reports whether Supabase is connected, unavailable, or not configured.
        Never exposes secrets in status output or logs.
        """
        if not settings.is_supabase_configured:
            return "not_configured"
        try:
            url = f"{self._rest_url}/chat_sessions"
            with httpx.Client(timeout=3.0) as client:
                res = client.get(url, params={"limit": "1", "select": "id"}, headers=self._headers)
                if res.status_code < 400:
                    return "connected"
                logger.warning("Supabase health ping returned status %d", res.status_code)
                return "unavailable"
        except Exception as e:
            logger.warning("Supabase health ping failed: %s", type(e).__name__)
            return "unavailable"

    def save_turn(
        self,
        user_id: str,
        session_id: str,
        user_message: str,
        reply: str,
        turn_data: Dict[str, Any]
    ) -> None:
        """
        Persists a completed chat turn to Supabase:
        1. Upserts chat_sessions (title = first message truncated to 40 chars; updated_at = now).
        2. Appends user message and assistant reply to chat_messages.
        Raises an exception if Supabase communication fails so caller can handle gracefully.
        """
        if not settings.is_supabase_configured:
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        base_url = self._rest_url

        with httpx.Client(timeout=self._timeout) as client:
            # Check if session exists (by id) to prevent cross-user session modification or hijacking
            check_res = client.get(
                f"{base_url}/chat_sessions",
                params={"id": f"eq.{session_id}", "select": "id,user_id,title"},
                headers=self._headers
            )
            check_res.raise_for_status()
            existing_sessions = check_res.json()

            if existing_sessions:
                existing_session = existing_sessions[0]
                if existing_session.get("user_id") != user_id:
                    raise PermissionError(
                        f"Session '{session_id}' already belongs to a different user. Cross-user session modification is forbidden."
                    )
                # Update existing session timestamp without altering user_id or title
                patch_res = client.patch(
                    f"{base_url}/chat_sessions",
                    params={"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
                    json={"updated_at": now_iso},
                    headers=self._headers
                )
                patch_res.raise_for_status()
            else:
                # Insert new session with truncated title
                clean_msg = user_message.strip().replace("\n", " ")
                title = clean_msg[:40] if clean_msg else "New Chat"
                post_res = client.post(
                    f"{base_url}/chat_sessions",
                    json=[{
                        "id": session_id,
                        "user_id": user_id,
                        "title": title,
                        "created_at": now_iso,
                        "updated_at": now_iso
                    }],
                    headers=self._headers
                )
                post_res.raise_for_status()

            # Insert both messages
            messages_payload = [
                {
                    "session_id": session_id,
                    "user_id": user_id,
                    "role": "user",
                    "text": user_message,
                    "turn": None,
                    "created_at": now_iso
                },
                {
                    "session_id": session_id,
                    "user_id": user_id,
                    "role": "assistant",
                    "text": reply,
                    "turn": turn_data,
                    "created_at": now_iso
                }
            ]

            msg_res = client.post(
                f"{base_url}/chat_messages",
                json=messages_payload,
                headers=self._headers
            )
            msg_res.raise_for_status()

    def list_sessions(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Lists newest sessions first for the specified user (max 50).
        """
        if not settings.is_supabase_configured:
            return []

        with httpx.Client(timeout=self._timeout) as client:
            res = client.get(
                f"{self._rest_url}/chat_sessions",
                params={
                    "user_id": f"eq.{user_id}",
                    "order": "updated_at.desc",
                    "limit": str(min(limit, 50)),
                    "select": "id,title,created_at,updated_at"
                },
                headers=self._headers
            )
            res.raise_for_status()
            return res.json()

    def get_session_messages(self, session_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a session and all its messages in chronological order.
        Returns None if the session does not exist or does not belong to user_id.
        """
        if not settings.is_supabase_configured:
            return None

        with httpx.Client(timeout=self._timeout) as client:
            # Verify session ownership
            sess_res = client.get(
                f"{self._rest_url}/chat_sessions",
                params={
                    "id": f"eq.{session_id}",
                    "user_id": f"eq.{user_id}",
                    "select": "id,title,user_id,created_at,updated_at"
                },
                headers=self._headers
            )
            sess_res.raise_for_status()
            sessions = sess_res.json()
            if not sessions:
                return None

            session = sessions[0]

            # Fetch messages
            msg_res = client.get(
                f"{self._rest_url}/chat_messages",
                params={
                    "session_id": f"eq.{session_id}",
                    "user_id": f"eq.{user_id}",
                    "order": "created_at.asc"
                },
                headers=self._headers
            )
            msg_res.raise_for_status()
            messages = msg_res.json()

            return {
                "id": session["id"],
                "title": session["title"],
                "user_id": session["user_id"],
                "created_at": session.get("created_at"),
                "updated_at": session.get("updated_at"),
                "messages": messages
            }

    def rename_session(self, session_id: str, user_id: str, title: str) -> Optional[Dict[str, Any]]:
        """
        Renames a session. Returns None if session does not belong to user_id.
        """
        if not settings.is_supabase_configured:
            return None

        now_iso = datetime.now(timezone.utc).isoformat()
        with httpx.Client(timeout=self._timeout) as client:
            res = client.patch(
                f"{self._rest_url}/chat_sessions",
                params={"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
                json={"title": title, "updated_at": now_iso},
                headers=self._headers
            )
            res.raise_for_status()
            rows = res.json()
            if not rows:
                return None
            return rows[0]

    def delete_session(self, session_id: str, user_id: str) -> bool:
        """
        Deletes a session and its cascading messages. Returns False if session does not exist.
        """
        if not settings.is_supabase_configured:
            return False

        with httpx.Client(timeout=self._timeout) as client:
            # Check ownership first
            check_res = client.get(
                f"{self._rest_url}/chat_sessions",
                params={"id": f"eq.{session_id}", "user_id": f"eq.{user_id}", "select": "id"},
                headers=self._headers
            )
            check_res.raise_for_status()
            if not check_res.json():
                return False

            # Delete messages first (to ensure safe cleanup even if cascade constraint is absent)
            client.delete(
                f"{self._rest_url}/chat_messages",
                params={"session_id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
                headers=self._headers
            )

            # Delete session
            del_res = client.delete(
                f"{self._rest_url}/chat_sessions",
                params={"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
                headers=self._headers
            )
            del_res.raise_for_status()
            return True

chat_history_service = ChatHistoryService()
