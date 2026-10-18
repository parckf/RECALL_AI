"""
RecallAI Validated Extraction Service
Extracts explicit user memory statements using structured LLM output with Pydantic validation.
Enforces strict guardrails: questions are never facts, source_text must be exact, and corrections resolve memories.
"""
import json
import logging
import re
from typing import List, Optional, Literal, Tuple
from pydantic import BaseModel, Field, field_validator
from backend.app.services.llm_client import llm_client, LLMConfigurationError, LLMGenerationError
from backend.app.schemas import WarningItem

logger = logging.getLogger("recallai.extraction")

# Matches first-person pronouns OR personal memory cue stems
MEMORY_CUE_PATTERN = re.compile(
    r"\b(i|i'm|im|i've|ive|i'll|ill|my|mine|me|myself)\b|"
    r"\b(struggl\w*|prefer\w*|learn\w*|confus\w*|difficult\w*|hard\s+for|no\s+longer|goal\w*|want\s+to)\b",
    re.IGNORECASE
)

class ExtractedMemoryItem(BaseModel):
    kind: Literal["LEARNS", "STRUGGLES_WITH", "PREFERS", "GOAL"]
    value: str = Field(..., description="Short normalized topic or preference statement (e.g. 'recursion', 'code examples first')")
    source_text: str = Field(..., description="EXACT verbatim substring from user message supporting this extraction")
    is_correction: bool = Field(default=False, description="True if user states they NO LONGER struggle with something or resolved a gap")
    canonical_concept: Optional[str] = Field(default=None, description="Mapped Python concept ID (e.g. 'recursion', 'functions') if applicable")

    @field_validator("value")
    @classmethod
    def clean_value(cls, v: str) -> str:
        return v.strip().lower()

class ExtractionPayload(BaseModel):
    memories: List[ExtractedMemoryItem] = Field(default_factory=list)

EXTRACTION_SYSTEM_PROMPT = """You are a precise, conservative memory extraction engine for RecallAI, an educational AI tutoring system.
Your job is to extract ONLY EXPLICIT personal statements made by the user about their learning state, struggles, goals, or pedagogical preferences.

CRITICAL GUARDRAIL RULES:
1. EXPLICIT STATEMENTS ONLY: Only extract facts explicitly stated by the user about themselves.
2. QUESTIONS ARE NOT FACTS: Questions like "What is recursion?", "How do loops work?", or "Can you explain decorators?" NEVER indicate a struggle or memory. Extract NOTHING for pure questions.
3. EXACT SUBSTRING: The "source_text" field MUST be an EXACT, verbatim substring from the user's message. Do not paraphrase or alter a single character.
4. CORRECTIONS: If the user explicitly states they NO LONGER have difficulty with a topic (e.g., "I no longer struggle with recursion", "I finally understand recursion"), set "is_correction": true, "kind": "STRUGGLES_WITH", and "value": "recursion".
5. NO INFERENCES: Do not assume or hallucinate memories. If in doubt, return an empty memories list.
6. NO SENSITIVE ATTRIBUTES: Never extract personal passwords, contact info, or non-educational private data.

VALID KINDS:
- "LEARNS": Concepts the user explicitly states they are currently studying or learning.
- "STRUGGLES_WITH": Concepts where the user explicitly states difficulty, confusion, or struggle.
- "PREFERS": Explicit pedagogical preferences (e.g., "explain with visual analogies", "use code examples first").
- "GOAL": Explicit learning goals (e.g., "build a web scraper", "master algorithms").

Output valid JSON matching this schema:
{
  "memories": [
    {
      "kind": "STRUGGLES_WITH" | "LEARNS" | "PREFERS" | "GOAL",
      "value": "normalized concept or preference",
      "source_text": "exact excerpt from user message",
      "is_correction": false | true,
      "canonical_concept": "recursion" (or null)
    }
  ]
}
If no explicit memories exist, return {"memories": []}.
"""

