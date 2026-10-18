"""
RecallAI LLM Client Abstraction
Provider-agnostic interface supporting Google Gemini (default) and OpenAI/Groq compatible APIs.
Enables changing LLM providers simply by switching environment variables.
"""
import json
import logging
from typing import Optional, Dict, Any, Type
from pydantic import BaseModel
from backend.app.config import settings

logger = logging.getLogger("recallai.llm_client")

class LLMConfigurationError(Exception):
    """Raised when the LLM provider is not configured or missing an API key."""
    pass

class LLMGenerationError(Exception):
    """Raised when the LLM API call fails or returns an invalid payload."""
    pass

class LLMClient:
    def __init__(self):
        self._gemini_client = None

    def _get_gemini_client(self):
        if self._gemini_client is None:
            if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
                raise LLMConfigurationError(
                    "GEMINI_API_KEY is not configured in backend/.env. Please supply a valid Gemini API key."
                )
            try:
                from google import genai
                self._gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
            except Exception as e:
                raise LLMConfigurationError(f"Failed to initialize google-genai client: {e}")
        return self._gemini_client

    def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3
    ) -> str:
        """
        Generates free-form text from the selected LLM provider.
        """
        provider = settings.LLM_PROVIDER.lower().strip()

        if provider == "gemini":
            client = self._get_gemini_client()
            import time
            from google.genai import types

            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=temperature
            )

            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = client.models.generate_content(
                        model=settings.LLM_MODEL,
                        contents=user_prompt,
                        config=config
                    )
                    if not response.text:
                        raise LLMGenerationError("Gemini returned an empty text response.")
                    return response.text.strip()
                except LLMConfigurationError:
                    raise
                except Exception as e:
                    err_msg = str(e).lower()
                    if ("429" in err_msg or "resource_exhausted" in err_msg or "503" in err_msg) and attempt < max_retries - 1:
                        sleep_s = 12 * (attempt + 1)
                        logger.warning("Gemini rate limit/busy encountered (attempt %d/%d). Sleeping %ds...", attempt + 1, max_retries, sleep_s)
                        time.sleep(sleep_s)
                    else:
                        logger.error("Gemini text generation failed: %s", e)
                        raise LLMGenerationError(f"Gemini API error: {e}")

        elif provider in ("openai", "groq"):
            import httpx
            api_key = settings.OPENAI_API_KEY if provider == "openai" else settings.GROQ_API_KEY
            base_url = "https://api.openai.com/v1" if provider == "openai" else "https://api.groq.com/openai/v1"
            if not api_key:
                raise LLMConfigurationError(f"{provider.upper()}_API_KEY is missing.")

            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": settings.LLM_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": temperature
            }
            try:
                with httpx.Client(timeout=30.0) as http_client:
                    res = http_client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
                    res.raise_for_status()
                    data = res.json()
                    return data["choices"][0]["message"]["content"].strip()
            except Exception as e:
                raise LLMGenerationError(f"{provider.upper()} API error: {e}")

        else:
            raise LLMConfigurationError(f"Unsupported LLM provider: '{provider}'")

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str
    ) -> Dict[str, Any]:
        """
        Generates structured JSON from the selected LLM provider.
        """
        provider = settings.LLM_PROVIDER.lower().strip()

        if provider == "gemini":
            client = self._get_gemini_client()
            import time
            from google.genai import types

            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                temperature=0.1
            )

            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = client.models.generate_content(
                        model=settings.LLM_MODEL,
                        contents=user_prompt,
                        config=config
                    )
                    raw_text = (response.text or "").strip()
                    if not raw_text:
                        raise LLMGenerationError("Gemini returned an empty JSON response.")
                    return json.loads(raw_text)
                except json.JSONDecodeError as jde:
                    raise LLMGenerationError(f"Malformed JSON returned by Gemini: {jde}")
                except LLMConfigurationError:
                    raise
                except Exception as e:
                    err_msg = str(e).lower()
                    if ("429" in err_msg or "resource_exhausted" in err_msg or "503" in err_msg) and attempt < max_retries - 1:
                        sleep_s = 15 * (attempt + 1)
                        logger.warning("Gemini JSON rate limit/busy encountered (attempt %d/%d). Sleeping %ds...", attempt + 1, max_retries, sleep_s)
                        time.sleep(sleep_s)
                    else:
                        logger.error("Gemini JSON generation failed: %s", e)
                        raise LLMGenerationError(f"Gemini API error: {e}")

        elif provider in ("openai", "groq"):
            raw_text = self.generate_text(
                system_prompt=system_prompt + "\nYou must output ONLY valid JSON. No markdown, no commentary.",
                user_prompt=user_prompt,
                temperature=0.1
            )
            try:
                # Strip any accidental ```json wrappers
                clean_text = raw_text.strip()
                if clean_text.startswith("```"):
                    lines = clean_text.splitlines()
                    clean_text = "\n".join(lines[1:-1])
                return json.loads(clean_text)
            except json.JSONDecodeError as jde:
                raise LLMGenerationError(f"Malformed JSON returned by {provider}: {jde}")

        else:
            raise LLMConfigurationError(f"Unsupported LLM provider: '{provider}'")

llm_client = LLMClient()
