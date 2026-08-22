from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from the environment or a local .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
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

    #: True when this instance serves only the person running it.
    #:
    #: api.bible's §12 DRM clause obliges a developer to build printing limits
    #: into "products" so that "end users" cannot copy or distribute licensed
    #: text. With no end users but the licensee, that obligation has no
    #: subject, so the 100-verse print cap is lifted. Crossway's cap is *not*
    #: lifted by this: it restricts the licensee's own display and storage and
    #: names no end user. Leave this false for anything reachable by others.
    single_user: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
