"""
RecallAI FalkorDB Database Connection Manager
Handles client lifecycle, user-graph isolation, and parameterized execution.
"""
import re
import logging
from typing import Dict, Any, Optional
from falkordb import FalkorDB, Graph
from backend.app.config import settings

logger = logging.getLogger("recallai.database")

USER_ID_REGEX = re.compile(r"^[a-z0-9_-]{3,40}$")

READ_TIMEOUT_MS = 5000
WRITE_TIMEOUT_MS = 10000

class DatabaseManager:
    def __init__(self):
        self._client: Optional[FalkorDB] = None

    def get_client(self) -> FalkorDB:
        if self._client is None:
            logger.info("Initializing FalkorDB client: host=%s, port=%s", settings.FALKORDB_HOST, settings.FALKORDB_PORT)
            self._client = FalkorDB(
                host=settings.FALKORDB_HOST,
                port=settings.FALKORDB_PORT,
                password=settings.FALKORDB_PASSWORD
            )
        return self._client

    def check_health(self) -> bool:
        """
        Runs a lightweight health check against the FalkorDB server.
        Returns True if connected and responsive, False otherwise.
        """
        try:
            client = self.get_client()
            # Redis ping check
            client.connection.ping()
            return True
        except Exception as e:
            logger.warning("FalkorDB health check failed: %s", e)
            return False

    def get_user_graph_name(self, user_id: str) -> str:
        """
        Validates user_id and generates the isolated per-user graph name.
        """
        user_id = user_id.strip()
        if not USER_ID_REGEX.match(user_id):
            raise ValueError(f"Invalid user_id format: '{user_id}'. Must match ^[a-z0-9_-]{{3,40}}$")
        return f"recallai_{user_id}"

    def get_user_graph(self, user_id: str) -> Graph:
        """
        Selects the isolated FalkorDB graph for the given user.
        """
        graph_name = self.get_user_graph_name(user_id)
        client = self.get_client()
        return client.select_graph(graph_name)

db_manager = DatabaseManager()
