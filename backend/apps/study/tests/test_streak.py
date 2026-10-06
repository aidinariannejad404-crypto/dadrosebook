import datetime as dt

from apps.study.services.streak import compute_streak, week_start

# 2026-10-03 is a Saturday (start of a Persian week).
SAT = dt.date(2026, 10, 3)


def days(*offsets):
    return {SAT + dt.timedelta(days=o) for o in offsets}


def test_week_starts_on_saturday():
    assert week_start(SAT) == SAT
    assert week_start(SAT + dt.timedelta(days=6)) == SAT  # Friday
    assert week_start(SAT + dt.timedelta(days=7)) == SAT + dt.timedelta(days=7)
    assert week_start(SAT - dt.timedelta(days=1)) == SAT - dt.timedelta(days=7)


def test_no_reading_is_zero_with_full_rest():
    info = compute_streak(set(), SAT)
    assert (info.current, info.today_met, info.rest_days_left) == (0, False, 2)


def test_consecutive_days_count_and_today_pending_does_not_break():
    today = SAT + dt.timedelta(days=4)  # Wednesday
    info = compute_streak(days(0, 1, 2, 3), today)
    assert info.current == 4
    assert not info.today_met
    assert info.rest_days_left == 2


def test_two_rest_days_a_week_keep_the_chain():
    today = SAT + dt.timedelta(days=6)  # Friday
    # read Sat, Sun, Wed, Thu, Fri — Mon and Tue are the week's two rest days
    info = compute_streak(days(0, 1, 4, 5, 6), today)
    assert info.current == 5
    assert info.today_met
    assert info.rest_days_used == 2
    assert info.rest_days_left == 0


def test_third_miss_in_one_week_breaks():
    today = SAT + dt.timedelta(days=6)
    # Sat read, Sun/Mon/Tue missed (3 misses in the same week), Wed–Fri read
    info = compute_streak(days(0, 4, 5, 6), today)
    assert info.current == 3


def test_rest_days_reset_every_persian_week():
    # Previous week: misses on Thu and Fri (2); this week: misses on Sat and Sun (2).
    prev_sat = SAT - dt.timedelta(days=7)
    met = {prev_sat + dt.timedelta(days=i) for i in range(5)} | days(2, 3)
    today = SAT + dt.timedelta(days=3)  # Tuesday
    info = compute_streak(met, today)
    assert info.current == 7
    assert info.today_met
    assert info.rest_days_used == 2


def test_misses_before_the_first_goal_day_are_not_counted_as_rest():
    today = SAT + dt.timedelta(days=5)  # Thursday, first ever goal day
    info = compute_streak(days(5), today)
    assert info.current == 1
    assert info.rest_days_left == 2


def test_yesterday_missed_uses_a_rest_day_until_today_is_read():
    today = SAT + dt.timedelta(days=3)
    info = compute_streak(days(0, 1), today)  # Mon missed, Tue (today) not yet
    assert info.current == 2
    assert info.rest_days_used == 1


def test_milestones_only_when_today_completes_them():
    met = days(*range(7))
    assert compute_streak(met, SAT + dt.timedelta(days=6)).milestone == 7
    assert compute_streak(met - days(6), SAT + dt.timedelta(days=6)).milestone is None
    thirty = {SAT + dt.timedelta(days=i) for i in range(30)}
    assert compute_streak(thirty, SAT + dt.timedelta(days=29)).milestone == 30
    assert compute_streak(thirty, SAT + dt.timedelta(days=29)).as_dict()["current"] == 30
