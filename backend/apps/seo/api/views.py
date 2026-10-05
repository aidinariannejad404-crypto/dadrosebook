"""SEO API (``docs/phase-5-contract.md`` §1, ``docs/api-contract.md`` → "Phase 5")."""

from django.utils.cache import patch_cache_control
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ..services.redirects import record_hit, record_not_found, redirect_map
from ..services.sitemap import sitemap_data
from .serializers import HitSerializer, NotFoundSerializer

PUBLIC_CACHE_SECONDS = 60


class PlainTextJSONParser(JSONParser):
    """``navigator.sendBeacon(url, JSON.stringify(...))`` posts JSON as ``text/plain``."""

    media_type = "text/plain"


class BeaconView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "seo_beacon"
    parser_classes = [JSONParser, PlainTextJSONParser]


class RedirectMapView(APIView):
    """``GET /seo/redirects/`` — active redirects keyed by ``redirect_key(old_path)``."""

    def get(self, request):
        response = Response(redirect_map())
        patch_cache_control(response, public=True, max_age=PUBLIC_CACHE_SECONDS)
        return response


class RedirectHitView(BeaconView):
    """``POST /seo/redirects/hit/`` — the frontend served a redirect; count it."""

    def post(self, request):
        serializer = HitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record_hit(serializer.validated_data["path"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotFoundView(BeaconView):
    """``POST /seo/not-found/`` — a visitor hit a 404 page."""

    def post(self, request):
        serializer = NotFoundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        record_not_found(data["path"], data.get("referer") or "")
        return Response(status=status.HTTP_204_NO_CONTENT)


class SitemapView(APIView):
    """``GET /seo/sitemap/`` — slugs and last-modified dates for ``sitemap.xml``."""

    def get(self, request):
        data = sitemap_data()
        books = [
            {**b, "cover": _absolute(request, b["cover"]) if b["cover"] else None}
            for b in data["books"]
        ]
        response = Response({**data, "books": books})
        patch_cache_control(response, public=True, max_age=PUBLIC_CACHE_SECONDS)
        return response


def _absolute(request, url: str) -> str:
    """Same rule as DRF's ImageField: storage URLs that are relative get the request host."""
    if url.startswith(("http://", "https://")):
        return url
    return request.build_absolute_uri(url)
