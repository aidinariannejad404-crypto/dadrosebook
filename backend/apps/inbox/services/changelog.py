"""PF-17: «تازه‌های دادرُز» (/changelog) and the one-time «تازه‌ها» sheet."""

from django.utils import timezone

from ..models import ChangelogEntry


def published_entries(today=None):
    today = today or timezone.localdate()
    return ChangelogEntry.objects.filter(is_published=True, published_at__lte=today).order_by(
        "-published_at", "-id"
    )


def latest_announcement(today=None) -> ChangelogEntry | None:
    """The newest published entry flagged for the sheet (the client remembers what it showed)."""
    return published_entries(today).filter(announce=True).first()
