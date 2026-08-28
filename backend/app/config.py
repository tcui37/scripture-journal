import logging
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

#: Directory that holds `.env` — not the process cwd, which Vercel and tests
#: may set elsewhere. On Vercel the file is not uploaded; dashboard env wins.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent

logger = logging.getLogger(__name__)

#: Vercel production and preview are reachable by others. `vercel dev` sets
#: VERCEL_ENV=development and is treated as local (SINGLE_USER may be true).
_VERCEL_SHARED_ENVS = frozenset({"production", "preview"})


class Settings(BaseSettings):
    """Application settings, read from the environment or a local .env file."""

    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    #: api.bible key. Without it, only the keyless sources are offered.
    api_bible_key: str = ""
    api_bible_base_url: str = "https://rest.api.bible/v1"

    #: Crossway key, from https://api.esv.org/. Without it the ESV is hidden.
    esv_api_key: str = ""

    cors_origins: list[str] = ["http://localhost:3000"]
    request_timeout: float = 20.0

    #: Backend-only. The browser never talks to Supabase.
    supabase_url: str = ""
    supabase_anon_key: str = ""

    #: True when this instance serves only the person running it.
    #:
    #: api.bible's §12 DRM clause obliges a developer to build printing limits
    #: into "products" so that "end users" cannot copy or distribute licensed
    #: text. With no end users but the licensee, that obligation has no
    #: subject, so the 100-verse print cap is lifted. Crossway's cap is *not*
    #: lifted by this: it restricts the licensee's own display and storage and
    #: names no end user. Leave this false for anything reachable by others.
    #:
    #: Default is false. Local `.env` may set SINGLE_USER=true. Vercel
    #: production and preview always force false via get_settings().
    single_user: bool = False


def _on_vercel_shared_deploy() -> bool:
    return os.environ.get("VERCEL_ENV", "").strip().lower() in _VERCEL_SHARED_ENVS


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if _on_vercel_shared_deploy():
        if settings.single_user:
            logger.warning(
                "SINGLE_USER=true is ignored on Vercel production/preview; "
                "printing caps stay in force."
            )
        return settings.model_copy(update={"single_user": False})
    return settings
