"""Admin hardening: optional IP allowlist and the staff second login step (SMS code).

``AdminSecurityMiddleware`` sits after ``AuthenticationMiddleware`` and only looks at URLs under
the admin prefix (``reverse("admin:index")``):

* ``ADMIN_ALLOWED_IPS`` (IPs or CIDR networks, empty = everyone): other clients get a 404, so
  the admin's existence is not advertised.
* ``STAFF_2FA_REQUIRED``: an authenticated staff user whose session has not passed the SMS step
  is redirected to ``/admin/2fa/`` (login, logout, jsi18n and the 2FA URLs stay reachable).
"""

import ipaddress
import logging
from functools import lru_cache
from urllib.parse import urlencode

from django.conf import settings
from django.http import Http404, HttpResponseRedirect
from django.urls import reverse
from rest_framework.settings import api_settings

from .services import staff_2fa

logger = logging.getLogger("apps.accounts.admin_security")


def client_ip(request) -> str | None:
    """The client IP. ``X-Forwarded-For`` is trusted only when ``NUM_PROXIES`` > 0.

    Same rule as DRF's throttles (``REST_FRAMEWORK["NUM_PROXIES"]``): with N trusted proxies the
    client is the N-th address from the end of the header. Unlike DRF, an unset ``NUM_PROXIES``
    ignores the header too (it is client-controlled).
    """
    remote_addr = request.META.get("REMOTE_ADDR") or None
    num_proxies = api_settings.NUM_PROXIES or 0
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if num_proxies > 0 and xff:
        addrs = [a.strip() for a in xff.split(",") if a.strip()]
        if addrs:
            return addrs[-min(num_proxies, len(addrs))]
    return remote_addr


@lru_cache(maxsize=8)
def _networks(allowed: tuple[str, ...]):
    nets = []
    for item in allowed:
        try:
            nets.append(ipaddress.ip_network(item.strip(), strict=False))
        except ValueError:
            logger.error("Ignoring invalid ADMIN_ALLOWED_IPS entry: %r", item)
    return tuple(nets)


def ip_allowed(ip: str | None) -> bool:
    allowed = tuple(a for a in getattr(settings, "ADMIN_ALLOWED_IPS", ()) if a and a.strip())
    if not allowed:
        return True
    try:
        addr = ipaddress.ip_address((ip or "").strip())
    except ValueError:
        return False
    return any(addr in net for net in _networks(allowed))


def _exempt_paths() -> tuple[str, ...]:
    return (
        reverse("staff-2fa"),
        reverse("admin:login"),
        reverse("admin:logout"),
        reverse("admin:jsi18n"),
    )


class AdminSecurityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        admin_prefix = reverse("admin:index")
        if request.path.startswith(admin_prefix):
            ip = client_ip(request)
            if not ip_allowed(ip):
                logger.warning(
                    "Admin request from a non-allowed IP: ip=%s path=%s", ip, request.path
                )
                raise Http404
            response = self._require_second_step(request)
            if response is not None:
                return response
        return self.get_response(request)

    def _require_second_step(self, request):
        if not getattr(settings, "STAFF_2FA_REQUIRED", True):
            return None
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated and user.is_active and user.is_staff):
            return None
        if staff_2fa.is_verified(request.session, user):
            return None
        if request.path.startswith(_exempt_paths()):
            return None
        query = urlencode({"next": request.get_full_path()})
        return HttpResponseRedirect(f"{reverse('staff-2fa')}?{query}")
