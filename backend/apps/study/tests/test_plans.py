import datetime as dt

import pytest

from apps.catalog.models import ExamEvent
from apps.leads.services.leads import create_study_plan_lead
from apps.reader.models import ReadingProgress
from apps.study.models import StudyPlan
from apps.study.services import plans

TODAY = dt.date(2026, 10, 5)


def at(day: dt.date, hour: int = 9) -> dt.datetime:
    """A moment on that Tehran day (09:00 UTC = 12:30 Tehran)."""
    return dt.datetime(day.year, day.month, day.day, hour, 0, tzinfo=dt.UTC)


@pytest.fixture
def exam(kanoon):
    return ExamEvent.objects.create(
        name="آزمون کانون ۱۴۰۵", exam_type=kanoon, date=TODAY + dt.timedelta(days=30)
    )


@pytest.fixture
def lead(user, book, book2, civil, commerce, kanoon, exam):
    return create_study_plan_lead(
        phone=user.phone,
        exam_type=kanoon,
        subjects=[civil, commerce],
        books=[book, book2],
        hours_per_day=4,
        consent=True,
        today=TODAY,
    )


def test_lead_plan_links_to_the_same_phone_only(user, other_user, lead):
    with pytest.raises(plans.PlanError) as exc:
        plans.create_from_lead(other_user, lead)
    assert exc.value.code == "phone_mismatch"

    plan = plans.create_from_lead(user, lead)
    assert plan.exam_date == TODAY + dt.timedelta(days=30)
    books = {b.slug: b for b in plan.books.all()}
    assert {b.total_pages for b in books.values()} == {200, 100}
    assert all(b.book_id for b in books.values())
    # linking again returns the same plan; the lead snapshot is untouched
    assert plans.create_from_lead(user, lead).pk == plan.pk
    lead.refresh_from_db()
    assert lead.plan["days"] == plan.days


def test_new_plan_deactivates_the_old_one(user, book, book2, kanoon, exam):
    first = plans.create_from_books(user, [book], exam_type=kanoon, today=TODAY)
    second = plans.create_from_books(user, [book, book2], exam_type=kanoon, today=TODAY)
    first.refresh_from_db()
    assert not first.is_active
    assert plans.active_plan(user).pk == second.pk


def test_today_card_and_check_off(user, lead):
    plan = plans.create_from_lead(user, lead)
    card = plans.today_card(plan, TODAY)
    assert card["day"]["date"] == TODAY.isoformat()
    item = card["day"]["items"][0]
    assert item["done"] is False
    plans.set_item_done(plan, item["book_slug"], item["pages_from"], item["pages_to"], True)
    card = plans.today_card(plan, TODAY)
    assert card["day"]["items"][0]["done"] is True
    # unticking moves progress back to the item's start
    plans.set_item_done(plan, item["book_slug"], item["pages_from"], item["pages_to"], False)
    entry = plan.books.get(slug=item["book_slug"])
    assert entry.pages_done == item["pages_from"] - 1


def test_reader_progress_moves_plan_forward_scaled(user, lead, book):
    plan = plans.create_from_lead(user, lead)
    # the ebook has 400 virtual pages for the 200-page print book: page 100 = print page 50
    ReadingProgress.objects.create(user=user, book=book, page=100, total_pages=400)
    plans.sync_reader_progress(plan)
    assert plan.books.get(book=book).pages_done == 50
    # never backwards
    ReadingProgress.objects.filter(user=user, book=book).update(page=10)
    plans.sync_reader_progress(plan)
    assert plan.books.get(book=book).pages_done == 50


def test_behind_schedule_and_compress(user, lead):
    plan = plans.create_from_lead(user, lead)
    later = TODAY + dt.timedelta(days=5)
    status = plans.schedule_status(plan, later)
    assert status["behind_days"] == 5
    assert status["can_compress"]
    total = status["total_pages"]

    # the user read the first 30 pages of the first book
    first = plan.books.order_by("order").first()
    first.pages_done = 30
    first.save()

    plans.compress(plan, now=at(later))
    plan.refresh_from_db()
    assert plan.compressed_count == 1
    status = plans.schedule_status(plan, later)
    assert status["behind_days"] == 0
    assert not status["can_compress"]

    future = [d for d in plan.days if d["date"] >= later.isoformat()]
    past = [d for d in plan.days if d["date"] < later.isoformat()]
    assert len(past) == 5  # history kept
    assert future[0]["date"] == later.isoformat()
    # every unread page is planned exactly once, from where the user is
    planned = {}
    for day in future:
        for item in day["items"]:
            planned.setdefault(item["book_slug"], []).append((item["pages_from"], item["pages_to"]))
    ranges = sorted(planned[first.slug])
    assert ranges[0][0] == 31
    assert ranges[-1][1] == first.total_pages
    covered = sum(b - a + 1 for rs in planned.values() for a, b in rs)
    assert covered == total - 30
    last = max([d["date"] for d in plan.days] + [r["date"] for r in plan.review])
    assert last < plan.exam_date.isoformat()
    # old items that were moved say so
    payload = plans.plan_payload(plan, later)
    moved = [i for d in payload["days"][:5] for i in d["items"] if i["rescheduled"]]
    assert moved


def test_compress_refuses_when_too_late_or_done(user, lead):
    plan = plans.create_from_lead(user, lead)
    with pytest.raises(plans.PlanError) as exc:
        plans.compress(plan, now=at(plan.exam_date - dt.timedelta(days=1)))
    assert exc.value.code == "too_late"
    plan.books.update(pages_done=10_000)
    for b in plan.books.all():
        b.pages_done = b.total_pages
        b.save()
    with pytest.raises(plans.PlanError) as exc:
        plans.compress(plan, now=at(TODAY + dt.timedelta(days=3)))
    assert exc.value.code == "nothing_left"


def test_plan_without_exam_uses_its_own_end(user, book):
    plan = plans.create_from_books(user, [book], today=TODAY)
    assert plan.exam_date is None
    assert plans.plan_end(plan) == TODAY + dt.timedelta(days=30)
    plans.compress(plan, now=at(TODAY + dt.timedelta(days=10)))
    plan = StudyPlan.objects.get(pk=plan.pk)
    assert max(d["date"] for d in plan.days + plan.review) < "2026-11-04"
