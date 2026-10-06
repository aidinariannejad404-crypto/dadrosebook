"""Review loop (ه۷): ask «این کتاب برای آزمون شما چقدر کمک کرد؟» at the right moment.

A user/book pair becomes eligible (one ``ReviewPrompt`` row, ever) when either
* an order line of the book was delivered ``REVIEW_PROMPT_DELAY_DAYS`` (10) days ago — an
  ebook-only order is delivered the moment it is paid — or
* the reader reached ``READ_THRESHOLD`` (90%) of the book,
and the user has not reviewed the book. Only events of the last ``LOOKBACK_DAYS`` count, so
switching the feature on never messages years-old customers.

``scan()`` creates the rows and ``send_sms()`` texts each prompt at most once (and a user at most
once per ``SMS_GAP_DAYS``); both are safe to run again and again (Celery beat, daily).
"""

import datetime as dt
import logging

from django.conf import settings
from django.db import transaction
from django.db.models import Exists, F, OuterRef, Q
from django.utils import timezone

from apps.core.services.sms_templates import render_sms
from apps.core.sms_catalog import REVIEW_REQUEST

from ..models import ReviewPrompt, StudyProfile

logger = logging.getLogger(__name__)

READ_THRESHOLD = 90
LOOKBACK_DAYS = 60
SMS_GAP_DAYS = 7
SMS_BATCH = 200


def delay_days() -> int:
    return int(getattr(settings, "REVIEW_PROMPT_DELAY_DAYS", 10))


def delivered_candidates(now: dt.datetime) -> set[tuple[int, int]]:
    from apps.orders.models import Order, OrderItem

    cutoff = now - dt.timedelta(days=delay_days())
    oldest = cutoff - dt.timedelta(days=LOOKBACK_DAYS)
    # Ebook-only orders are marked delivered when paid (``orders.services.state.mark_paid``).
    delivered = Q(
        order__status=Order.Status.DELIVERED,
        order__delivered_at__lte=cutoff,
        order__delivered_at__gte=oldest,
    )
    rows = (
        OrderItem.objects.filter(delivered, book__isnull=False)
        .values_list("order__user_id", "book_id")
        .distinct()
    )
    return set(rows)


def read_candidates(now: dt.datetime) -> set[tuple[int, int]]:
    from apps.reader.models import ReadingProgress

    rows = (
        ReadingProgress.objects.filter(
            total_pages__gt=0, updated_at__gte=now - dt.timedelta(days=LOOKBACK_DAYS)
        )
        .filter(page__gte=F("total_pages") * READ_THRESHOLD / 100)
        .values_list("user_id", "book_id")
    )
    return set(rows)


def scan(now: dt.datetime | None = None) -> int:
    """Create missing prompts; returns how many were created. Idempotent."""
    from apps.reviews.models import Review

    now = now or timezone.now()
    delivered = delivered_candidates(now)
    read = read_candidates(now)
    pairs = delivered | read
    if not pairs:
        return 0
    user_ids = {u for u, _ in pairs}
    reviewed = set(Review.objects.filter(user_id__in=user_ids).values_list("user_id", "book_id"))
    existing = set(
        ReviewPrompt.objects.filter(user_id__in=user_ids).values_list("user_id", "book_id")
    )
    new = [
        ReviewPrompt(
            user_id=u,
            book_id=b,
            reason=ReviewPrompt.Reason.READ if (u, b) in read else ReviewPrompt.Reason.DELIVERED,
        )
        for u, b in sorted(pairs - reviewed - existing)
    ]
    ReviewPrompt.objects.bulk_create(new, ignore_conflicts=True)
    return len(new)


def mark_answered(user, book, now: dt.datetime | None = None) -> int:
    return ReviewPrompt.objects.filter(user=user, book=book, answered_at__isnull=True).update(
        answered_at=now or timezone.now()
    )


def pending_prompts(user, limit: int = 3) -> list[ReviewPrompt]:
    """Open prompts for the account page; prompts of books reviewed meanwhile are closed."""
    from apps.reviews.models import Review

    reviewed = Review.objects.filter(user=OuterRef("user"), book=OuterRef("book"))
    qs = ReviewPrompt.objects.filter(user=user, dismissed_at__isnull=True, answered_at__isnull=True)
    stale = list(qs.filter(Exists(reviewed)).values_list("pk", flat=True))
    if stale:
        ReviewPrompt.objects.filter(pk__in=stale).update(answered_at=timezone.now())
    return list(
        qs.exclude(pk__in=stale)
        .filter(book__is_active=True)
        .select_related("book")
        .prefetch_related("book__subjects", "book__exam_types")
        .order_by("-created_at", "-id")[:limit]
    )


def dismiss(user, prompt_id: int) -> bool:
    return bool(
        ReviewPrompt.objects.filter(pk=prompt_id, user=user, dismissed_at__isnull=True).update(
            dismissed_at=timezone.now()
        )
    )


def sms_text(prompt: ReviewPrompt) -> str | None:
    book = prompt.book
    exam = book.exam_types.order_by("order", "id").first()
    return render_sms(
        REVIEW_REQUEST,
        book=book.title,
        exam=exam.name if exam else "",
        link=f"{settings.SITE_URL.rstrip('/')}/product/{book.slug}?review=1#reviews",
    )


def send_sms(now: dt.datetime | None = None, *, force: bool = False) -> int:
    """Text open prompts once each (only when ``REVIEW_PROMPT_SMS_ENABLED``); returns the count."""
    from apps.accounts.tasks import send_sms as send_sms_task
    from apps.reviews.models import Review

    if not force and not getattr(settings, "REVIEW_PROMPT_SMS_ENABLED", False):
        return 0
    now = now or timezone.now()
    opted_out = StudyProfile.objects.filter(user=OuterRef("user"), review_sms=False)
    reviewed = Review.objects.filter(user=OuterRef("user"), book=OuterRef("book"))
    recently_texted = ReviewPrompt.objects.filter(
        user=OuterRef("user"), sms_sent_at__gte=now - dt.timedelta(days=SMS_GAP_DAYS)
    )
    candidates = list(
        ReviewPrompt.objects.filter(
            sms_sent_at__isnull=True,
            dismissed_at__isnull=True,
            answered_at__isnull=True,
            user__is_active=True,
            book__is_active=True,
        )
        .exclude(Exists(opted_out))
        .exclude(Exists(reviewed))
        .exclude(Exists(recently_texted))
        .order_by("created_at", "id")
        .values_list("pk", flat=True)[:SMS_BATCH]
    )
    sent, texted_users = 0, set()
    for pk in candidates:
        with transaction.atomic():
            prompt = (
                ReviewPrompt.objects.select_for_update(skip_locked=True, of=("self",))
                .select_related("user", "book")
                .filter(pk=pk, sms_sent_at__isnull=True)
                .first()
            )
            if prompt is None or prompt.user_id in texted_users:
                continue
            text = sms_text(prompt)
            if text is None:  # staff turned the template off
                return sent
            ReviewPrompt.objects.filter(pk=prompt.pk).update(sms_sent_at=now)
            phone = prompt.user.phone
            transaction.on_commit(lambda p=phone, t=text: send_sms_task.delay(p, t))
            texted_users.add(prompt.user_id)
            sent += 1
    return sent
