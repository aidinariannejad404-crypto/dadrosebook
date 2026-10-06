"""PF-11: support tickets.

* Customers (logged in or not) open a ticket from /support, the FAQ or the account; it gets an
  8-digit tracking code. Guests check status and reply with phone + tracking code.
* Staff reply in the admin; the customer gets the ticket-reply SMS (``core.sms_catalog``) through
  the store SMS path, which also copies it into their inbox.
"""

import logging
import secrets

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.phone import normalize_phone, validate_phone
from apps.core.normalize import normalize_persian

from ..models import SupportTicket, TicketMessage

logger = logging.getLogger(__name__)

S = SupportTicket.Status
CODE_LENGTH = 8
BODY_MIN = 10
BODY_MAX = 4000

MSG_TOPIC = "موضوع درخواست را انتخاب کنید."
MSG_BODY_SHORT = f"شرح درخواست را کامل‌تر بنویسید (دست‌کم {BODY_MIN} نویسه)."
MSG_BODY_LONG = "شرح درخواست طولانی است."
MSG_ORDER = "سفارشی با این شماره برای این شماره موبایل پیدا نشد."
MSG_BOOK = "کتاب انتخاب‌شده پیدا نشد."
MSG_CLOSED = "این درخواست بسته شده است؛ اگر مشکل باقی است درخواست تازه ثبت کنید."


class TicketError(ValueError):
    def __init__(self, message: str, field: str = "detail"):
        super().__init__(message)
        self.message = message
        self.field = field


def clean_code(code: str | None) -> str:
    return "".join(ch for ch in normalize_persian(code or "") if ch.isdigit())


def _new_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(CODE_LENGTH))


def _clean_body(body: str | None) -> str:
    body = (body or "").strip()
    if len(body) < BODY_MIN:
        raise TicketError(MSG_BODY_SHORT, "body")
    if len(body) > BODY_MAX:
        raise TicketError(MSG_BODY_LONG, "body")
    return body


def _clean_phone(phone: str | None) -> str:
    phone = normalize_phone(phone)
    try:
        validate_phone(phone)
    except ValidationError as exc:
        raise TicketError(exc.messages[0], "phone") from exc
    return phone


def _find_order(number: str, phone: str):
    from apps.orders.models import Order

    number = normalize_persian(number or "").strip().upper()
    if not number:
        return None
    order = Order.objects.filter(number__iexact=number, user__phone=phone).first()
    if order is None:
        raise TicketError(MSG_ORDER, "order_number")
    return order


def _find_book(slug: str | None):
    from apps.catalog.models import Book

    if not slug:
        return None
    book = Book.objects.filter(slug=slug).first()
    if book is None:
        raise TicketError(MSG_BOOK, "book")
    return book


def create_ticket(
    *,
    user=None,
    phone: str | None = None,
    name: str = "",
    topic: str,
    subject: str = "",
    body: str,
    order_number: str = "",
    book_slug: str = "",
    source: str = "",
) -> SupportTicket:
    """Open a ticket. A logged-in customer's own phone is used. Raises ``TicketError``."""
    if topic not in SupportTicket.Topic.values:
        raise TicketError(MSG_TOPIC, "topic")
    phone = user.phone if user is not None else _clean_phone(phone)
    body = _clean_body(body)
    order = _find_order(order_number, phone)
    book = _find_book(book_slug)
    subject = (subject or "").strip()[:150] or SupportTicket.Topic(topic).label
    now = timezone.now()
    for _ in range(5):
        try:
            with transaction.atomic():
                ticket = SupportTicket.objects.create(
                    tracking_code=_new_code(),
                    user=user,
                    phone=phone,
                    name=(name or (user.get_full_name() if user else "")).strip()[:100],
                    topic=topic,
                    subject=subject,
                    order=order,
                    book=book,
                    source=(source or "")[:40],
                    last_customer_at=now,
                )
                TicketMessage.objects.create(
                    ticket=ticket, author=TicketMessage.Author.CUSTOMER, body=body
                )
            return ticket
        except IntegrityError:  # tracking code collision: try another
            continue
    raise RuntimeError("could not allocate a tracking code")


def user_tickets(user):
    return SupportTicket.objects.filter(user=user).order_by("-created_at")


def user_ticket(user, code: str) -> SupportTicket | None:
    return SupportTicket.objects.filter(user=user, tracking_code=clean_code(code)).first()


def find_for_guest(phone: str | None, code: str | None) -> SupportTicket | None:
    """Phone and tracking code must both match (no hint which one was wrong)."""
    code = clean_code(code)
    phone = normalize_phone(phone)
    if len(code) != CODE_LENGTH or not phone:
        return None
    return SupportTicket.objects.filter(tracking_code=code, phone=phone).first()


def customer_reply(ticket: SupportTicket, body: str) -> TicketMessage:
    """The customer adds a message; the ticket goes back to «در انتظار پاسخ»."""
    if ticket.status == S.CLOSED:
        raise TicketError(MSG_CLOSED)
    body = _clean_body(body)
    with transaction.atomic():
        msg = TicketMessage.objects.create(
            ticket=ticket, author=TicketMessage.Author.CUSTOMER, body=body
        )
        ticket.status = S.OPEN
        ticket.last_customer_at = timezone.now()
        ticket.save(update_fields=["status", "last_customer_at", "updated_at"])
    return msg


def ticket_path(ticket: SupportTicket) -> str:
    """Where the customer reads the answer: the account page, or the guest status page."""
    if ticket.user_id:
        return f"/account/support/{ticket.tracking_code}"
    return f"/support/track?code={ticket.tracking_code}"


def staff_reply(
    ticket: SupportTicket, body: str, *, staff_user=None, close: bool = False
) -> TicketMessage:
    """Answer the customer (status «پاسخ داده شد», or «بسته شد» with ``close``) and SMS them."""
    body = (body or "").strip()
    if not body:
        raise TicketError("متن پاسخ خالی است.", "body")
    now = timezone.now()
    with transaction.atomic():
        msg = TicketMessage.objects.create(
            ticket=ticket, author=TicketMessage.Author.STAFF, staff_user=staff_user, body=body
        )
        ticket.status = S.CLOSED if close else S.ANSWERED
        ticket.last_staff_at = now
        ticket.closed_at = now if close else None
        ticket.save(update_fields=["status", "last_staff_at", "closed_at", "updated_at"])
        _notify_reply(ticket)
    return msg


def _notify_reply(ticket: SupportTicket) -> None:
    from apps.core.services.sms_templates import render_sms
    from apps.core.sms_catalog import TICKET_REPLY

    path = ticket_path(ticket)
    site = getattr(settings, "SITE_URL", "").rstrip("/")
    text = render_sms(TICKET_REPLY, code=ticket.tracking_code, link=f"{site}{path}")
    if not text:
        return
    phone = ticket.phone

    def send():
        try:
            from apps.accounts.tasks import send_sms

            send_sms.delay(phone, text, kind=TICKET_REPLY, link=path)
        except Exception:
            logger.exception("ticket reply SMS to %s failed", phone)

    transaction.on_commit(send)


def set_status(ticket: SupportTicket, status: str) -> SupportTicket:
    ticket.status = status
    ticket.closed_at = timezone.now() if status == S.CLOSED else None
    ticket.save(update_fields=["status", "closed_at", "updated_at"])
    return ticket


def open_count() -> int:
    """Tickets waiting on staff (for the work queue and the sidebar badge)."""
    return SupportTicket.objects.filter(status=S.OPEN).count()


def open_badge(request) -> str:
    from apps.core.money import to_persian_digits

    n = open_count()
    return to_persian_digits(n) if n else ""
