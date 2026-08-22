"""Vercel entry point.

Vercel's Python runtime serves the ASGI app exported from a file under `api/`.
`vercel.json` rewrites every path here, so FastAPI still sees the original URL
and its own `/api/...` routes match unchanged.
"""

import sys
from pathlib import Path

# The project root holds the `app` package; make sure it is importable whatever
# working directory the runtime starts in.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402

__all__ = ["app"]
