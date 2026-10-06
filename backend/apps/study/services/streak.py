"""Gentle streak rules (pure functions, no database).

* A day counts when the reader met that day's goal (``ReadingDay.goal_met_at``).
* Weeks are Persian weeks: Saturday to Friday, on the Asia/Tehran calendar.
* Every week has ``REST_DAYS_PER_WEEK`` free rest days: a missed day inside the chain uses one;
  the chain only breaks on the third missed day of the same week.
* Today never breaks anything: until the day is over it is just «not yet».
* The streak is the number of goal days in the unbroken chain (rest days keep it alive but do
  not add to it), so the number never grows without reading.
"""

import datetime as dt
from collections.abc import Iterable
from dataclasses import dataclass

REST_DAYS_PER_WEEK = 2
MILESTONES = (7, 30)
HORIZON_DAYS = 800


def week_start(day: dt.date) -> dt.date:
    """Saturday on or before ``day`` (Python: Monday=0 … Saturday=5)."""
    return day - dt.timedelta(days=(day.weekday() - 5) % 7)


@dataclass(frozen=True)
class StreakInfo:
    current: int
    today_met: bool
    rest_days_left: int
    rest_days_used: int

    @property
    def milestone(self) -> int | None:
        """7 or 30 when today's goal completed exactly that many days in a row."""
        return self.current if self.today_met and self.current in MILESTONES else None

    def as_dict(self) -> dict:
        return {
            "current": self.current,
            "today_met": self.today_met,
            "rest_days_left": self.rest_days_left,
            "rest_days_used": self.rest_days_used,
            "rest_days_per_week": REST_DAYS_PER_WEEK,
            "milestone": self.milestone,
        }


def compute_streak(
    met_days: Iterable[dt.date], today: dt.date, *, rest_per_week: int = REST_DAYS_PER_WEEK
) -> StreakInfo:
    met = set(met_days)
    today_met = today in met
    current = 1 if today_met else 0
    earliest = min(met) if met else today
    misses_per_week: dict[dt.date, int] = {}
    chain_misses: list[dt.date] = []  # misses between goal days of the chain
    pending: list[dt.date] = []  # misses after the last goal day seen (may be outside the chain)

    day = today - dt.timedelta(days=1)
    for _ in range(HORIZON_DAYS):
        if day < earliest:
            break
        if day in met:
            current += 1
            chain_misses.extend(pending)
            pending = []
        else:
            week = week_start(day)
            misses_per_week[week] = misses_per_week.get(week, 0) + 1
            if misses_per_week[week] > rest_per_week:
                break
            pending.append(day)
        day -= dt.timedelta(days=1)

    this_week = week_start(today)
    used = sum(1 for d in chain_misses if week_start(d) == this_week) if current else 0
    used = min(used, rest_per_week)
    return StreakInfo(
        current=current,
        today_met=today_met,
        rest_days_left=rest_per_week - used,
        rest_days_used=used,
    )
