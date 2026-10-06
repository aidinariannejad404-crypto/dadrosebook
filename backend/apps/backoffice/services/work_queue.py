"""The "needs attention" list on the admin dashboard: counts with a link to the filtered list."""

import datetime as dt

from django.urls import reverse
from django.utils import timezone

from apps.catalog.models import Book, BookVariant, ExamEvent
from apps.catalog.services.completeness import annotate_completeness, complete_q
from apps.core.money import to_persian_digits
from apps.core.services.store_settings import get_store_settings
from apps.engagement.models import BackInStockRequest
from apps.orders.models import Order
from apps.reviews.models import Review

from .metrics import low_stock_variants

S = Order.Status


def _url(name: str, query: str = "") -> str:
    return reverse(f"admin:{name}") + (f"?{query}" if query else "")


def orders_to_prepare() -> int:
    return Order.objects.filter(status=S.PAID, needs_shipping=True).count()


def orders_to_ship() -> int:
    return Order.objects.filter(status=S.PROCESSING).count()


def shipped_overdue(days: int, *, now=None) -> int:
    now = now or timezone.now()
    return Order.objects.filter(
        status=S.SHIPPED, shipped_at__lt=now - dt.timedelta(days=days)
    ).count()


def open_returns() -> int:
    """Returns waiting on staff: new requests and approved ones whose money isn't back yet."""
    from apps.orders.models import ReturnRequest

    R = ReturnRequest.Status
    return ReturnRequest.objects.filter(status__in=(R.REQUESTED, R.APPROVED, R.RECEIVED)).count()


def pending_reviews() -> int:
    return Review.objects.filter(status=Review.Status.PENDING).count()


def restocked_waiting() -> int:
    """Pending «خبرم کن» requests whose variant is back in stock (SMS not sent yet)."""
    return BackInStockRequest.objects.filter(
        status=BackInStockRequest.Status.PENDING, variant__stock__gt=0
    ).count()


def placeholder_prices() -> int:
    return BookVariant.objects.filter(is_active=True, price_is_placeholder=True).count()


def incomplete_books() -> int:
    return annotate_completeness(Book.objects.filter(is_active=True)).exclude(complete_q()).count()


def upcoming_exams(days: int = 90, *, today=None) -> list[ExamEvent]:
    today = today or timezone.localdate()
    return list(
        ExamEvent.objects.filter(
            is_active=True, date__gte=today, date__lte=today + dt.timedelta(days=days)
        ).select_related("exam_type")
    )


def work_items(user=None) -> list[dict]:
    """Every task (the user may see) with its count; open tasks first."""
    settings = get_store_settings()
    low = low_stock_variants(settings.low_stock_threshold).count()
    threshold = to_persian_digits(settings.low_stock_threshold)
    overdue_days = to_persian_digits(settings.shipping_overdue_days)
    items = [
        {
            "key": "prepare",
            "perm": "orders.view_order",
            "title": "سفارش پرداخت‌شده برای آماده‌سازی",
            "count": orders_to_prepare(),
            "url": _url("orders_order_changelist", "status__exact=PAID&needs_shipping__exact=1"),
            "icon": "inventory_2",
            "level": "danger",
        },
        {
            "key": "ship",
            "perm": "orders.view_order",
            "title": "سفارش آماده‌شده منتظر ارسال",
            "count": orders_to_ship(),
            "url": _url("orders_order_changelist", "status__exact=PROCESSING"),
            "icon": "local_shipping",
            "level": "danger",
        },
        {
            "key": "overdue",
            "perm": "orders.view_order",
            "title": f"مرسوله بیش از {overdue_days} روز در راه",
            "count": shipped_overdue(settings.shipping_overdue_days),
            "url": _url("orders_order_changelist", "followup=overdue"),
            "icon": "schedule",
            "level": "warning",
        },
        {
            "key": "returns",
            "perm": "orders.view_returnrequest",
            "title": "مرجوعی در جریان (بررسی، دریافت کالا یا استرداد)",
            "count": open_returns(),
            "url": _url("orders_returnrequest_changelist", "open=1"),
            "icon": "assignment_return",
            "level": "danger",
        },
        {
            "key": "reviews",
            "perm": "reviews.view_review",
            "title": "نظر در انتظار تأیید",
            "count": pending_reviews(),
            "url": _url("reviews_review_changelist", "status__exact=PENDING"),
            "icon": "rate_review",
            "level": "warning",
        },
        {
            "key": "low_stock",
            "perm": "catalog.view_bookvariant",
            "title": f"نسخه چاپی با موجودی {threshold} یا کمتر",
            "count": low,
            "url": _url("catalog_bookvariant_changelist", "low_stock=1&is_active__exact=1"),
            "icon": "production_quantity_limits",
            "level": "warning",
        },
        {
            "key": "restocked",
            "perm": "engagement.view_backinstockrequest",
            "title": "درخواست «خبرم کن» برای کتابی که موجود شده",
            "count": restocked_waiting(),
            "url": _url("engagement_backinstockrequest_changelist", "status__exact=PENDING"),
            "icon": "notifications_active",
            "level": "warning",
        },
        {
            "key": "placeholder",
            "perm": "catalog.view_bookvariant",
            "title": "قیمت موقت (تأییدنشده)",
            "count": placeholder_prices(),
            "url": _url("catalog_bookvariant_changelist", "price_is_placeholder__exact=1"),
            "icon": "price_change",
            "level": "info",
        },
        {
            "key": "incomplete",
            "perm": "catalog.view_book",
            "title": "کتاب فعال با اطلاعات ناقص",
            "count": incomplete_books(),
            "url": _url("catalog_book_changelist", "complete=no"),
            "icon": "edit_note",
            "level": "info",
        },
    ]
    # --- platform stream (PF-11) ---
    from apps.support.services.tickets import open_count as open_tickets

    items.append(
        {
            "key": "tickets",
            "perm": "support.view_supportticket",
            "title": "درخواست پشتیبانی در انتظار پاسخ",
            "count": open_tickets(),
            "url": _url("support_supportticket_changelist", "status__exact=open"),
            "icon": "support_agent",
            "level": "danger",
        }
    )
    if user is not None:
        items = [i for i in items if user.has_perm(i["perm"])]
    return sorted(items, key=lambda i: i["count"] == 0)  # stable: open tasks first


def badge(count: int) -> str:
    return to_persian_digits(count) if count else ""


# Sidebar badges (UNFOLD["SIDEBAR"] items take a dotted path to a callable(request)).
def orders_badge(request) -> str:
    return badge(orders_to_prepare() + orders_to_ship())


def reviews_badge(request) -> str:
    return badge(pending_reviews())


def low_stock_badge(request) -> str:
    return badge(low_stock_variants(get_store_settings().low_stock_threshold).count())


def returns_badge(request) -> str:
    return badge(open_returns())
