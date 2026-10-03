"""Payment flow: start a payment for an order and handle the gateway callback.

* Every status change goes through ``set_status`` (writes a ``PaymentLog`` row).
* ``handle_callback`` is idempotent and race-safe: the payment row is locked, a PAID payment is
  never verified again, and the amount always comes from our record (never the query string).
* Toman → Rial happens here (``to_rial``), the gateways only see Rial.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.core.money import to_rial

from ..models import Payment, PaymentLog
from .gateway import GatewayError, get_gateway

logger = logging.getLogger(__name__)

FINAL_STATUSES = (Payment.Status.PAID, Payment.Status.FAILED, Payment.Status.CANCELLED)
CALLBACK_PATH = "/payments/zarinpal/callback/"

OUTCOME_PAID = "paid"
OUTCOME_FAILED = "failed"
OUTCOME_CANCELLED = "cancelled"
OUTCOME_UNKNOWN = "unknown"


class PaymentNotAllowed(Exception):
    def __init__(self, message: str = "این سفارش قابل پرداخت نیست."):
        super().__init__(message)
        self.message = message


class PaymentNotFound(Exception):
    pass


def log_event(payment: Payment, event: str, data: dict | None = None) -> PaymentLog:
    """A ``PaymentLog`` row that does not change the status."""
    return PaymentLog.objects.create(
        payment=payment,
        event=event,
        from_status=payment.status,
        to_status=payment.status,
        data=data or {},
    )


def set_status(
    payment: Payment, to: str, event: str, data: dict | None = None, **fields
) -> Payment:
    """Change ``payment.status`` (plus any ``fields``), save, and write a ``PaymentLog`` row."""
    from_status = payment.status if payment.pk else ""
    payment.status = to
    for name, value in fields.items():
        setattr(payment, name, value)
    if payment.pk:
        payment.save(update_fields=["status", "updated_at", *fields.keys()])
    else:
        payment.save()
    PaymentLog.objects.create(
        payment=payment, event=event, from_status=from_status, to_status=to, data=data or {}
    )
    return payment


def callback_url() -> str:
    return settings.PUBLIC_API_URL.rstrip("/") + CALLBACK_PATH


def start_payment(order) -> str:
    """Open a gateway payment for a ``PENDING_PAYMENT`` order; returns the URL to redirect to.

    Raises ``PaymentNotAllowed`` or ``GatewayError`` (the payment is then FAILED; the order stays
    pending so the customer can retry).
    """
    from apps.orders.models import Order

    if order.status != Order.Status.PENDING_PAYMENT or order.total <= 0:
        raise PaymentNotAllowed()
    gateway = get_gateway()
    payment = set_status(
        Payment(order=order, gateway=gateway.code, amount_rial=to_rial(order.total)),
        Payment.Status.INITIATED,
        "created",
        {"total_toman": order.total},
    )
    try:
        result = gateway.request(
            amount_rial=payment.amount_rial,
            description=f"سفارش {order.number} — کتاب دادرُز",
            callback_url=callback_url(),
            mobile=getattr(order.user, "phone", "") or "",
            order_number=order.number,
        )
    except GatewayError as exc:
        set_status(
            payment,
            Payment.Status.FAILED,
            "request_failed",
            {"details": exc.details},
            error=(exc.details or exc.message)[:300],
            raw_request=exc.raw or {},
        )
        raise
    set_status(
        payment,
        Payment.Status.REDIRECTED,
        "redirected",
        {"authority": result.authority},
        authority=result.authority,
        raw_request=result.raw,
    )
    return result.redirect_url


# --- order state (worker B's apps.orders.services.state), imported lazily ----------------------


def _mark_paid(order, payment) -> bool:
    from apps.orders.services.state import mark_paid

    return mark_paid(order, payment=payment)


def _keep_order_payable(payment: Payment, note: str) -> None:
    """A cancelled or declined attempt leaves the order PENDING_PAYMENT so the customer can retry
    (``POST /orders/<number>/pay/``); unpaid orders are cancelled later by ``expire_unpaid``."""
    log_event(payment, "order_left_payable", {"note": note})


def _outcome_for_final(payment: Payment) -> str:
    if payment.status == Payment.Status.PAID or payment.order.is_paid:
        return OUTCOME_PAID
    if payment.status == Payment.Status.CANCELLED:
        return OUTCOME_CANCELLED
    return OUTCOME_FAILED


def handle_callback(authority: str, status_param: str):
    """Process the gateway's return. Returns ``(order, outcome)``; outcome is one of
    ``paid | failed | cancelled | unknown``. Raises ``PaymentNotFound``."""
    if not authority:
        raise PaymentNotFound
    with transaction.atomic():
        try:
            payment = (
                Payment.objects.select_for_update()
                .select_related("order", "order__user")
                .get(authority=authority)
            )
        except Payment.DoesNotExist:
            raise PaymentNotFound from None
        order = payment.order
        log_event(payment, "callback", {"Authority": authority, "Status": status_param})

        if payment.status in FINAL_STATUSES:
            return order, _outcome_for_final(payment)

        if status_param != "OK":
            set_status(payment, Payment.Status.CANCELLED, "cancelled", {"Status": status_param})
            _keep_order_payable(payment, "انصراف از پرداخت در درگاه")
            return order, OUTCOME_CANCELLED

        result = get_gateway(payment.gateway).verify(authority, payment.amount_rial)

        if result.ok:
            if (
                Payment.objects.filter(order=order, status=Payment.Status.PAID)
                .exclude(pk=payment.pk)
                .exists()
            ):
                # The order was already paid by another attempt: this money must be refunded.
                logger.error("duplicate payment %s for order %s", payment.pk, order.number)
                set_status(
                    payment,
                    Payment.Status.FAILED,
                    "duplicate_paid",
                    {"ref_id": result.ref_id},
                    error="پرداخت تکراری؛ نیاز به بازگشت وجه",
                    ref_id=result.ref_id,
                    card_pan=result.card_pan,
                    raw_verify=result.raw,
                    verified_at=timezone.now(),
                )
                return order, OUTCOME_PAID
            set_status(
                payment,
                Payment.Status.PAID,
                "verified",
                {"ref_id": result.ref_id, "already_verified": result.already_verified},
                ref_id=result.ref_id,
                card_pan=result.card_pan,
                raw_verify=result.raw,
                verified_at=timezone.now(),
                error="",
            )
            _mark_paid(order, payment)
            return order, OUTCOME_PAID

        if result.unknown:
            payment.error = result.error[:300]
            payment.save(update_fields=["error", "updated_at"])
            log_event(payment, "verify_error", {"error": result.error})
            return order, OUTCOME_UNKNOWN

        set_status(
            payment,
            Payment.Status.FAILED,
            "verify_failed",
            {"error": result.error},
            error=result.error[:300],
            raw_verify=result.raw,
        )
        _keep_order_payable(payment, "پرداخت در درگاه تأیید نشد")
        return order, OUTCOME_FAILED
