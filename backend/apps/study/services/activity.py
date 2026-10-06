"""Active-reading heartbeats → reading sessions, minutes per book/day and the daily goal.

The reader sends a heartbeat every ``HEARTBEAT_SECONDS`` while the page is visible *and* the
reader interacted within the last two minutes. The server never trusts the reported seconds
blindly: a beat credits at most ``MAX_CREDIT_SECONDS`` and never more than the time since the
user's previous beat (any book, any device), so two open tabs cannot double the minutes.

Days are Asia/Tehran calendar days (Iran has no DST since 2022, but ``zoneinfo`` handles it).
"""

import datetime as dt
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from ..models import (
    BookReadingDay,
    ReadingDay,
    ReadingSession,
    StudyProfile,
)
from .streak import StreakInfo, compute_streak

TEHRAN = ZoneInfo("Asia/Tehran")
HEARTBEAT_SECONDS = 30
MAX_CREDIT_SECONDS = 60
SESSION_GAP = dt.timedelta(minutes=5)
# A forward page change counts as reading only up to this speed (a TOC jump is not reading).
MAX_PAGES_PER_MINUTE = 6
GOAL_CHOICES = (10, 15, 20, 30, 45, 60, 90, 120)


def tehran_today(now: dt.datetime | None = None) -> dt.date:
    return (now or timezone.now()).astimezone(TEHRAN).date()


def get_profile(user) -> StudyProfile:
    profile, _ = StudyProfile.objects.get_or_create(user=user)
    return profile


def set_goal(user, minutes: int, *, now: dt.datetime | None = None) -> StudyProfile:
    """Change the daily goal. Today's row follows the new goal; past days keep theirs."""
    now = now or timezone.now()
    profile = get_profile(user)
    profile.daily_goal_minutes = int(minutes)
    profile.save(update_fields=["daily_goal_minutes", "updated_at"])
    day = ReadingDay.objects.filter(user=user, date=tehran_today(now)).first()
    if day is not None:
        day.goal_minutes = profile.daily_goal_minutes
        met = day.seconds >= day.goal_minutes * 60
        if met and day.goal_met_at is None:
            day.goal_met_at = now
        elif not met:
            day.goal_met_at = None
        day.save(update_fields=["goal_minutes", "goal_met_at"])
    return profile


def met_days(user, *, until: dt.date, days: int = 800) -> set[dt.date]:
    since = until - dt.timedelta(days=days)
    return set(
        ReadingDay.objects.filter(
            user=user, goal_met_at__isnull=False, date__gte=since, date__lte=until
        ).values_list("date", flat=True)
    )


def streak_for(user, today: dt.date | None = None) -> StreakInfo:
    today = today or tehran_today()
    return compute_streak(met_days(user, until=today), today)


@dataclass
class HeartbeatResult:
    credited: int
    day: ReadingDay
    goal_minutes: int
    just_met: bool
    streak: StreakInfo
    session: ReadingSession


def _plausible_pages(delta: int, credited: int) -> int:
    """Forward pages that can count as reading in ``credited`` seconds (0 for jumps/back)."""
    if delta <= 0:
        return 0
    limit = max(2, MAX_PAGES_PER_MINUTE * credited // 60)
    return delta if delta <= limit else 0


def record_heartbeat(
    user,
    book,
    *,
    seconds: int = HEARTBEAT_SECONDS,
    page: int | None = None,
    now: dt.datetime | None = None,
) -> HeartbeatResult:
    now = now or timezone.now()
    requested = max(0, min(int(seconds or 0), MAX_CREDIT_SECONDS))
    today = tehran_today(now)
    with transaction.atomic():
        get_profile(user)
        profile = StudyProfile.objects.select_for_update().get(user=user)
        if profile.last_beat_at is not None:
            elapsed = int((now - profile.last_beat_at).total_seconds())
            credited = max(0, min(requested, elapsed))
        else:
            credited = min(requested, HEARTBEAT_SECONDS)
        if profile.last_beat_at is None or now > profile.last_beat_at:
            profile.last_beat_at = now
            profile.save(update_fields=["last_beat_at", "updated_at"])

        session = (
            ReadingSession.objects.select_for_update()
            .filter(user=user, book=book, last_beat_at__gte=now - SESSION_GAP)
            .order_by("-last_beat_at")
            .first()
        )
        if session is None:
            session = ReadingSession.objects.create(
                user=user,
                book=book,
                started_at=now,
                last_beat_at=now,
                start_page=page or 0,
                last_page=page or 0,
            )
        session.seconds += credited
        session.last_beat_at = max(session.last_beat_at, now)
        if page:
            if session.last_page:
                session.pages_read += _plausible_pages(page - session.last_page, credited)
            else:
                session.start_page = page
            session.last_page = page
        session.save()

        if credited:
            BookReadingDay.objects.get_or_create(user=user, book=book, date=today)
            BookReadingDay.objects.filter(user=user, book=book, date=today).update(
                seconds=F("seconds") + credited
            )
        day, _ = ReadingDay.objects.get_or_create(
            user=user, date=today, defaults={"goal_minutes": profile.daily_goal_minutes}
        )
        day = ReadingDay.objects.select_for_update().get(pk=day.pk)
        day.seconds += credited
        just_met = False
        if day.goal_met_at is None and day.seconds >= day.goal_minutes * 60:
            day.goal_met_at = now
            just_met = True
        day.save(update_fields=["seconds", "goal_met_at"])

    return HeartbeatResult(
        credited=credited,
        day=day,
        goal_minutes=day.goal_minutes,
        just_met=just_met,
        streak=streak_for(user, today),
        session=session,
    )


def today_summary(user, now: dt.datetime | None = None) -> dict:
    """Minutes today, the goal and the streak (dashboard, reader chrome, heartbeat reply)."""
    today = tehran_today(now)
    profile = get_profile(user)
    day = ReadingDay.objects.filter(user=user, date=today).first()
    goal = day.goal_minutes if day else profile.daily_goal_minutes
    seconds = day.seconds if day else 0
    return {
        "date": today.isoformat(),
        "minutes": seconds // 60,
        "seconds": seconds,
        "goal_minutes": goal,
        "goal_met": bool(day and day.goal_met_at),
        "streak": streak_for(user, today).as_dict(),
    }
