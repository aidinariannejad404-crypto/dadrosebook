from django.core.cache import cache
from django.db import connection
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import StoreSettingsSerializer
from .services.store_settings import get_store_settings


class HealthView(APIView):
    """Liveness: database and cache (Redis) reachable."""

    def get(self, request):
        errors = {}
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception as exc:  # noqa: BLE001
            errors["database"] = str(exc)
        try:
            cache.set("health:ping", "1", timeout=5)
            if cache.get("health:ping") != "1":
                errors["cache"] = "cache read-back failed"
        except Exception as exc:  # noqa: BLE001
            errors["cache"] = str(exc)
        if errors:
            return Response({"status": "error", "errors": errors}, status=503)
        return Response({"status": "ok"})


class StoreSettingsView(APIView):
    """Public store-wide settings (delivery texts, consult links, trust seal)."""

    def get(self, request):
        return Response(StoreSettingsSerializer(get_store_settings()).data)
