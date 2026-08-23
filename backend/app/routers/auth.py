"""Sign up, sign in, password change, and session cookies."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from supabase_auth.errors import AuthApiError

from ..account import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    AuthUserDep,
    clear_session_cookies,
    set_session_cookies,
)
from ..account_schemas import (
    AuthUserOut,
    AuthUserResponse,
    ChangePassword,
    Credentials,
    SigninResponse,
    SignupResponse,
)
from ..persistence.client import AnonClientDep, create_anon_client

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _public_user(user: Any) -> AuthUserOut:
    return AuthUserOut(id=str(user.id), email=user.email or "")


def _signup_error(exc: AuthApiError) -> HTTPException:
    code = getattr(exc, "code", None)
    if code == "email_address_invalid":
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid email address.",
        )
    if code == "over_email_send_rate_limit":
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many confirmation emails. Try again in a few minutes.",
        )
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Could not sign up.",
    )


@router.post("/signup")
def sign_up(body: Credentials, response: Response, client: AnonClientDep) -> SignupResponse:
    try:
        result = client.auth.sign_up({"email": body.email, "password": body.password})
    except AuthApiError as exc:
        raise _signup_error(exc) from exc

    user = result.user
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not sign up.",
        )

    session = result.session
    if session is not None:
        set_session_cookies(response, session)
    return SignupResponse(
        user=_public_user(user),
        needs_confirmation=session is None,
    )


@router.post("/signin")
def sign_in(body: Credentials, response: Response, client: AnonClientDep) -> SigninResponse:
    try:
        result = client.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except AuthApiError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from exc

    user = result.user
    session = result.session
    if user is None or session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    set_session_cookies(response, session)
    return SigninResponse(user=_public_user(user), needs_confirmation=False)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePassword, user: AuthUserDep, client: AnonClientDep
) -> None:
    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different.",
        )

    try:
        result = client.auth.sign_in_with_password(
            {"email": user.email, "password": body.current_password}
        )
    except AuthApiError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        ) from exc

    session = result.session
    authed = result.user
    if authed is None or session is None or str(authed.id) != user.id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    client.auth.set_session(session.access_token, session.refresh_token)
    try:
        client.auth.update_user({"password": body.new_password})
    except AuthApiError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not update password.",
        ) from exc


@router.post("/signout", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(request: Request, response: Response) -> None:
    access = request.cookies.get(ACCESS_COOKIE)
    refresh = request.cookies.get(REFRESH_COOKIE)
    if access:
        try:
            scoped = create_anon_client()
            if refresh:
                scoped.auth.set_session(access, refresh)
            scoped.auth.sign_out()
        except Exception:
            pass
    clear_session_cookies(response)


@router.get("/me")
def me(user: AuthUserDep) -> AuthUserResponse:
    return AuthUserResponse(user=AuthUserOut(id=user.id, email=user.email))
