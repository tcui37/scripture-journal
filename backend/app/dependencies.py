from typing import Annotated

from fastapi import Depends, Request

from .bible import BibleClient


def get_bible_client(request: Request) -> BibleClient:
    """The client created once for the app's lifetime, see `main.lifespan`."""
    return request.app.state.bible_client


BibleClientDep = Annotated[BibleClient, Depends(get_bible_client)]
