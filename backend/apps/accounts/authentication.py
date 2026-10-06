"""DRF authentication from the httpOnly ``dr_access`` cookie.

CSRF: cookies are ``SameSite=Lax`` (no cross-site POST carries them), the API only parses JSON
(a cross-site form cannot send ``application/json`` without a CORS preflight), and unsafe requests
whose ``Origin`` is not a trusted origin are rejected here as a third layer.
"""

from django.conf import settings
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication

from .services import tokens

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


def _origin_trusted(origin: str) -> bool:
    allowed = set(settings.CSRF_TRUSTED_ORIGINS) | set(settings.CORS_ALLOWED_ORIGINS)
    return origin in allowed


class CookieJWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
        if not raw:
            return None
        try:
            payload = tokens.decode(raw, "access")
            user = tokens.user_for(payload)
        except tokens.TokenError:
            # Expired/invalid access token: behave as anonymous; the client refreshes and retries
            # when a protected endpoint answers 401.
            return None
        if request.method not in SAFE_METHODS:
            origin = request.headers.get("Origin")
            if origin and not _origin_trusted(origin):
                raise exceptions.PermissionDenied("مبدأ درخواست مجاز نیست.")
        return (user, payload)

    def authenticate_header(self, request):
        # Makes DRF answer 401 (not 403) for unauthenticated requests to protected endpoints.
        return 'Cookie realm="api"'
