"""Auth routes: validation and cookie behaviour.

The app is built without a lifespan. A fake auth client stands in for
Supabase, so no HTTP client is constructed and the network is never used.
"""

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

from app.account import ACCESS_COOKIE, REFRESH_COOKIE, AuthUser, get_current_user
from app.persistence.client import get_anon_client
from app.routers import auth

USER = SimpleNamespace(id="user-1", email="ada@example.com")


class FakeSession:
    access_token = "access-token"
    refresh_token = "refresh-token"
    expires_in = 1200
    user = USER


class FakeAuth:
    def __init__(self) -> None:
        self.sign_up_calls: list[dict[str, str]] = []
        self.sign_in_calls: list[dict[str, str]] = []
        self.update_user_calls: list[dict[str, str]] = []
        self.set_session_calls: list[tuple[str, str]] = []
        self.session_on_signup: FakeSession | None = FakeSession()
        self.current_password = "secret"

    def sign_up(self, credentials: dict[str, str]) -> SimpleNamespace:
        self.sign_up_calls.append(credentials)
        email = credentials["email"]
        if email.endswith("@invalid.test"):
            raise AuthApiError("Email address is invalid", 400, "email_address_invalid")
        if email.endswith("@ratelimited.test"):
            raise AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit")
        return SimpleNamespace(user=USER, session=self.session_on_signup)

    def sign_in_with_password(self, credentials: dict[str, str]) -> SimpleNamespace:
        self.sign_in_calls.append(credentials)
        if credentials["password"] != self.current_password:
            raise AuthApiError("Invalid login credentials", 400, "invalid_credentials")
        return SimpleNamespace(user=USER, session=FakeSession())

    def update_user(self, attributes: dict[str, str]) -> SimpleNamespace:
        self.update_user_calls.append(attributes)
        if attributes.get("password") == "weak":
            raise AuthApiError("Password is too weak", 422, "weak_password")
        if "password" in attributes:
            self.current_password = attributes["password"]
        return SimpleNamespace(user=USER)

    def get_user(self, jwt: str) -> SimpleNamespace:
        raise AssertionError("get_user should be overridden via get_current_user")

    def refresh_session(self, refresh_token: str | None = None) -> SimpleNamespace:
        raise AssertionError("refresh_session should not run in these tests")

    def set_session(self, access_token: str, refresh_token: str) -> None:
        self.set_session_calls.append((access_token, refresh_token))

    def sign_out(self) -> None:
        return None


class FakeClient:
    def __init__(self, auth_api: FakeAuth) -> None:
        self.auth = auth_api


def _client(fake_auth: FakeAuth | None = None) -> tuple[TestClient, FakeAuth]:
    fake_auth = fake_auth or FakeAuth()
    app = FastAPI()
    app.include_router(auth.router)
    app.dependency_overrides[get_anon_client] = lambda: FakeClient(fake_auth)
    return TestClient(app), fake_auth


def test_signup_requires_email_and_password():
    client, fake_auth = _client()
    response = client.post("/api/auth/signup", json={})
    assert response.status_code == 422
    assert fake_auth.sign_up_calls == []


