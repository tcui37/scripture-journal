from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .catalog import Catalog
from .clients import Clients
from .config import get_settings
from .routers import auth, bible, designs, files


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
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(bible.router)
app.include_router(auth.router)
app.include_router(designs.router)
app.include_router(files.router)


# `/api/health` is what the frontend warmup pings: Next only rewrites
# `/api/:path*` to the FastAPI origin. `/health` is the same check for
# local probes and for hitting the API origin directly (Vercel rewrites
# every path on that project into this app).
@app.get("/health")
@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
