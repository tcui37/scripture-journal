from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .bible import BibleClient
from .config import get_settings
from .routers import bible


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.bible_client = BibleClient(
        base_url=settings.api_bible_base_url,
        api_key=settings.api_bible_key,
        timeout=settings.request_timeout,
    )
    yield
    await app.state.bible_client.aclose()


app = FastAPI(
    title="Scripture Journal API",
    description="Serves Bible passages from api.bible for the Scripture Journal frontend.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(bible.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
