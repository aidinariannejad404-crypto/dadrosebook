"""Edition badge: «ویرایش ۱۴۰۵» for books published for the current exam cycle."""

from django.utils import timezone

from apps.core.jalali import jalali_year
from apps.core.money import to_persian_digits


def current_exam_year() -> int:
    """Jalali year of the next upcoming active exam event; the current Jalali year if none."""
    from .home import upcoming_exam_events

    date = upcoming_exam_events().values_list("date", flat=True).first()
    return jalali_year(date or timezone.localdate())


def is_current_edition(publish_year: int | None, exam_year: int) -> bool:
    return bool(publish_year) and publish_year >= exam_year


def edition_badge(publish_year: int | None, exam_year: int) -> str | None:
    """``"ویرایش ۱۴۰۵"`` (Persian digits) when the book is published for this cycle, else None."""
    if not is_current_edition(publish_year, exam_year):
        return None
    return f"ویرایش {to_persian_digits(publish_year)}"
