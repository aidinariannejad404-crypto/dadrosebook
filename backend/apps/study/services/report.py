"""«کارنامه مطالعه»: this Persian week's minutes per day and per subject, goal, streak, books.

The weekly goal is the daily goal × (7 − rest days): the two rest days are part of the plan,
not a failure. With an active study plan, each subject also gets a target in minutes: the pages
planned for it this week ÷ the user's reading speed.
"""

import datetime as dt
from collections import defaultdict

from django.db.models import Sum

from ..models import BookReadingDay, ReadingDay
from .activity import get_profile, streak_for, tehran_today
from .pace import minutes_for_pages, reading_pace
from .plans import active_plan
from .streak import REST_DAYS_PER_WEEK, week_start

WEEKDAY_NAMES = ("شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه")


def _primary_subject(book) -> dict | None:
    subjects = sorted(book.subjects.all(), key=lambda s: (s.order, s.pk))
    if not subjects:
        return None
    s = subjects[0]
    return {"id": s.pk, "name": s.name, "slug": s.slug, "color": s.color}


def _plan_targets(plan, start: dt.date, end: dt.date, pace) -> dict[str, int]:
    """Subject slug → planned minutes this week (empty without an active plan)."""
    if plan is None:
        return {}
    pages: dict[str, int] = defaultdict(int)
    for day in plan.days:
        if not start.isoformat() <= day["date"] <= end.isoformat():
            continue
        for item in day.get("items", []):
            subject = item.get("subject") or {}
            key = subject.get("slug") or "_"
            pages[key] += item["pages_to"] - item["pages_from"] + 1
    return {k: minutes_for_pages(v, pace) for k, v in pages.items()}


def finished_books(user, since: dt.date | None = None) -> list[dict]:
    from apps.catalog.models import Book
    from apps.reader.models import ReadingProgress

    rows = ReadingProgress.objects.filter(user=user, total_pages__gt=0)
    done = [p for p in rows if p.page >= p.total_pages]
    if since is not None:
        done = [p for p in done if p.updated_at.date() >= since]
    books = Book.objects.in_bulk([p.book_id for p in done])
    return [
        {
            "slug": books[p.book_id].slug,
            "title": books[p.book_id].title,
            "finished_at": p.updated_at.isoformat(),
        }
        for p in sorted(done, key=lambda p: p.updated_at, reverse=True)
        if p.book_id in books
    ]


def weekly_report(user, today: dt.date | None = None) -> dict:
    from apps.catalog.models import Book

    today = today or tehran_today()
    start = week_start(today)
    end = start + dt.timedelta(days=6)
    profile = get_profile(user)
    days = {d.date: d for d in ReadingDay.objects.filter(user=user, date__range=(start, end))}
    week = []
    for i in range(7):
        date = start + dt.timedelta(days=i)
        row = days.get(date)
        week.append(
            {
                "date": date.isoformat(),
                "weekday": WEEKDAY_NAMES[i],
                "minutes": row.seconds // 60 if row else 0,
                "goal_minutes": row.goal_minutes if row else profile.daily_goal_minutes,
                "met": bool(row and row.goal_met_at),
                "is_today": date == today,
                "is_future": date > today,
            }
        )

    per_book = (
        BookReadingDay.objects.filter(user=user, date__range=(start, end))
        .values("book_id")
        .annotate(seconds=Sum("seconds"))
    )
    books = {
        b.pk: b
        for b in Book.objects.filter(pk__in=[r["book_id"] for r in per_book]).prefetch_related(
            "subjects"
        )
    }
    pace = reading_pace(user, today=today)
    plan = active_plan(user)
    targets = _plan_targets(plan, start, end, pace)
    subjects: dict[str, dict] = {}
    for row in per_book:
        book = books.get(row["book_id"])
        if book is None:
            continue
        subject = _primary_subject(book) or {"id": None, "name": "سایر", "slug": "_", "color": None}
        entry = subjects.setdefault(subject["slug"], {**subject, "seconds": 0})
        entry["seconds"] += row["seconds"]
    planned = {b.subject["slug"]: b.subject for b in plan.books.all() if b.subject} if plan else {}
    for slug in targets:  # planned subjects not read yet this week still show their target
        if slug not in subjects and slug in planned:
            subjects[slug] = {**planned[slug], "seconds": 0}
    subject_rows = sorted(
        (
            {
                "id": s["id"],
                "name": s["name"],
                "slug": s["slug"],
                "color": s["color"],
                "minutes": s["seconds"] // 60,
                "target_minutes": targets.get(s["slug"]),
            }
            for s in subjects.values()
        ),
        key=lambda s: (-s["minutes"], s["name"]),
    )
    total = sum(d["minutes"] for d in week)
    finished = finished_books(user)
    weekly_goal = profile.daily_goal_minutes * (7 - REST_DAYS_PER_WEEK)
    return {
        "week_start": start.isoformat(),
        "week_end": end.isoformat(),
        "today": today.isoformat(),
        "daily_goal_minutes": profile.daily_goal_minutes,
        "weekly_goal_minutes": weekly_goal,
        "total_minutes": total,
        "goal_days_met": sum(1 for d in week if d["met"]),
        "days": week,
        "subjects": subject_rows,
        "streak": streak_for(user, today).as_dict(),
        "pace": pace.as_dict(),
        "books_finished": finished,
        "books_finished_this_week": sum(
            1 for b in finished if b["finished_at"][:10] >= start.isoformat()
        ),
        "all_time_minutes": (
            ReadingDay.objects.filter(user=user).aggregate(s=Sum("seconds"))["s"] or 0
        )
        // 60,
    }
