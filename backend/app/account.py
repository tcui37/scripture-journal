"""Session cookies and the authenticated-user dependency."""

from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, Response, status
from supabase_auth.errors import AuthApiError

from .persistence.client import create_anon_client

ACCESS_COOKIE = "sj_access_token"
REFRESH_COOKIE = "sj_refresh_token"
REFRESH_MAX_AGE = 60 * 24 * 60 * 60
_ACCESS_MAX_AGE_FALLBACK = 3600


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str
    access_token: str = ""


def set_session_cookies(response: Response, session: Any) -> None:
    """Write access and refresh tokens as httpOnly cookies."""
    access_max_age = getattr(session, "expires_in", None) or _ACCESS_MAX_AGE_FALLBACK
    response.set_cookie(
        ACCESS_COOKIE,
        session.access_token,
        max_age=int(access_max_age),
        path="/",
        secure=False,
        httponly=True,
        samesite="lax",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        session.refresh_token,
        max_age=REFRESH_MAX_AGE,
        path="/",
        secure=False,
        httponly=True,
        samesite="lax",
    )


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(
        ACCESS_COOKIE, path="/", secure=False, httponly=True, samesite="lax"
    )
    response.delete_cookie(
        REFRESH_COOKIE, path="/", secure=False, httponly=True, samesite="lax"
    )


def _auth_user(user: Any, access_token: str) -> AuthUser:
    return AuthUser(id=str(user.id), email=user.email or "", access_token=access_token)


def _user_from_access(client: Any, token: str) -> AuthUser | None:
    try:
        result = client.auth.get_user(token)
    except AuthApiError:
        return None
    user = getattr(result, "user", None) if result is not None else None
    if user is None:
        return None
    return _auth_user(user, token)


def _session_from_refresh(client: Any, refresh_token: str) -> Any | None:
    try:
        result = client.auth.refresh_session(refresh_token)
    except AuthApiError:
        return None
    return getattr(result, "session", None)


def get_current_user(request: Request, response: Response) -> AuthUser:
    """Resolve the caller from cookies; refresh the access token when needed."""
    access = request.cookies.get(ACCESS_COOKIE)
    refresh = request.cookies.get(REFRESH_COOKIE)
    if not access and not refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")

    client = create_anon_client()
    if access:
        user = _user_from_access(client, access)
        if user is not None:
            return user

    if refresh:
        session = _session_from_refresh(client, refresh)
        if session is not None and session.user is not None:
            set_session_cookies(response, session)
            return _auth_user(session.user, session.access_token)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")


AuthUserDep = Annotated[AuthUser, Depends(get_current_user)]
