"""Unit tests for the pure study plan generator."""

import datetime as dt
from collections import Counter, defaultdict
from itertools import pairwise

import pytest

from apps.leads.services.study_plan import (
    DEFAULT_PAGES,
    TASK_FAST_STUDY,
    TASK_STUDY,
    PlanBook,
    PlanExam,
    apportion,
    generate_study_plan,
    interleave,
    review_days_for,
)

TODAY = dt.date(2026, 10, 2)
CIVIL = {"id": 1, "name": "حقوق مدنی", "slug": "حقوق-مدنی", "color": "#1F4E8C"}
CRIMINAL = {"id": 2, "name": "حقوق جزا", "slug": "حقوق-جزا", "color": "#A23B32"}
COMMERCE = {"id": 3, "name": "حقوق تجارت", "slug": "حقوق-تجارت", "color": "#1E7A5A"}
FIQH = {"id": 4, "name": "متون فقه", "slug": "متون-فقه", "color": "#6B5A3A"}
ADP = {"id": 5, "name": "آیین دادرسی مدنی", "slug": "آدم", "color": "#2E6F9E"}


def book(slug, pages, subject=CIVIL):
    return PlanBook(title=f"کتاب {slug}", slug=slug, pages=pages, subject=subject)


def exam_in(days):
    return PlanExam(name="آزمون کانون وکلا ۱۴۰۵", date=TODAY + dt.timedelta(days=days))


def plan(books, days=34, hours=6, weights=None, exam="default"):
    return generate_study_plan(
        books=books,
        exam=exam_in(days) if exam == "default" else exam,
        hours_per_day=hours,
        today=TODAY,
        weights=weights,
    )


def items(result):
    return [item for day in result["days"] for item in day["items"]]


def pages_by_book(result) -> dict[str, list[tuple[int, int]]]:
    ranges = defaultdict(list)
    for item in items(result):
        ranges[item["book_slug"]].append((item["pages_from"], item["pages_to"]))
    return ranges


def assert_covers_every_page(result, books):
    ranges = pages_by_book(result)
    for b in books:
        expected = b.pages if b.pages else DEFAULT_PAGES
        spans = ranges[b.slug]
        assert spans[0][0] == 1
        assert spans[-1][1] == expected
        for (_, prev_end), (start, end) in pairwise(spans):
            assert start == prev_end + 1  # contiguous, in order, no overlap
            assert start <= end
    total = sum(i["pages_to"] - i["pages_from"] + 1 for i in items(result))
    assert total == result["summary"]["total_pages"]


# --- dates and windows -------------------------------------------------------------------------
def test_dates_run_from_today_to_the_day_before_the_exam():
    result = plan([book("a", 600)], days=34)
    assert result["exam"] == {
        "name": "آزمون کانون وکلا ۱۴۰۵",
        "date": "2026-11-05",
        "days_left": 34,
    }
    assert result["summary"] == {
        "total_pages": 600,
        "study_days": 29,
        "review_days": 5,
        "pages_per_day": 21,
    }
    dates = [d["date"] for d in result["days"]] + [r["date"] for r in result["review"]]
    assert dates[0] == "2026-10-02"
    assert dates[-1] == "2026-11-04"  # the day before the exam
    assert len(dates) == len(set(dates)) == 34
    assert result["review"][0]["date"] == "2026-10-31"


@pytest.mark.parametrize(
    ("days", "review"),
    [(1, 0), (2, 1), (3, 2), (4, 3), (10, 3), (20, 3), (23, 3), (24, 4), (34, 5), (60, 9),
     (66, 10), (67, 10), (200, 10)],
)  # fmt: skip
def test_review_window(days, review):
    assert review_days_for(days) == review
    result = plan([book("a", 300)], days=days)
    assert result["summary"]["review_days"] == review
    assert result["summary"]["study_days"] == days - review
    assert len(result["review"]) == review


@pytest.mark.parametrize("exam", [None, PlanExam("آزمون گذشته", TODAY - dt.timedelta(days=3))])
def test_no_or_past_exam_gives_a_30_day_plan(exam):
    result = plan([book("a", 300)], exam=exam)
    assert result["exam"] is None
    assert result["summary"]["study_days"] + result["summary"]["review_days"] == 30
    assert result["summary"]["review_days"] == 5
    assert result["review"][-1]["date"] == (TODAY + dt.timedelta(days=29)).isoformat()


def test_exam_today_counts_as_passed():
    result = plan([book("a", 300)], days=0)
    assert result["exam"] is None
    assert len(result["days"]) + len(result["review"]) == 30


# --- pages -------------------------------------------------------------------------------------
def test_every_page_is_planned_once_across_books_and_subjects():
    books = [
        book("madani-1", 820),
        book("madani-2", 377),
        book("jaza", 455, CRIMINAL),
        book("tejarat", 610, COMMERCE),
    ]
    result = plan(books, days=40, weights={1: 4, 2: 3, 3: 2})
    assert result["summary"]["total_pages"] == 820 + 377 + 455 + 610
    assert_covers_every_page(result, books)


