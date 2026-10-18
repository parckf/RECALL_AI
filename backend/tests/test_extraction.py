"""
Tests for Validated Memory Extraction, Guardrails, and Repair Logic.
Uses mocked LLM responses to test deterministic rule enforcement.
"""
import pytest
from unittest.mock import MagicMock
from backend.app.services.extraction import ExtractionService, ExtractedMemoryItem
from backend.app.services.llm_client import LLMGenerationError

def test_questions_are_not_facts_fast_path():
    """
    Questions like 'What is recursion?' must NEVER produce extracted memory.
    """
    service = ExtractionService()
    memories, warnings = service.extract_memories("What is recursion?")
    assert len(memories) == 0
    assert len(warnings) == 0

def test_questions_with_how_and_why_skipped():
    """
    Informational questions starting with How/Why/Can you explain are skipped.
    """
    service = ExtractionService()
    memories, warnings = service.extract_memories("How do generators work in Python?")
    assert len(memories) == 0

def test_no_first_person_statements_skips_llm_call():
    """
    Messages with no personal pronouns and no cue words (e.g. commands, general questions)
    must immediately skip extraction without invoking LLM generate_json.
    """
    service = ExtractionService()
    service._llm = MagicMock()

    memories, warnings = service.extract_memories("Explain recursive functions.")
    assert len(memories) == 0
    assert len(warnings) == 0
    # LLM must NEVER be called
    service._llm.generate_json.assert_not_called()

def test_cue_words_without_pronouns_reach_extraction():
    """
    Messages containing personal cue words (prefer, struggling) even without explicit pronouns
    MUST reach extraction, while commands without cue words MUST NOT.
    """
    service = ExtractionService()
    service._llm = MagicMock()

    # 1. "Prefer small examples." contains cue word "prefer" -> MUST reach extraction
    service._llm.generate_json.return_value = {
        "memories": [
            {
                "kind": "PREFERS",
                "value": "small examples",
                "source_text": "Prefer small examples",
                "is_correction": False
            }
        ]
    }
    mems, _ = service.extract_memories("Prefer small examples.")
    assert len(mems) == 1
    assert mems[0].kind == "PREFERS"
    assert service._llm.generate_json.call_count == 1

    # 2. "Struggling with recursion." contains cue word "struggl" -> MUST reach extraction
    service._llm.generate_json.reset_mock()
    service._llm.generate_json.return_value = {
        "memories": [
            {
                "kind": "STRUGGLES_WITH",
                "value": "recursion",
                "source_text": "Struggling with recursion",
                "is_correction": False
            }
        ]
    }
    mems, _ = service.extract_memories("Struggling with recursion.")
    assert len(mems) == 1
    assert mems[0].kind == "STRUGGLES_WITH"
    assert service._llm.generate_json.call_count == 1

    # 3. "Explain recursive functions." has neither pronouns nor cue words -> MUST NOT reach extraction
    service._llm.generate_json.reset_mock()
    mems, _ = service.extract_memories("Explain recursive functions.")
    assert len(mems) == 0
    service._llm.generate_json.assert_not_called()

def test_explicit_struggle_extraction():
    """
    Explicit user statement of struggle is extracted and validated.
    """
    service = ExtractionService()
    # Mock LLM response
    service._llm = MagicMock()
    service._llm.generate_json.return_value = {
        "memories": [
            {
                "kind": "STRUGGLES_WITH",
                "value": "recursion",
                "source_text": "I find recursion really tricky",
                "is_correction": False,
                "canonical_concept": "recursion"
            }
        ]
    }

    user_msg = "I find recursion really tricky, but I want to learn it."
    memories, warnings = service.extract_memories(user_msg)
    
    assert len(memories) == 1
    assert memories[0].kind == "STRUGGLES_WITH"
    assert memories[0].value == "recursion"
    assert memories[0].source_text == "I find recursion really tricky"
    assert memories[0].is_correction is False
    assert len(warnings) == 0

def test_correction_statement_flagged():
    """
    'I no longer struggle with X' must be extracted with is_correction = True.
    """
    service = ExtractionService()
    service._llm = MagicMock()
    service._llm.generate_json.return_value = {
        "memories": [
            {
                "kind": "STRUGGLES_WITH",
                "value": "recursion",
                "source_text": "I no longer struggle with recursion",
                "is_correction": True,
                "canonical_concept": "recursion"
            }
        ]
    }

    user_msg = "Great news! I no longer struggle with recursion after today's lesson."
    memories, warnings = service.extract_memories(user_msg)

    assert len(memories) == 1
    assert memories[0].is_correction is True
    assert memories[0].value == "recursion"

