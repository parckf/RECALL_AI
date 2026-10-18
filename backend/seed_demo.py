"""Idempotently add synthetic demo memories to a FalkorDB student graph.

Run from the repository root after FalkorDB is available and environment files
are configured: ``python -m backend.seed_demo``.
"""

import argparse

from backend.app.database import db_manager
from backend.app.services.memory_store import memory_store


DEMO_MEMORIES = (
    {
        "kind": "STRUGGLES_WITH",
        "value": "recursion",
        "source_text": "I struggle with recursion in Python.",
        "concept_id": "recursion",
    },
    {
        "kind": "PREFERS",
        "value": "small examples",
        "source_text": "I prefer small examples when learning.",
        "concept_id": None,
    },
)


def seed_demo(user_id: str = "student_alice") -> list[str]:
    """Seed curriculum plus stable synthetic memories; safe to run repeatedly."""
    # Validate the user ID and ensure graph creation/seeding uses the same
    # reviewed FalkorDB client/service path as the application.
    db_manager.get_user_graph_name(user_id)
    created = []
    for memory in DEMO_MEMORIES:
        result = memory_store.save_memory(
            user_id=user_id,
            session_id="demo_seed",
            **memory,
        )
        created.append(result.action or "already_known")
    return created


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a synthetic RecallAI demo graph.")
    parser.add_argument("--user-id", default="student_alice", help="Demo user graph (default: student_alice)")
    args = parser.parse_args()
    actions = seed_demo(args.user_id)
    print(f"Demo graph ready for {args.user_id}: {len(actions)} sample memories ({', '.join(actions)}).")


if __name__ == "__main__":
    main()
