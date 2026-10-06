"""ه۸: «گزارش مشکل» sent from the reader toolbar, worked from the admin."""

from django.utils import timezone

from apps.catalog.models import Book
from apps.core.money import to_persian_digits

from ..models import ProblemReport
from .devices import device_label
from .reanchor import active_ebook

OPEN = (ProblemReport.Status.NEW, ProblemReport.Status.IN_PROGRESS)


def create_report(user, book: Book, *, user_agent: str = "", **data) -> ProblemReport:
    """Store one report; the file version/format default to the active file."""
    ebook = active_ebook(book)
    version = data.pop("ebook_version", None) or (ebook.version if ebook else None)
    return ProblemReport.objects.create(
        user=user if user is not None and user.is_authenticated else None,
        book=book,
        ebook_version=version,
        ebook_format=ebook.format if ebook else "",
        device_label=(data.pop("device_label", "") or device_label(user_agent))[:100],
        user_agent=(user_agent or "")[:255],
        **data,
    )


def set_status(queryset, status: str) -> int:
    resolved = timezone.now() if status in (ProblemReport.Status.RESOLVED,) else None
    return queryset.update(status=status, resolved_at=resolved)


def open_reports() -> int:
    return ProblemReport.objects.filter(status__in=OPEN).count()


def problem_reports_badge(request) -> str:
    """Admin sidebar badge (UNFOLD navigation)."""
    count = open_reports()
    return to_persian_digits(count) if count else ""
