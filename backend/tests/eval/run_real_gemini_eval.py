"""
Real Gemini LLM Extraction Evaluation Script
Runs real model calls against the 5 hackathon test scenarios.
Reports raw outputs, validation results, and exact substring checks honestly.
NEVER prints or logs API keys.
"""
import sys
import json
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.app.config import settings
from backend.app.services.extraction import extraction_service, EXTRACTION_SYSTEM_PROMPT
from backend.app.services.llm_client import llm_client, LLMConfigurationError

TEST_MESSAGES = [
    ("(a)", "I'm learning Python, struggle with recursion, and prefer small examples."),
    ("(b)", "What is recursion?"),
    ("(c)", "I struggle with recursion, can you explain it?"),
    ("(d)", "I no longer struggle with recursion, but generators confuse me."),
    ("(e)", "Explain recursive functions.")
]

def run_evaluation():
    print("=" * 70)
    print("RECALLAI — REAL GEMINI EXTRACTION EVALUATION")
    print("=" * 70)
    print(f"Provider: {settings.LLM_PROVIDER}")
    print(f"Model:    {settings.LLM_MODEL}")
    print("API Key configured:", settings.is_llm_configured)
    print("-" * 70)

    if not settings.is_llm_configured:
        print("\n[BLOCKED] GEMINI_API_KEY is not set in backend/.env.")
        print("Please paste your Gemini API key into backend/.env next to GEMINI_API_KEY= and re-run.")
        return False

    import time

    all_passed = True

    for label, message in TEST_MESSAGES:
        print(f"\n--- Scenario {label} ---")
        print(f"Input Message: \"{message}\"")

        # Call extraction service (which calls Gemini and validates with Pydantic)
        memories, warnings = extraction_service.extract_memories(message)

        print(f"Validated Memories Count: {len(memories)}")
        for idx, mem in enumerate(memories, 1):
            print(f"  [{idx}] kind={mem.kind}, value='{mem.value}', is_correction={mem.is_correction}")
            print(f"      source_text='{mem.source_text}' (in user message: {mem.source_text in message})")

        if warnings:
            print(f"Warnings ({len(warnings)}):")
            for w in warnings:
                print(f"  - [{w.stage}]: {w.message}")

        # Pacing to respect Free Tier 5 RPM rate limit
        time.sleep(13)

        # Scenario-specific expectations check
        status = "PASS"
        reason = ""
        if label == "(a)":
            # Expect multiple memories (learns, struggles_with, prefers)
            has_struggle = any(m.kind == "STRUGGLES_WITH" for m in memories)
            has_learns = any(m.kind == "LEARNS" for m in memories)
            has_prefers = any(m.kind == "PREFERS" for m in memories)
            if not has_struggle:
                status = "FAIL"
                reason = "Expected STRUGGLES_WITH for recursion."
        elif label == "(b)":
            # Pure question -> Must extract ZERO memories
            if len(memories) > 0:
                status = "FAIL"
                reason = f"Pure question incorrectly extracted {len(memories)} memories."
        elif label == "(c)":
            # Mixed fact + question -> Must extract struggle with recursion, ignore question
            has_struggle = any(m.kind == "STRUGGLES_WITH" and m.value == "recursion" for m in memories)
            if not has_struggle:
                status = "FAIL"
                reason = "Expected STRUGGLES_WITH for recursion in mixed question."
        elif label == "(d)":
            # Correction for recursion + struggle with generators
            has_correction = any(m.is_correction and m.value == "recursion" for m in memories)
            has_generators = any(m.kind == "STRUGGLES_WITH" and "generator" in m.value for m in memories)
            if not has_correction:
                status = "FAIL"
                reason = "Expected is_correction=True for recursion."
            elif not has_generators:
                status = "FAIL"
                reason = "Expected STRUGGLES_WITH for generators."
        elif label == "(e)":
            # Pure informational prompt -> Must extract ZERO memories
            if len(memories) > 0:
                status = "FAIL"
                reason = f"Command 'Explain recursive functions' incorrectly extracted {len(memories)} memories."

        print(f"Result: [{status}] {reason}")
        if status != "PASS":
            all_passed = False

    print("\n" + "=" * 70)
    print("EVALUATION RUN COMPLETE")
    print("=" * 70)
    return all_passed

if __name__ == "__main__":
    run_evaluation()
