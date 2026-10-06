"""Reading speed and «how long is left» estimates (ه۴).

* Speed = pages advanced ÷ active minutes over recent sessions (book first, then all books,
  then a conservative default for dense law textbooks).
* Time left in the reader = remaining pages ÷ speed (the reader knows the chapter's last page).
* Finish forecast on a library card = minutes left ÷ the minutes a day the user actually spends
  on that book (last 14 days); without that history the daily goal is assumed.
"""

import datetime as dt
import math
from dataclasses import dataclass

from django.db.models import Sum

from ..models import BookReadingDay, ReadingSession
from .activity import get_profile, tehran_today

DEFAULT_PAGES_PER_MINUTE = 0.5  # two minutes a page
MIN_PPM, MAX_PPM = 0.1, 5.0
MIN_MEASURED_SECONDS = 10 * 60
SPEED_WINDOW_DAYS = 60
DAILY_WINDOW_DAYS = 14


@dataclass(frozen=True)
class Pace:
    pages_per_minute: float
    measured: bool
    basis: str  # "book" | "all" | "default"

    def as_dict(self) -> dict:
        return {
            "pages_per_minute": round(self.pages_per_minute, 3),
            "minutes_per_page": round(1 / self.pages_per_minute, 2),
            "measured": self.measured,
            "basis": self.basis,
        }


def _speed(queryset) -> float | None:
    totals = queryset.filter(pages_read__gt=0).aggregate(
        pages=Sum("pages_read"), seconds=Sum("seconds")
    )
    pages, seconds = totals["pages"] or 0, totals["seconds"] or 0
    if seconds < MIN_MEASURED_SECONDS or pages <= 0:
        return None
    return min(MAX_PPM, max(MIN_PPM, pages / (seconds / 60)))


def reading_pace(user, book=None, *, today: dt.date | None = None) -> Pace:
    today = today or tehran_today()
    since = today - dt.timedelta(days=SPEED_WINDOW_DAYS)
    sessions = ReadingSession.objects.filter(user=user, last_beat_at__date__gte=since)
    if book is not None:
        ppm = _speed(sessions.filter(book=book))
        if ppm is not None:
            return Pace(ppm, True, "book")
    ppm = _speed(sessions)
    if ppm is not None:
        return Pace(ppm, True, "all")
    return Pace(DEFAULT_PAGES_PER_MINUTE, False, "default")


def minutes_for_pages(pages: int, pace: Pace) -> int:
    if pages <= 0:
        return 0
    return max(1, math.ceil(pages / pace.pages_per_minute))


def daily_minutes_on_book(user, book, today: dt.date) -> float:
    since = today - dt.timedelta(days=DAILY_WINDOW_DAYS - 1)
    seconds = (
        BookReadingDay.objects.filter(
            user=user, book=book, date__gte=since, date__lte=today
        ).aggregate(s=Sum("seconds"))["s"]
        or 0
    )
    return seconds / 60 / DAILY_WINDOW_DAYS


def finish_forecast(
    user,
    book,
    *,
    page: int,
    total_pages: int,
    exam_date: dt.date | None,
    today: dt.date | None = None,
) -> dict | None:
    """``None`` without a page count. Otherwise the days to finish and the margin to the exam.

    ``margin_days`` > 0: finishes that many days before the exam; ≤ 0: will not finish in time.
    """
    today = today or tehran_today()
    if total_pages <= 0:
        return None
    remaining = max(0, total_pages - max(0, page))
    pace = reading_pace(user, book, today=today)
    minutes_left = minutes_for_pages(remaining, pace)
    if remaining == 0:
        return {
            "finished": True,
            "remaining_pages": 0,
            "minutes_left": 0,
            "days_to_finish": 0,
            "finish_date": today.isoformat(),
            "margin_days": (exam_date - today).days if exam_date else None,
            "basis": "done",
            "pace": pace.as_dict(),
        }
    daily = daily_minutes_on_book(user, book, today)
    basis = "history"
    if daily < 1:
        daily = float(get_profile(user).daily_goal_minutes)
        basis = "goal"
    days = max(1, math.ceil(minutes_left / daily))
    finish = today + dt.timedelta(days=days - 1)
    return {
        "finished": False,
        "remaining_pages": remaining,
        "minutes_left": minutes_left,
        "daily_minutes": round(daily, 1),
        "days_to_finish": days,
        "finish_date": finish.isoformat(),
        "margin_days": (exam_date - finish).days if exam_date else None,
        "basis": basis,
        "pace": pace.as_dict(),
    }