class ExtractionService:
    def __init__(self):
        self._llm = llm_client

    def extract_memories(
        self,
        user_message: str
    ) -> Tuple[List[ExtractedMemoryItem], List[WarningItem]]:
        """
        Extracts validated memories from user message with at most ONE repair attempt.
        Returns a tuple of (extracted_memories, warnings).
        """
        user_msg_clean = user_message.strip()
        if not user_msg_clean:
            return [], []

        # Optimization & Guardrail: A personal learner memory (LEARNS, STRUGGLES_WITH, PREFERS, GOAL)
        # requires either a first-person statement ("I", "my", "me") OR a pedagogical cue word
        # (e.g. "struggling", "prefer", "confused", "difficult", "no longer").
        # If none of these cues exist (e.g. "Explain recursive functions"), skip extraction immediately.
        if not MEMORY_CUE_PATTERN.search(user_msg_clean):
            logger.debug("Fast path: User message contains no personal cues or pronouns. Skipping memory extraction.")
            return [], []

        warnings: List[WarningItem] = []

        # Fast path check for pure questions even if containing personal pronouns (e.g. "What should I do?")
        lower_msg = user_msg_clean.lower()
        if (lower_msg.startswith(("what is", "what are", "how does", "how do", "why is", "why does", "explain to me what"))
            and "?" in lower_msg
            and not any(k in lower_msg for k in ["i struggle", "i find", "i prefer", "i am learning", "my goal", "i no longer"])):
            logger.debug("Fast path: User message is a pure informational question. Skipping memory extraction.")
            return [], []

        user_prompt = f"User Message:\n\"\"\"{user_msg_clean}\"\"\""

        raw_json = None
        # Primary Extraction Attempt
        try:
            raw_json = self._llm.generate_json(
                system_prompt=EXTRACTION_SYSTEM_PROMPT,
                user_prompt=user_prompt
            )
        except LLMConfigurationError as e:
            logger.warning("Extraction skipped: LLM not configured (%s)", e)
            warnings.append(WarningItem(stage="extraction", message="LLM credentials not configured; memory extraction skipped."))
            return [], warnings
        except Exception as e:
            logger.warning("Extraction attempt failed: %s. Attempting repair...", e)
            # Exactly one repair attempt
            try:
                repair_prompt = (
                    f"Your previous JSON response was invalid or caused an error: {e}.\n"
                    f"Please re-analyze the user message and return strictly valid JSON matching the schema.\n"
                    f"User Message:\n\"\"\"{user_msg_clean}\"\"\""
                )
                raw_json = self._llm.generate_json(
                    system_prompt=EXTRACTION_SYSTEM_PROMPT,
                    user_prompt=repair_prompt
                )
            except Exception as repair_err:
                logger.error("Extraction repair attempt also failed: %s", repair_err)
                warnings.append(WarningItem(stage="extraction", message=f"Memory extraction failed after repair: {repair_err}"))
                return [], warnings

        # Validate with Pydantic
        if not raw_json:
            return [], warnings

        try:
            parsed = ExtractionPayload.model_validate(raw_json)
        except Exception as val_err:
            logger.warning("Pydantic validation failed for extraction: %s", val_err)
            warnings.append(WarningItem(stage="extraction", message=f"Extracted payload failed schema validation: {val_err}"))
            return [], warnings

        # Post-validation checks: exact source_text rule
        valid_memories: List[ExtractedMemoryItem] = []
        for mem in parsed.memories:
            target = mem.source_text.strip().strip('"\'')
            if not target:
                continue

            # 1. Exact match
            if target in user_msg_clean:
                mem.source_text = target
            elif target.lower() in user_msg_clean.lower():
                # Case variation: match exact case from user message
                start_idx = user_msg_clean.lower().find(target.lower())
                mem.source_text = user_msg_clean[start_idx : start_idx + len(target)]
            else:
                # Whitespace / formatting variation: match words with flexible whitespace
                words = target.split()
                if words:
                    import re
                    pattern = r"\s+".join(re.escape(w) for w in words)
                    match = re.search(pattern, user_msg_clean, re.IGNORECASE)
                    if match:
                        mem.source_text = match.group(0)
                    else:
                        logger.warning("Rejected memory: source_text '%s' not found verbatim in user message.", mem.source_text)
                        warnings.append(WarningItem(stage="extraction", message=f"Rejected extraction: source_text '{mem.source_text}' was not in user message."))
                        continue
                else:
                    continue

            # Check 2: verify question guardrail (do not extract struggles from pure questions)
            if "?" in mem.source_text and not any(p in mem.source_text.lower() for p in ["i ", "my ", "me ", "i'm"]):
                logger.warning("Rejected memory from question fragment: '%s'", mem.source_text)
                continue

            valid_memories.append(mem)

        return valid_memories, warnings

extraction_service = ExtractionService()