def test_signup_rejects_invalid_email_address():
    client, fake_auth = _client()
    response = client.post(
        "/api/auth/signup",
        json={"email": "ada@invalid.test", "password": "secret"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Enter a valid email address."
    assert ACCESS_COOKIE not in response.cookies
    assert fake_auth.sign_up_calls


def test_signup_reports_confirmation_rate_limit():
    client, _ = _client()
    response = client.post(
        "/api/auth/signup",
        json={"email": "ada@ratelimited.test", "password": "secret"},
    )
    assert response.status_code == 429
    assert response.json()["detail"] == (
        "Too many confirmation emails. Try again in a few minutes."
    )


def test_signin_rejects_empty_password():
    client, fake_auth = _client()
    response = client.post(
        "/api/auth/signin", json={"email": "ada@example.com", "password": ""}
    )
    assert response.status_code == 422
    assert fake_auth.sign_in_calls == []


def test_signup_sets_cookies_when_session_is_returned():
    client, _ = _client()
    response = client.post(
        "/api/auth/signup",
        json={"email": "ada@example.com", "password": "secret"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {"id": "user-1", "email": "ada@example.com"}
    assert body["needs_confirmation"] is False
    assert response.cookies[ACCESS_COOKIE] == "access-token"
    assert response.cookies[REFRESH_COOKIE] == "refresh-token"


def test_signup_without_session_needs_confirmation_and_sets_no_cookies():
    fake_auth = FakeAuth()
    fake_auth.session_on_signup = None
    client, _ = _client(fake_auth)
    response = client.post(
        "/api/auth/signup",
        json={"email": "ada@example.com", "password": "secret"},
    )
    assert response.status_code == 200
    assert response.json()["needs_confirmation"] is True
    assert ACCESS_COOKIE not in response.cookies
    assert REFRESH_COOKIE not in response.cookies


def test_signin_sets_cookies():
    client, _ = _client()
    response = client.post(
        "/api/auth/signin",
        json={"email": "ada@example.com", "password": "secret"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "user": {"id": "user-1", "email": "ada@example.com"},
        "needs_confirmation": False,
    }
    assert response.cookies[ACCESS_COOKIE] == "access-token"


def test_signin_rejects_bad_credentials():
    client, _ = _client()
    response = client.post(
        "/api/auth/signin",
        json={"email": "ada@example.com", "password": "wrong"},
    )
    assert response.status_code == 401
    assert ACCESS_COOKIE not in response.cookies


def test_me_is_401_when_unsigned():
    client, _ = _client()
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_the_current_user():
    fake_auth = FakeAuth()
    app = FastAPI()
    app.include_router(auth.router)
    app.dependency_overrides[get_anon_client] = lambda: FakeClient(fake_auth)
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id="user-1", email="ada@example.com"
    )
    response = TestClient(app).get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {"user": {"id": "user-1", "email": "ada@example.com"}}


def test_signout_clears_cookies():
    client, _ = _client()
    response = client.post("/api/auth/signout")
    assert response.status_code == 204


def test_change_password_requires_auth():
    client, fake_auth = _client()
    response = client.post(
        "/api/auth/change-password",
        json={"current_password": "secret", "new_password": "new-secret"},
    )
    assert response.status_code == 401
    assert fake_auth.sign_in_calls == []
    assert fake_auth.update_user_calls == []


def test_change_password_reauths_then_updates():
    fake_auth = FakeAuth()
    app = FastAPI()
    app.include_router(auth.router)
    app.dependency_overrides[get_anon_client] = lambda: FakeClient(fake_auth)
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id="user-1", email="ada@example.com"
    )
    response = TestClient(app).post(
        "/api/auth/change-password",
        json={"current_password": "secret", "new_password": "new-secret"},
    )
    assert response.status_code == 204
    assert fake_auth.sign_in_calls == [
        {"email": "ada@example.com", "password": "secret"}
    ]
    assert fake_auth.set_session_calls == [("access-token", "refresh-token")]
    assert fake_auth.update_user_calls == [{"password": "new-secret"}]


def test_change_password_rejects_wrong_current():
    fake_auth = FakeAuth()
    app = FastAPI()
    app.include_router(auth.router)
    app.dependency_overrides[get_anon_client] = lambda: FakeClient(fake_auth)
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id="user-1", email="ada@example.com"
    )
    response = TestClient(app).post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "new-secret"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Current password is incorrect."
    assert fake_auth.update_user_calls == []


def test_change_password_rejects_same_password():
    fake_auth = FakeAuth()
    app = FastAPI()
    app.include_router(auth.router)
    app.dependency_overrides[get_anon_client] = lambda: FakeClient(fake_auth)
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id="user-1", email="ada@example.com"
    )
    response = TestClient(app).post(
        "/api/auth/change-password",
        json={"current_password": "secret", "new_password": "secret"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "New password must be different."
    assert fake_auth.sign_in_calls == []
    assert fake_auth.update_user_calls == []
