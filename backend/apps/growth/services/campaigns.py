"""Exam-calendar campaigns (research item و۶).

* ``active_campaigns(now)`` — running campaigns (``starts_at <= now <= ends_at``, active).
* ``campaign_state(campaign, now)`` — ``upcoming`` / ``active`` / ``ended``.
* ``eligible_book_ids(campaign)`` — ``None`` means every book.
* ``eligible_books(campaign)`` — card queryset for the landing.
* ``auto_discount(lines, user, now)`` — the best running campaign discount for quote lines
  (``AutoDiscount`` or ``None``); the checkout quote calls it when no better code was entered.

A campaign's discount *rule* is an ``orders.DiscountCode`` (kind, value, cap, minimum, per-user
limit, subject/format scope); the campaign narrows it to its books/subjects and its own window, so
paid orders record it as a normal code (redemptions, reports, refunds all keep working).
"""

from dataclasses import dataclass

from django.db.models import Q
from django.utils import timezone

from ..models import Campaign

UPCOMING, ACTIVE, ENDED = "upcoming", "active", "ended"


@dataclass
class AutoDiscount:
    campaign: Campaign
    code: object  # orders.DiscountCode
    amount: int


def active_campaigns(now=None):
    now = now or timezone.now()
    return Campaign.objects.filter(is_active=True, starts_at__lte=now, ends_at__gte=now).order_by(
        "ends_at", "id"
    )


def campaign_state(campaign: Campaign, now=None) -> str:
    now = now or timezone.now()
    if now < campaign.starts_at:
        return UPCOMING
    if now > campaign.ends_at:
        return ENDED
    return ACTIVE


def eligible_book_ids(campaign: Campaign) -> set[int] | None:
    from apps.catalog.models import Book

    book_ids = set(campaign.books.values_list("id", flat=True))
    subject_ids = set(campaign.subjects.values_list("id", flat=True))
    if not book_ids and not subject_ids:
        return None
    if subject_ids:
        book_ids |= set(
            Book.objects.filter(subjects__in=subject_ids, is_active=True).values_list(
                "id", flat=True
            )
        )
    return book_ids


def eligible_books(campaign: Campaign, limit: int = 60):
    from apps.catalog.services.books import book_card_queryset

    qs = book_card_queryset()
    ids = eligible_book_ids(campaign)
    if ids is not None:
        qs = qs.filter(pk__in=ids)
    return qs.order_by("-sales_count", "id")[:limit]


def eligible_lines(campaign: Campaign, lines) -> list[dict]:
    ids = eligible_book_ids(campaign)
    lines = list(lines)
    if ids is None:
        return lines
    return [line for line in lines if line["book_id"] in ids]


def discount_for(campaign: Campaign, lines, user=None, now=None) -> AutoDiscount | None:
    """This campaign's discount on ``lines`` (``None`` when not running or not applicable)."""
    from apps.orders.services import discounts

    now = now or timezone.now()
    if not campaign.is_active or campaign_state(campaign, now) != ACTIVE:
        return None
    if campaign.discount_code_id is None:
        return None
    scoped = eligible_lines(campaign, lines)
    if not scoped:
        return None
    try:
        code, amount = discounts.validate(campaign.discount_code.code, scoped, user=user, now=now)
    except discounts.DiscountError:
        return None
    if amount <= 0:
        return None
    return AutoDiscount(campaign=campaign, code=code, amount=amount)


def auto_discount(lines, user=None, now=None) -> AutoDiscount | None:
    """The largest discount any running campaign gives these lines."""
    now = now or timezone.now()
    lines = list(lines)
    if not lines:
        return None
    best = None
    qs = active_campaigns(now).filter(discount_code__isnull=False).select_related("discount_code")
    for campaign in qs:
        found = discount_for(campaign, lines, user=user, now=now)
        if found and (best is None or found.amount > best.amount):
            best = found
    return best


def home_campaigns(now=None):
    return active_campaigns(now).filter(show_on_home=True)


def find_campaign(slug: str):
    return (
        Campaign.objects.filter(Q(slug=slug), is_active=True)
        .select_related("discount_code", "exam_event", "exam_event__exam_type")
        .first()
    )


def apply_auto_discount(lines, user, discount, discount_error, discount_obj, discount_amount):
    """Checkout-quote hook: pick the better of the entered code and the campaign discount.

    A campaign's own code typed by hand is rejected (it only works through its campaign scope).
    Returns ``(discount, discount_error, discount_obj, discount_amount)`` in the quote's shapes;
    ``discount["campaign"]`` (``{"title", "slug"}``) is present only when the campaign won.
    """
    from apps.orders.services import discounts

    if discount_obj is not None and Campaign.objects.filter(discount_code=discount_obj).exists():
        discount, discount_error, discount_obj, discount_amount = None, discounts.INVALID, None, 0
    auto = auto_discount(lines, user=user)
    if auto is None or (discount_obj is not None and discount_amount >= auto.amount):
        return discount, discount_error, discount_obj, discount_amount
    discount = {
        "code": auto.code.code,
        "amount": auto.amount,
        "label": f"{discounts.label_for(auto.code)} — {auto.campaign.title}",
        "campaign": {"title": auto.campaign.title, "slug": auto.campaign.slug},
    }
    return discount, discount_error, auto.code, auto.amount
