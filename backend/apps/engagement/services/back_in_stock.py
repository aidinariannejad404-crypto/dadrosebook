"""«موجود شد خبرم کن» (``docs/api-contract-phase-2.md`` → Back-in-stock)."""

import logging
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.phone import normalize_phone, validate_phone
from apps.accounts.sms import get_sms_provider
from apps.catalog.models import BookVariant

from ..models import BackInStockRequest

logger = logging.getLogger(__name__)

IN_STOCK = "in_stock"
UNAVAILABLE = "unavailable"
MESSAGES = {
    IN_STOCK: "این نسخه هم‌اکنون موجود است و می‌توانید آن را بخرید.",
    UNAVAILABLE: "این نسخه دیگر برای فروش عرضه نمی‌شود.",
}
CREATED_MESSAGE = "ثبت شد؛ وقتی این کتاب موجود شد با پیامک خبرتان می‌کنیم."
EXISTING_MESSAGE = "درخواست شما قبلاً ثبت شده است؛ وقتی موجود شد با پیامک خبرتان می‌کنیم."
CONVERSION_WINDOW_DAYS = 30


class BackInStockError(Exception):
    def __init__(self, code: str, detail: str | None = None):
        self.code = code
        self.detail = detail or MESSAGES[code]
        super().__init__(self.detail)


def _linkable_user(user):
    return user if user is not None and getattr(user, "is_authenticated", False) else None


def request_back_in_stock(
    variant: BookVariant, phone: str, user=None, source: str = ""
) -> tuple[BackInStockRequest, bool]:
    """Register a pending request; idempotent per (variant, phone) while pending.

    Raises ``django.core.exceptions.ValidationError`` for an invalid phone and
    ``BackInStockError`` (``unavailable`` / ``in_stock``) for variants that can't take requests.
    """
    phone = normalize_phone(phone)
    validate_phone(phone)
    if not variant.is_active or not variant.book.is_active:
        raise BackInStockError(UNAVAILABLE)
    if variant.in_stock:
        raise BackInStockError(IN_STOCK)
    if source not in BackInStockRequest.Source.values:
        source = ""
    user = _linkable_user(user)
    pending = BackInStockRequest.objects.filter(
        variant=variant, phone=phone, status=BackInStockRequest.Status.PENDING
    )
    existing = pending.first()
    if existing is None:
        try:
            with transaction.atomic():
                obj = BackInStockRequest.objects.create(
                    variant=variant, phone=phone, user=user, source=source
                )
            return obj, True
        except IntegrityError:  # a concurrent identical request won the race
            existing = pending.get()
    if user is not None and existing.user_id is None:
        existing.user = user
        existing.save(update_fields=["user", "updated_at"])
    return existing, False


def product_url(variant: BookVariant) -> str:
    base = getattr(settings, "SITE_URL", "http://localhost:3000").rstrip("/")
    return f"{base}/product/{variant.book.slug}"


def restock_message(variant: BookVariant) -> str:
    return (
        f"دادرُز: «{variant.book.title}» ({variant.get_type_display()}) موجود شد. "
        f"برای خرید: {product_url(variant)}"
    )


def notify_requests(requests) -> int:
    """SMS each pending request in ``requests`` and mark it NOTIFIED; returns the number sent.

    Rows are locked (``skip_locked``) so two workers never SMS the same request; a failed send
    leaves the request pending for the next attempt.
    """
    provider = get_sms_provider()
    sent = 0
    with transaction.atomic():
        rows = (
            requests.filter(status=BackInStockRequest.Status.PENDING)
            .select_related("variant__book")
            .select_for_update(skip_locked=True, of=("self",))
        )
        for request in rows:
            try:
                provider.send(request.phone, restock_message(request.variant))
            except Exception:  # one failing number must not stop the rest
                logger.exception("back-in-stock SMS failed for request %s", request.pk)
                continue
            request.status = BackInStockRequest.Status.NOTIFIED
            request.notified_at = timezone.now()
            request.save(update_fields=["status", "notified_at", "updated_at"])
            sent += 1
    return sent


def notify_variant_restocked(variant_id: int) -> int:
    """Notify every pending request of a variant that is in stock now; returns the number sent."""
    variant = BookVariant.objects.select_related("book").filter(pk=variant_id).first()
    if variant is None or not variant.in_stock or not variant.is_active:
        return 0
    return notify_requests(BackInStockRequest.objects.filter(variant_id=variant_id))


def has_pending_requests(variant_id: int) -> bool:
    return BackInStockRequest.objects.filter(
        variant_id=variant_id, status=BackInStockRequest.Status.PENDING
    ).exists()


def mark_converted(variant_id: int, phone: str | None = None, user=None) -> int:
    """Phase 3: the phone/user bought the variant → stamp ``converted_at`` on requests notified
    within the last 30 days. Returns the number of requests updated."""
    who = Q()
    phone = normalize_phone(phone) if phone else ""
    if phone:
        who |= Q(phone=phone)
    user = _linkable_user(user)
    if user is not None:
        who |= Q(user=user)
    if not who:
        return 0
    since = timezone.now() - timedelta(days=CONVERSION_WINDOW_DAYS)
    return (
        BackInStockRequest.objects.filter(who, variant_id=variant_id)
        .filter(
            status=BackInStockRequest.Status.NOTIFIED,
            notified_at__gte=since,
            converted_at__isnull=True,
        )
        .update(converted_at=timezone.now(), updated_at=timezone.now())
    )
