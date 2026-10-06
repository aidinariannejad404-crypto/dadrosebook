import datetime as dt

import pytest

from apps.study.models import BookReadingDay, ReadingDay, ReadingSession
from apps.study.services import activity, pace, report
from apps.study.services.activity import record_heartbeat, tehran_today

UTC = dt.UTC
T0 = dt.datetime(2026, 10, 5, 8, 0, tzinfo=UTC)  # Monday 11:30 in Tehran


def beat(user, book, at, seconds=30, page=None):
    return record_heartbeat(user, book, seconds=seconds, page=page, now=at)


@pytest.mark.django_db
def test_tehran_day_boundary():
    # 20:29 UTC = 23:59 Tehran (Oct 5); 20:31 UTC = 00:01 Tehran (Oct 6)
    assert tehran_today(dt.datetime(2026, 10, 5, 20, 29, tzinfo=UTC)) == dt.date(2026, 10, 5)
    assert tehran_today(dt.datetime(2026, 10, 5, 20, 31, tzinfo=UTC)) == dt.date(2026, 10, 6)


def test_heartbeats_split_at_tehran_midnight(user, book):
    beat(user, book, dt.datetime(2026, 10, 5, 20, 29, 0, tzinfo=UTC))
    beat(user, book, dt.datetime(2026, 10, 5, 20, 29, 30, tzinfo=UTC))
    beat(user, book, dt.datetime(2026, 10, 5, 20, 30, 30, tzinfo=UTC))
    days = dict(ReadingDay.objects.values_list("date", "seconds"))
    assert days == {dt.date(2026, 10, 5): 60, dt.date(2026, 10, 6): 30}


def test_credit_is_capped_by_time_since_last_beat(user, book, book2):
    beat(user, book, T0)
    # a second tab sends a beat 10 s later: only 10 s are credited
    second = beat(user, book2, T0 + dt.timedelta(seconds=10))
    assert second.credited == 10
    # a forged huge value is capped
    third = beat(user, book, T0 + dt.timedelta(minutes=10), seconds=500)
    assert third.credited == activity.MAX_CREDIT_SECONDS
    assert ReadingDay.objects.get(user=user).seconds == 30 + 10 + 60
    per_book = dict(BookReadingDay.objects.values_list("book_id", "seconds"))
    assert per_book == {book.pk: 90, book2.pk: 10}


def test_goal_met_once_and_streak_reported(user, book):
    activity.set_goal(user, 5)
    t = T0
    results = []
    for _ in range(10):  # 10 × 30 s = 5 minutes
        results.append(beat(user, book, t))
        t += dt.timedelta(seconds=30)
    assert [r.just_met for r in results].count(True) == 1
    assert results[-1].just_met
    assert results[-1].streak.current == 1
    assert results[-1].streak.today_met
    more = beat(user, book, t)
    assert not more.just_met
    day = ReadingDay.objects.get(user=user)
    assert day.goal_minutes == 5 and day.goal_met


def test_goal_change_applies_to_today_only(user, book):
    yesterday = T0 - dt.timedelta(days=1)
    for i in range(4):
        beat(user, book, yesterday + dt.timedelta(seconds=30 * i))
    beat(user, book, T0)
    activity.set_goal(user, 30, now=T0)
    assert ReadingDay.objects.get(user=user, date=tehran_today(yesterday)).goal_minutes == 20
    assert ReadingDay.objects.get(user=user, date=tehran_today(T0)).goal_minutes == 30
    # lowering the goal under today's minutes completes today
    activity.set_goal(user, 5, now=T0)
    for i in range(1, 10):
        beat(user, book, T0 + dt.timedelta(seconds=30 * i))
    assert ReadingDay.objects.get(user=user, date=tehran_today(T0)).goal_met


def test_sessions_and_page_speed(user, book):
    t = T0
    for page in range(1, 22):  # one page every 30 s for 10.5 minutes
        beat(user, book, t, page=page)
        t += dt.timedelta(seconds=30)
    beat(user, book, t, page=150)  # a TOC jump is not reading
    session = ReadingSession.objects.get(user=user, book=book)
    assert session.pages_read == 20
    assert session.last_page == 150
    p = pace.reading_pace(user, book, today=tehran_today(T0))
    assert p.measured and p.basis == "book"
    assert p.pages_per_minute == pytest.approx(20 / 11, rel=0.01)
    # a break longer than SESSION_GAP starts a new session
    beat(user, book, t + dt.timedelta(minutes=30), page=151)
    assert ReadingSession.objects.filter(user=user, book=book).count() == 2


def test_default_pace_without_history(user, book):
    p = pace.reading_pace(user, book)
    assert not p.measured
    assert p.pages_per_minute == pace.DEFAULT_PAGES_PER_MINUTE
    assert pace.minutes_for_pages(9, p) == 18


def test_finish_forecast_against_exam(user, book):
    today = dt.date(2026, 10, 5)
    # no history: assumes the 20-minute goal; 100 pages × 2 min = 200 min → 10 days
    f = pace.finish_forecast(
        user, book, page=100, total_pages=200, exam_date=dt.date(2026, 10, 30), today=today
    )
    assert f["basis"] == "goal"
    assert f["days_to_finish"] == 10
    assert f["finish_date"] == "2026-10-14"
    assert f["margin_days"] == 16
    late = pace.finish_forecast(
        user, book, page=0, total_pages=200, exam_date=dt.date(2026, 10, 10), today=today
    )
    assert late["margin_days"] < 0


def test_weekly_report_by_subject(user, book, book2):
    t = T0
    for _ in range(4):
        beat(user, book, t)
        t += dt.timedelta(seconds=30)
    for _ in range(2):
        beat(user, book2, t)
        t += dt.timedelta(seconds=30)
    data = report.weekly_report(user, today=tehran_today(T0))
    assert data["week_start"] == "2026-10-03"  # Saturday
    assert len(data["days"]) == 7
    assert data["weekly_goal_minutes"] == 20 * 5
    assert [s["name"] for s in data["subjects"]] == ["حقوق مدنی", "حقوق تجارت"]
    assert [s["minutes"] for s in data["subjects"]] == [2, 1]
    assert data["total_minutes"] == 3
