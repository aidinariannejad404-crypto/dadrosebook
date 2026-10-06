import datetime as dt

import pytest
from django.utils import timezone

from apps.orders.models import Order, OrderItem
from apps.reader.models import ReadingProgress
from apps.reviews.services.reviews import submit_review
from apps.study.models import ReviewPrompt, StudyProfile
from apps.study.services import review_prompts as svc
from apps.study.tasks import review_prompts as review_prompts_task

NOW = dt.datetime(2026, 10, 5, 9, 0, tzinfo=dt.UTC)


def delivered_order(user, book, *, days_ago, status=Order.Status.DELIVERED):
    when = NOW - dt.timedelta(days=days_ago)
    order = Order.objects.create(
        user=user,
        status=status,
        paid_at=when - dt.timedelta(days=3),
        delivered_at=when if status == Order.Status.DELIVERED else None,
        needs_shipping=True,
        total=1,
    )
    OrderItem.objects.create(
        order=order,
        book=book,
        title=book.title,
        variant_type="PRINT",
        list_price=1,
        unit_price=1,
        quantity=1,
        line_total=1,
    )
    return order


@pytest.fixture(autouse=True)
def sms_on(settings):
    settings.REVIEW_PROMPT_SMS_ENABLED = True
    settings.REVIEW_PROMPT_DELAY_DAYS = 10


def test_delivered_ten_days_ago_is_eligible(user, book, book2):
    delivered_order(user, book, days_ago=10)
    delivered_order(user, book2, days_ago=9)  # too early
    assert svc.scan(NOW) == 1
    prompt = ReviewPrompt.objects.get()
    assert (prompt.book_id, prompt.reason) == (book.pk, ReviewPrompt.Reason.DELIVERED)


def test_shipped_but_not_delivered_or_too_old_is_not_eligible(user, book, book2):
    delivered_order(user, book, days_ago=20, status=Order.Status.SHIPPED)
    delivered_order(user, book2, days_ago=10 + svc.LOOKBACK_DAYS + 1)
    assert svc.scan(NOW) == 0


def test_ninety_percent_read_is_eligible(user, book, book2):
    ReadingProgress.objects.create(user=user, book=book, page=180, total_pages=200)
    ReadingProgress.objects.create(user=user, book=book2, page=170, total_pages=200)
    assert svc.scan(timezone.now()) == 1  # progress rows carry the real clock
    assert ReviewPrompt.objects.get().reason == ReviewPrompt.Reason.READ


def test_already_reviewed_books_are_skipped_and_scan_is_idempotent(user, book, book2):
    delivered_order(user, book, days_ago=12)
    delivered_order(user, book2, days_ago=12)
    submit_review(user, book2, 5)
    assert svc.scan(NOW) == 1
    assert svc.scan(NOW) == 0
    assert ReviewPrompt.objects.count() == 1


def test_pending_prompts_close_after_a_review_and_on_dismiss(user, book, book2):
    delivered_order(user, book, days_ago=12)
    delivered_order(user, book2, days_ago=12)
    svc.scan(NOW)
    assert {p.book_id for p in svc.pending_prompts(user)} == {book.pk, book2.pk}
    submit_review(user, book, 4)
    assert [p.book_id for p in svc.pending_prompts(user)] == [book2.pk]
    prompt = ReviewPrompt.objects.get(book=book2)
    assert svc.dismiss(user, prompt.pk)
    assert not svc.dismiss(user, prompt.pk)
    assert svc.pending_prompts(user) == []


def test_sms_once_per_prompt_and_once_a_week_per_user(
    user, other_user, book, book2, sms_outbox, django_capture_on_commit_callbacks
):
    delivered_order(user, book, days_ago=12)
    delivered_order(user, book2, days_ago=12)
    delivered_order(other_user, book, days_ago=12)
    StudyProfile.objects.create(user=other_user, review_sms=False)  # opted out
    svc.scan(NOW)
    with django_capture_on_commit_callbacks(execute=True):
        assert svc.send_sms(NOW) == 1
        assert svc.send_sms(NOW) == 0  # second prompt waits a week
        assert svc.send_sms(NOW + dt.timedelta(days=8)) == 1
        assert svc.send_sms(NOW + dt.timedelta(days=20)) == 0
    assert [p for p, _ in sms_outbox] == [user.phone, user.phone]
    assert "چقدر کمک کرد" in sms_outbox[0][1]


def test_sms_off_by_default(settings, user, book, sms_outbox):
    settings.REVIEW_PROMPT_SMS_ENABLED = False
    delivered_order(user, book, days_ago=12)
    svc.scan(NOW)
    assert svc.send_sms(NOW) == 0


def test_beat_task_runs_twice_without_duplicates(user, book, sms_outbox, monkeypatch):
    delivered_order(user, book, days_ago=12)
    monkeypatch.setattr(timezone, "now", lambda: NOW)
    first = review_prompts_task()
    second = review_prompts_task()
    assert first == {"created": 1, "sms": 1}
    assert second == {"created": 0, "sms": 0}