def test_missing_page_count_falls_back_to_300():
    books = [book("a", None), book("b", 0, CRIMINAL)]
    result = plan(books)
    assert result["summary"]["total_pages"] == 2 * DEFAULT_PAGES
    assert_covers_every_page(result, books)


def test_fewer_pages_than_days():
    books = [book("tiny", 5)]
    result = plan(books, days=40)
    assert_covers_every_page(result, books)
    assert all(i["pages_from"] <= i["pages_to"] for i in items(result))


def test_more_subjects_than_slots_still_covers_everything():
    books = [book(s["slug"], 50, s) for s in (CIVIL, CRIMINAL, COMMERCE, FIQH, ADP)]
    result = plan(books, days=4)  # 1 study day, 3 review days
    assert result["summary"]["study_days"] == 1
    assert_covers_every_page(result, books)


def test_no_books_gives_an_empty_plan():
    result = plan([])
    assert result["summary"]["total_pages"] == 0
    assert items(result) == []
    assert result["summary"]["pages_per_day"] == 0
    assert result["review"][0]["task"] == "جمع‌بندی و تست"


# --- interleaving and weights ------------------------------------------------------------------
def test_at_most_two_subjects_a_day_and_round_robin():
    books = [book("m", 400), book("j", 400, CRIMINAL), book("t", 400, COMMERCE)]
    result = plan(books, days=40)
    for day in result["days"]:
        assert len({i["subject"]["id"] for i in day["items"]}) <= 2
    # Interleaved: every subject shows up in the first week, not one subject after another.
    first_week = {i["subject"]["id"] for d in result["days"][:7] for i in d["items"]}
    assert first_week == {1, 2, 3}
    assert_covers_every_page(result, books)


def test_heavier_subjects_get_more_study_time():
    books = [book("m", 600), book("f", 600, FIQH)]
    result = plan(books, days=40, weights={CIVIL["id"]: 4, FIQH["id"]: 1})
    days_with = Counter(i["subject"]["id"] for d in result["days"] for i in d["items"])
    assert days_with[CIVIL["id"]] > 2 * days_with[FIQH["id"]]
    # Same pages, more days → slower pace for the heavier subject.
    pace = {
        sid: sum(
            i["pages_to"] - i["pages_from"] + 1 for i in items(result) if i["subject"]["id"] == sid
        )
        / days_with[sid]
        for sid in days_with
    }
    assert 2 * pace[CIVIL["id"]] < pace[FIQH["id"]]
    assert_covers_every_page(result, books)


def test_unweighted_subjects_default_to_one():
    books = [book("m", 300), book("f", 300, FIQH)]
    result = plan(books, days=30, weights={})
    days_with = Counter(i["subject"]["id"] for d in result["days"] for i in d["items"])
    assert abs(days_with[CIVIL["id"]] - days_with[FIQH["id"]]) <= 1


def test_heaviest_subject_is_reviewed_first_and_last_day_is_final_review():
    books = [book("f", 300, FIQH), book("m", 300)]
    result = plan(books, days=34, weights={CIVIL["id"]: 4})
    tasks = [r["task"] for r in result["review"]]
    assert tasks[0] == "جمع‌بندی و تست حقوق مدنی"
    assert tasks[1] == "جمع‌بندی و تست متون فقه"
    assert tasks[-1] == "مرور نهایی همه دروس"


# --- hours per day -----------------------------------------------------------------------------
def test_task_says_fast_study_when_the_plan_is_overloaded():
    light = plan([book("a", 300)], days=34, hours=6)  # ~11 pages/day, capacity 72
    assert {i["task"] for i in items(light)} == {TASK_STUDY}
    heavy = plan([book("a", 3000)], days=34, hours=2)  # ~104 pages/day, capacity 24
    assert {i["task"] for i in items(heavy)} == {TASK_FAST_STUDY}
    assert heavy["summary"]["pages_per_day"] == 104
    assert_covers_every_page(heavy, [book("a", 3000)])


# --- helpers -----------------------------------------------------------------------------------
def test_apportion_respects_minimum_cap_and_total():
    assert apportion(10, [300, 100], [999, 999]) == [7, 3]
    assert apportion(4, [1000, 1], [999, 999]) == [3, 1]  # every subject gets ≥ 1 slot
    assert apportion(10, [5, 5], [2, 999]) == [2, 5]  # capped by pages
    assert sum(apportion(57, [3, 7, 11], [999] * 3)) == 57


def test_interleave_spreads_slots():
    assert interleave([2, 2]) == [0, 1, 0, 1]
    seq = interleave([3, 1])
    assert sorted(seq) == [0, 0, 0, 1] and seq[0] == 0 and seq[-1] == 0
