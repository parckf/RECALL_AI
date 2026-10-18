"""
RecallAI Configuration Module
Reads configuration from environment variables or backend/.env file.
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # FalkorDB Graph Database Configuration
    FALKORDB_HOST: str = "127.0.0.1"
    FALKORDB_PORT: int = 6379
    FALKORDB_PASSWORD: str = Field(..., description="FalkorDB authentication password")

    # LLM Provider Configuration
    LLM_PROVIDER: str = "gemini"
    LLM_MODEL: str = "gemini-3.8-flash"
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    # CORS Configuration: Comma-separated list of allowed origins
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"

    # Optional Supabase Audit Trail (Disabled by default, write-only, Phase 7 only)
    SUPABASE_LOG_ENABLED: bool = False
    SUPABASE_URL: str = ""
    SUPABASE_SECRET_KEY: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_llm_configured(self) -> bool:
        provider = self.LLM_PROVIDER.lower().strip()
        if provider == "gemini":
            return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip() and self.GEMINI_API_KEY != "your_gemini_api_key_here")
        elif provider == "openai":
            return bool(self.OPENAI_API_KEY and self.OPENAI_API_KEY.strip())
        elif provider == "groq":
            return bool(self.GROQ_API_KEY and self.GROQ_API_KEY.strip())
        return False

    @property
    def is_supabase_configured(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_URL.strip() and self.SUPABASE_SECRET_KEY and self.SUPABASE_SECRET_KEY.strip())

settings = Settings()
