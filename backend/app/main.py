from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .catalog import Catalog
from .clients import Clients
from .config import get_settings
from .routers import bible


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    clients = Clients.build(settings)

    app.state.clients = clients
    app.state.catalog = Catalog(settings, clients.helloao, clients.api_bible)

    try:
        yield
    finally:
        # Closed in a finally so a failure during startup or serving still
        # releases the connection pools.
        await clients.aclose()


app = FastAPI(
    title="Scripture Journal API",
    description="Serves Bible passages from several sources for the Scripture Journal frontend.",
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
