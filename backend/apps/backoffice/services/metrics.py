"""Store KPIs for the admin dashboard and the sales report.

A *sale* is an order that was paid (``paid_at`` set) and not cancelled afterwards. All money is
integer toman. Every function takes a half-open ``[start, end)`` datetime window.
"""

import datetime as dt
from dataclasses import dataclass

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.catalog.models import BookVariant
from apps.engagement.models import BackInStockRequest
from apps.orders.models import DiscountRedemption, Order, OrderItem

S = Order.Status
VARIANT_TYPES = ("PRINT", "EBOOK", "BUNDLE")


@dataclass(frozen=True)
class Window:
    start: dt.datetime
    end: dt.datetime

    @property
    def days(self) -> int:
        return max(1, round((self.end - self.start).total_seconds() / 86400))

    def previous(self) -> "Window":
        """The window of the same length right before this one (for "vs. last period")."""
        return Window(self.start - (self.end - self.start), self.start)


def local_day_start(day: dt.date) -> dt.datetime:
    return timezone.make_aware(dt.datetime.combine(day, dt.time.min))


def window_for_days(days: int, *, today: dt.date | None = None) -> Window:
    """The last ``days`` local days, today included."""
    today = today or timezone.localdate()
    end = local_day_start(today + dt.timedelta(days=1))
    return Window(end - dt.timedelta(days=days), end)


def window_for_dates(first: dt.date, last: dt.date) -> Window:
    """Inclusive local dates → half-open window."""
    return Window(local_day_start(first), local_day_start(last + dt.timedelta(days=1)))


def sales_qs(window: Window):
    return Order.objects.filter(paid_at__gte=window.start, paid_at__lt=window.end).exclude(
        status=S.CANCELLED
    )


def sold_items_qs(window: Window):
    return OrderItem.objects.filter(
        order__paid_at__gte=window.start, order__paid_at__lt=window.end
    ).exclude(order__status=S.CANCELLED)


def percent(part: int, whole: int) -> int | None:
    return round(part * 100 / whole) if whole else None


def change_percent(now: int, before: int) -> int | None:
    """Growth vs. the previous period; ``None`` when there is nothing to compare with."""
    return round((now - before) * 100 / before) if before else None


def sales_summary(window: Window) -> dict:
    agg = sales_qs(window).aggregate(
        orders=Count("id"),
        revenue=Sum("total"),
        discounts=Sum("discount_total"),
        shipping=Sum("shipping_total"),
        refunds=Sum("refunded_total"),
        customers=Count("user", distinct=True),
    )
    orders = agg["orders"] or 0
    revenue = agg["revenue"] or 0
    units = sold_items_qs(window).aggregate(n=Sum("quantity"))["n"] or 0
    return {
        "orders": orders,
        "revenue": revenue,
        "aov": revenue // orders if orders else 0,
        "units": units,
        "discounts": agg["discounts"] or 0,
        "shipping": agg["shipping"] or 0,
        "customers": agg["customers"] or 0,
        "refunds": agg["refunds"] or 0,
        "net": revenue - (agg["refunds"] or 0),
    }


def sales_by_format(window: Window) -> list[dict]:
    """Units, revenue and share of revenue per format (print / ebook / bundle)."""
    rows = {
        r["variant_type"]: r
        for r in sold_items_qs(window)
        .values("variant_type")
        .annotate(
            units=Sum("quantity"), revenue=Sum("line_total"), orders=Count("order", distinct=True)
        )
    }
    total = sum(r["revenue"] for r in rows.values())
    labels = dict(BookVariant.Type.choices)
    out = []
    for t in VARIANT_TYPES:
        r = rows.get(t, {})
        revenue = r.get("revenue") or 0
        out.append(
            {
                "type": t,
                "label": labels[t],
                "units": r.get("units") or 0,
                "orders": r.get("orders") or 0,
                "revenue": revenue,
                "share": percent(revenue, total) or 0,
            }
        )
    return out