def test_exact_source_text_rejection():
    """
    If the LLM hallucinates a source_text not found in the user message, it is rejected.
    """
    service = ExtractionService()
    service._llm = MagicMock()
    service._llm.generate_json.return_value = {
        "memories": [
            {
                "kind": "STRUGGLES_WITH",
                "value": "recursion",
                "source_text": "This hallucinated text never appeared in the message",
                "is_correction": False
            }
        ]
    }

    user_msg = "I am practicing Python exercises."
    memories, warnings = service.extract_memories(user_msg)

    # Must reject the fabricated source_text
    assert len(memories) == 0
    assert len(warnings) == 1
    assert warnings[0].stage == "extraction"

def test_repair_attempt_on_initial_failure():
    """
    If the first attempt fails, exactly one repair attempt is made.
    """
    service = ExtractionService()
    service._llm = MagicMock()
    
    # First attempt raises error; second attempt succeeds
    service._llm.generate_json.side_effect = [
        LLMGenerationError("Invalid JSON format"),
        {
            "memories": [
                {
                    "kind": "PREFERS",
                    "value": "visual analogies",
                    "source_text": "I prefer visual analogies",
                    "is_correction": False
                }
            ]
        }
    ]

    user_msg = "Please teach me! I prefer visual analogies when learning."
    memories, warnings = service.extract_memories(user_msg)

    assert service._llm.generate_json.call_count == 2
    assert len(memories) == 1
    assert memories[0].kind == "PREFERS"
    assert memories[0].value == "visual analogies"

def test_failed_repair_returns_warning_without_crashing():
    """
    If both the initial extraction and the repair attempt fail, return empty memories and a warning.
    """
    service = ExtractionService()
    service._llm = MagicMock()
    service._llm.generate_json.side_effect = [
        LLMGenerationError("First error"),
        LLMGenerationError("Repair error")
    ]

    user_msg = "I find decorators hard."
    memories, warnings = service.extract_memories(user_msg)

    assert len(memories) == 0
    assert len(warnings) == 1
    assert warnings[0].stage == "extraction"

def test_mixed_fact_and_question_saves_fact():
    """
    Test that a mixed message (fact + question) still successfully extracts and saves the fact.
    Example: 'I struggle with recursion, can you explain it to me?'
    """
    service = ExtractionService()
    service._llm = MagicMock()
    service._llm.generate_json.return_value = {
        "memories": [
            {
                "kind": "STRUGGLES_WITH",
                "value": "recursion",
                "source_text": "I struggle with recursion",
                "is_correction": False,
                "canonical_concept": "recursion"
            }
        ]
    }

    user_msg = "I struggle with recursion, can you explain it to me?"
    memories, warnings = service.extract_memories(user_msg)

    assert len(memories) == 1
    assert memories[0].kind == "STRUGGLES_WITH"
    assert memories[0].value == "recursion"
    assert memories[0].source_text == "I struggle with recursion"
    assert len(warnings) == 0

def test_exact_source_text_accepts_casing_variations():
    """
    Test that casing variations in LLM response are mapped back to the user's verbatim text.
    """
    service = ExtractionService()
    service._llm = MagicMock()
    service._llm.generate_json.return_value = {
        "memories": [
            {
                "kind": "STRUGGLES_WITH",
                "value": "recursion",
                "source_text": "i struggle with recursion",  # lowercased by LLM
                "is_correction": False
            }
        ]
    }

    user_msg = "I Struggle With Recursion deeply."
    memories, warnings = service.extract_memories(user_msg)

    assert len(memories) == 1
    # Successfully normalized to the user's verbatim casing
    assert memories[0].source_text == "I Struggle With Recursion"

def test_exact_source_text_accepts_whitespace_variations():
    """
    Test that whitespace variations (newlines, multiple spaces) are mapped back to verbatim text.
    """
    service = ExtractionService()
    service._llm = MagicMock()
    service._llm.generate_json.return_value = {
        "memories": [
            {
                "kind": "PREFERS",
                "value": "visual examples",
                "source_text": "I prefer visual examples",  # single space
                "is_correction": False
            }
        ]
    }

    user_msg = "When learning Python, I   prefer   visual\nexamples always."
    memories, warnings = service.extract_memories(user_msg)

    assert len(memories) == 1
    assert memories[0].source_text == "I   prefer   visual\nexamples"
