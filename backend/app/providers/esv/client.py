"""HTTP client for Crossway's ESV API."""

from typing import Any

import httpx
from fastapi import HTTPException, status

ESV_BASE_URL = "https://api.esv.org/v3"

# Query parameters chosen so the HTML carries exactly the structure we render:
# headings, verse numbers, poetry and red letter in; Crossway's own chrome out.
PASSAGE_PARAMS: dict[str, str] = {
    "include-passage-references": "false",
    "include-verse-numbers": "true",
    "include-first-verse-numbers": "true",
    "include-footnotes": "false",
    "include-footnote-body": "false",
    "include-headings": "true",
    "include-subheadings": "true",
    "include-short-copyright": "false",
    "include-copyright": "false",
    "include-audio-link": "false",
    "include-chapter-numbers": "false",
    "include-css-link": "false",
    "inline-styles": "false",
    "wrapping-div": "false",
    "include-book-titles": "false",
    "include-verse-anchors": "false",
    "include-crossrefs": "false",
    "include-surrounding-chapters": "false",
}


class EsvClient:
    def __init__(self, *, api_key: str, timeout: float) -> None:
        self._client = httpx.AsyncClient(
            base_url=ESV_BASE_URL,
            headers={"Authorization": f"Token {api_key}"},
            timeout=timeout,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def passage_html(self, query: str) -> str:
        """HTML for one passage query, e.g. "John 3"."""
        params: dict[str, Any] = {**PASSAGE_PARAMS, "q": query}

        try:
            response = await self._client.get("/passage/html/", params=params)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=f"Could not reach the ESV API: {exc}",
            ) from exc

        if response.status_code in (401, 403):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The ESV API rejected the key. Check ESV_API_KEY.",
            )
        if response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="ESV API rate limit reached. Crossway allows 60 requests "
                "a minute, 1,000 an hour and 5,000 a day.",
            )
        if response.is_error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"The ESV API returned HTTP {response.status_code}.",
            )

        return "".join(response.json().get("passages") or [])
