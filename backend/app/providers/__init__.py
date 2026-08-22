"""Provider registry: resolves a translation id to something that can fetch it."""

from .api_bible import ApiBibleClient, ApiBibleProvider
from .base import PassageProvider
from .bible_api import BibleApiClient, BibleApiProvider
from .esv import EsvClient, EsvProvider
from .helloao import HelloAoClient, HelloAoProvider

__all__ = [
    "ApiBibleClient",
    "ApiBibleProvider",
    "BibleApiClient",
    "BibleApiProvider",
    "EsvClient",
    "EsvProvider",
    "HelloAoClient",
    "HelloAoProvider",
    "PassageProvider",
]
