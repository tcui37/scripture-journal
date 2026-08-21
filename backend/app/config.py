from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from the environment or a local .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_bible_key: str
    api_bible_base_url: str = "https://rest.api.bible/v1"
    cors_origins: list[str] = ["http://localhost:3000"]
    request_timeout: float = 15.0


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # api_bible_key comes from the environment
