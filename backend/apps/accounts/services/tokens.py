"""JWT access/refresh tokens carried in httpOnly cookies.

* access: short-lived (``JWT_ACCESS_LIFETIME_SECONDS``), checked on every request.
* refresh: long-lived, rotated on every ``/auth/refresh/``; a used or logged-out refresh token's
  ``jti`` is put on a cache denylist until it would have expired anyway.
* ``User.is_active = False`` locks a user out on their next request.
"""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from django.conf import settings
from django.core.cache import cache

ALGORITHM = "HS256"
DENYLIST_PREFIX = "jwt-deny:"


class TokenError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _encode(user, kind: str, lifetime: int) -> str:
    now = _now()
    payload = {
        "sub": str(user.pk),
        "typ": kind,
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=lifetime)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SIGNING_KEY, algorithm=ALGORITHM)


def issue_pair(user) -> tuple[str, str]:
    return (
        _encode(user, "access", settings.JWT_ACCESS_LIFETIME_SECONDS),
        _encode(user, "refresh", settings.JWT_REFRESH_LIFETIME_SECONDS),
    )


def decode(token: str, kind: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SIGNING_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
    if payload.get("typ") != kind:
        raise TokenError("wrong token type")
    if kind == "refresh" and cache.get(DENYLIST_PREFIX + payload.get("jti", "")):
        raise TokenError("token revoked")
    return payload


def revoke(payload: dict) -> None:
    """Denylist a refresh token's jti until its expiry."""
    ttl = max(1, int(payload.get("exp", 0) - _now().timestamp()))
    cache.set(DENYLIST_PREFIX + payload["jti"], 1, timeout=ttl)


def user_for(payload: dict):
    from ..models import User

    try:
        user = User.objects.get(pk=int(payload["sub"]))
    except (User.DoesNotExist, KeyError, ValueError) as exc:
        raise TokenError("unknown user") from exc
    if not user.is_active:
        raise TokenError("inactive user")
    return user


def rotate(refresh_token: str):
    """Exchange a refresh token for ``(user, access, refresh)``; the old one is revoked."""
    payload = decode(refresh_token, "refresh")
    user = user_for(payload)
    revoke(payload)
    access, refresh = issue_pair(user)
    return user, access, refresh


def _cookie_kwargs() -> dict:
    return {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "domain": settings.AUTH_COOKIE_DOMAIN,
    }


def set_auth_cookies(response, access: str, refresh: str) -> None:
    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS,
        access,
        max_age=settings.JWT_ACCESS_LIFETIME_SECONDS,
        path="/",
        **_cookie_kwargs(),
    )
    # The refresh cookie only travels to the auth endpoints.
    response.set_cookie(
        settings.AUTH_COOKIE_REFRESH,
        refresh,
        max_age=settings.JWT_REFRESH_LIFETIME_SECONDS,
        path="/api/v1/auth/",
        **_cookie_kwargs(),
    )


def clear_auth_cookies(response) -> None:
    domain = settings.AUTH_COOKIE_DOMAIN
    samesite = settings.AUTH_COOKIE_SAMESITE
    response.delete_cookie(settings.AUTH_COOKIE_ACCESS, path="/", domain=domain, samesite=samesite)
    response.delete_cookie(
        settings.AUTH_COOKIE_REFRESH, path="/api/v1/auth/", domain=domain, samesite=samesite
    )