def bundle_adoption(window: Window) -> dict:
    """Of the print units sold, the share sold as print + ebook bundles."""
    agg = sold_items_qs(window).aggregate(
        bundle=Sum("quantity", filter=Q(variant_type="BUNDLE")),
        print=Sum("quantity", filter=Q(variant_type="PRINT")),
    )
    bundle, printed = agg["bundle"] or 0, agg["print"] or 0
    return {"bundle": bundle, "print": printed, "rate": percent(bundle, bundle + printed)}


def repeat_purchase(window: Window) -> dict:
    """Customers who bought in the window, and the share who bought more than once in it."""
    per_customer = sales_qs(window).values("user").annotate(n=Count("id"))
    customers = per_customer.count()
    repeat = per_customer.filter(n__gte=2).count()
    return {"customers": customers, "repeat": repeat, "rate": percent(repeat, customers)}


def notify_me_recovery(window: Window) -> dict:
    """«موجود شد خبرم کن»: requests notified in the window and how many turned into a purchase."""
    qs = BackInStockRequest.objects.filter(
        notified_at__gte=window.start, notified_at__lt=window.end
    )
    notified = qs.count()
    converted = qs.filter(converted_at__isnull=False).count()
    waiting = BackInStockRequest.objects.filter(status=BackInStockRequest.Status.PENDING).count()
    return {
        "notified": notified,
        "converted": converted,
        "rate": percent(converted, notified),
        "waiting": waiting,
    }


def first_time_customers(window: Window) -> int:
    """Customers whose first ever sale falls in the window."""
    users = sales_qs(window).values_list("user", flat=True).distinct()
    earlier = (
        Order.objects.filter(user__in=users, paid_at__lt=window.start)
        .exclude(status=S.CANCELLED)
        .values_list("user", flat=True)
        .distinct()
    )
    return users.exclude(user__in=earlier).count()


def daily_revenue(window: Window) -> list[dict]:
    """One row per local day (zero-filled), oldest first."""
    rows = {
        r["day"]: r
        for r in sales_qs(window)
        .annotate(day=TruncDate("paid_at", tzinfo=timezone.get_current_timezone()))
        .values("day")
        .annotate(orders=Count("id"), revenue=Sum("total"))
    }
    out = []
    day = timezone.localtime(window.start).date()
    last = timezone.localtime(window.end - dt.timedelta(microseconds=1)).date()
    while day <= last:
        r = rows.get(day, {})
        out.append({"day": day, "orders": r.get("orders") or 0, "revenue": r.get("revenue") or 0})
        day += dt.timedelta(days=1)
    return out


def top_books(window: Window, limit: int = 10) -> list[dict]:
    return list(
        sold_items_qs(window)
        .values("book_id", "title")
        .annotate(units=Sum("quantity"), revenue=Sum("line_total"))
        .order_by("-revenue", "-units")[:limit]
    )


def discount_codes(window: Window) -> list[dict]:
    return list(
        DiscountRedemption.objects.filter(
            order__paid_at__gte=window.start, order__paid_at__lt=window.end
        )
        .exclude(order__status=S.CANCELLED)
        .values("code__code")
        .annotate(uses=Count("id"), discount=Sum("amount"), revenue=Sum("order__total"))
        .order_by("-uses")
    )


def low_stock_variants(threshold: int):
    """Active print/bundle variants of active books at or below the threshold."""
    return (
        BookVariant.objects.filter(
            is_active=True,
            book__is_active=True,
            type__in=(BookVariant.Type.PRINT, BookVariant.Type.BUNDLE),
            stock__lte=threshold,
        )
        .select_related("book")
        .annotate(
            waiting=Count(
                "back_in_stock_requests",
                filter=Q(back_in_stock_requests__status=BackInStockRequest.Status.PENDING),
            )
        )
        .order_by("stock", F("waiting").desc(), "book__title")
    )
