"""Production settings. Everything secret or site-specific comes from the environment.

Runs behind Caddy (TLS, HTTP→HTTPS redirect, security headers), see ``deploy/Caddyfile`` and
``docs/deploy.md``.
"""

import json
import logging

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import DATABASES, MIDDLEWARE, STORAGES, env

DEBUG = False

# --- secret key ---------------------------------------------------------------------------------
SECRET_KEY = env("SECRET_KEY")  # required in production
_INSECURE_SECRET_KEYS = {"", "change-me", "changeme", "insecure-dev-key-change-me", "secret"}
if (
    SECRET_KEY.strip().lower() in _INSECURE_SECRET_KEYS
    or SECRET_KEY.startswith("django-insecure")
    or "change-me" in SECRET_KEY.lower()
    or len(SECRET_KEY) < 50
    or len(set(SECRET_KEY)) < 5
):
    raise ImproperlyConfigured(
        "SECRET_KEY is a default/weak value. Generate one with: "
        'python -c "import secrets; print(secrets.token_urlsafe(64))"'
    )

# --- static files -------------------------------------------------------------------------------
# WhiteNoise serves collected static files (admin CSS/fonts) right after SecurityMiddleware.
MIDDLEWARE = [MIDDLEWARE[0], "whitenoise.middleware.WhiteNoiseMiddleware", *MIDDLEWARE[1:]]

STORAGES = {
    **STORAGES,
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# --- database -----------------------------------------------------------------------------------
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

# --- HTTPS / security ---------------------------------------------------------------------------
# Caddy terminates TLS and sets X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=True)
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=True)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# Caddy already redirects every http:// request to https://. Keep Django's own redirect off by
# default: the frontend's server-side calls (http://backend:8000) and the container healthcheck
# reach Django over plain HTTP inside the docker network and must not be redirected.
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=False)
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/$"]

# Only sent on HTTPS responses (request.is_secure()). Caddy sends the same header for the site.
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000)
# Enable only when *every* subdomain of the site domain is served over HTTPS.
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)

SILENCED_SYSTEM_CHECKS = []
if not SECURE_SSL_REDIRECT:
    # security.W008: the HTTP→HTTPS redirect is done by Caddy, see the comment above.
    SILENCED_SYSTEM_CHECKS.append("security.W008")

# --- email / admins -----------------------------------------------------------------------------
# ADMINS="ops@example.com,owner@example.com" → 500 errors are emailed (needs EMAIL_URL).
ADMINS = [(addr, addr) for addr in env.list("ADMINS", default=[]) if addr]
MANAGERS = ADMINS
EMAIL_URL = env("EMAIL_URL", default="")
if EMAIL_URL:
    globals().update(env.email_url("EMAIL_URL"))  # EMAIL_BACKEND, EMAIL_HOST, EMAIL_PORT, …
SERVER_EMAIL = env("SERVER_EMAIL", default="noreply@localhost")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default=SERVER_EMAIL)


# --- logging (stdout, collected by docker's json-file driver) ------------------------------------
class JsonFormatter(logging.Formatter):
    """One JSON object per line: easy to grep with ``docker compose logs`` and to ship later."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        status = getattr(record, "status_code", None)
        if status is not None:
            payload["status"] = status
        request = getattr(record, "request", None)
        if request is not None and hasattr(request, "path"):
            payload["method"] = getattr(request, "method", None)
            payload["path"] = request.path
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


LOG_LEVEL = env("LOG_LEVEL", default="INFO").upper()
LOG_FORMAT = env("LOG_FORMAT", default="json")  # json | text

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {"()": JsonFormatter},
        "text": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"},
    },
    "filters": {"require_debug_false": {"()": "django.utils.log.RequireDebugFalse"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "json" if LOG_FORMAT == "json" else "text",
        },
        "mail_admins": {
            "level": "ERROR",
            "filters": ["require_debug_false"],
            "class": "django.utils.log.AdminEmailHandler",
        },
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        # 5xx responses and unhandled exceptions (4xx are logged as WARNING).
        "django.request": {
            "handlers": ["console", *(["mail_admins"] if ADMINS and EMAIL_URL else [])],
            "level": "WARNING",
            "propagate": False,
        },
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.db.backends": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "celery": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
    },
}
