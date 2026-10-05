"""Reader access log: who opened which book, chapter, file or search, from where."""

import datetime as dt

from django.utils import timezone

from ..models import ReaderAccessLog

Kind = ReaderAccessLog.Kind


def client_ip(request) -> str | None:
    # The reverse proxy (nginx) overwrites REMOTE_ADDR via X-Real-IP; never trust raw XFF here.
    return request.META.get("REMOTE_ADDR") or None


def log(request, kind: str, *, user=None, book=None, device=None, detail: str = "") -> None:
    ReaderAccessLog.objects.create(
        user=user if user is not None and user.is_authenticated else None,
        book=book,
        device=device,
        kind=kind,
        detail=str(detail)[:200],
        ip=client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
    )


def prune(days: int = 180) -> int:
    cutoff = timezone.now() - dt.timedelta(days=days)
    deleted, _ = ReaderAccessLog.objects.filter(created_at__lt=cutoff).delete()
    return deleted
