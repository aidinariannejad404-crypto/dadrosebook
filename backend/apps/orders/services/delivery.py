"""Delivery date promise (د۲): «تحویل تقریبی: شنبه ۲۰ مهر تا دوشنبه ۲۲ مهر».

Rules
* A **business day** is any day except Friday (the Iranian weekend) and the dates in
  ``ShippingHoliday`` (official holidays the staff enter in the admin).
* **Dispatch day:** an order paid on a business day before the method's ``cutoff_hour``
  (Asia/Tehran wall clock) is dispatched that day; otherwise on the next business day.
* **Delivery window:** dispatch day + ``min_business_days`` … + ``max_business_days`` business
  days (``0`` = delivered on the dispatch day). A method without ``min_business_days`` has no
  estimate (``None``); without ``max_business_days`` the window is a single day.
* **Exam clash:** when the latest delivery date is after (exam date − 7 days) the print copy may
  arrive too late to study, so the storefront suggests the ebook or the bundle instead.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from urllib.parse import unquote

import jdatetime
from django.utils import timezone

from apps.core.money import to_persian_digits

from ..models import ShippingHoliday, ShippingMethod

FRIDAY = 4  # ``date.weekday()``
EXAM_MARGIN_DAYS = 7
HOLIDAY_HORIZON_DAYS = 180
MAX_SCAN_DAYS = 366  # never loop forever if every day were a holiday

WEEKDAYS_FA = ("دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه")
MONTHS_FA = (
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
)


def day_label(day: dt.date) -> str:
    """``date(2026, 10, 10)`` → ``"شنبه ۱۸ مهر"``."""
    j = jdatetime.date.fromgregorian(date=day)
    return f"{WEEKDAYS_FA[day.weekday()]} {to_persian_digits(str(j.day))} {MONTHS_FA[j.month - 1]}"


def range_label(first: dt.date, last: dt.date) -> str:
    if first == last:
        return day_label(first)
    return f"{day_label(first)} تا {day_label(last)}"


@dataclass(frozen=True)
class DeliveryEstimate:
    dispatch_date: dt.date
    min_date: dt.date
    max_date: dt.date

    @property
    def label(self) -> str:
        return range_label(self.min_date, self.max_date)

    def as_dict(self) -> dict:
        return {
            "dispatch_date": self.dispatch_date.isoformat(),
            "min_date": self.min_date.isoformat(),
            "max_date": self.max_date.isoformat(),
            "label": self.label,
        }


# --- calendar -------------------------------------------------------------------------------


def holidays_from(start: dt.date, days: int = HOLIDAY_HORIZON_DAYS) -> frozenset[dt.date]:
    end = start + dt.timedelta(days=days)
    return frozenset(
        ShippingHoliday.objects.filter(date__gte=start, date__lte=end).values_list(
            "date", flat=True
        )
    )


def is_business_day(
    day: dt.date, holidays: frozenset[dt.date] | set[dt.date] = frozenset()
) -> bool:
    return day.weekday() != FRIDAY and day not in holidays


def next_business_day(day: dt.date, holidays=frozenset(), *, include_today: bool = True) -> dt.date:
    current = day if include_today else day + dt.timedelta(days=1)
    for _ in range(MAX_SCAN_DAYS):
        if is_business_day(current, holidays):
            return current
        current += dt.timedelta(days=1)
    return current


def add_business_days(day: dt.date, count: int, holidays=frozenset()) -> dt.date:
    """``count`` business days after ``day`` (``0`` → ``day`` itself)."""
    current = day
    for _ in range(max(count, 0)):
        current = next_business_day(current, holidays, include_today=False)
    return current


def local_now(now: dt.datetime | None = None) -> dt.datetime:
    now = now or timezone.now()
    if timezone.is_naive(now):
        now = timezone.make_aware(now)
    return timezone.localtime(now)


def dispatch_date(now: dt.datetime, cutoff_hour: int, holidays=frozenset()) -> dt.date:
    """The day the parcel leaves: today before the cutoff on a business day, else the next one."""
    local = local_now(now)
    today = local.date()
    if is_business_day(today, holidays) and local.hour < cutoff_hour:
        return today
    return next_business_day(today, holidays, include_today=False)


# --- estimates ------------------------------------------------------------------------------


def has_estimate(method: ShippingMethod) -> bool:
    return method.min_business_days is not None


def estimate_for(
    method: ShippingMethod, *, now: dt.datetime | None = None, holidays=None
) -> DeliveryEstimate | None:
    if not has_estimate(method):
        return None
    local = local_now(now)
    if holidays is None:
        holidays = holidays_from(local.date())
    low = method.min_business_days
    high = method.max_business_days if method.max_business_days is not None else low
    high = max(high, low)
    start = dispatch_date(local, method.cutoff_hour, holidays)
    return DeliveryEstimate(
        dispatch_date=start,
        min_date=add_business_days(start, low, holidays),
        max_date=add_business_days(start, high, holidays),
    )


# --- exam clash -----------------------------------------------------------------------------


def safe_until(exam_date: dt.date, margin_days: int = EXAM_MARGIN_DAYS) -> dt.date:
    """The last delivery date that still leaves ``margin_days`` before the exam."""
    return exam_date - dt.timedelta(days=margin_days)


def clashes_with_exam(
    estimate: DeliveryEstimate | None,
    exam_date: dt.date | None,
    margin_days: int = EXAM_MARGIN_DAYS,
) -> bool:
    if estimate is None or exam_date is None:
        return False
    return estimate.max_date > safe_until(exam_date, margin_days)


def clash_info(estimate: DeliveryEstimate | None, event) -> dict | None:
    """API shape of a clash with ``event`` (an ``ExamEvent``), or ``None`` when there is none."""
    if event is None or not clashes_with_exam(estimate, event.date):
        return None
    return {
        "exam_name": event.name,
        "exam_date": event.date.isoformat(),
        "safe_until": safe_until(event.date).isoformat(),
        "message": (
            f"نسخه چاپی ممکن است تا {day_label(estimate.max_date)} برسد؛ کمتر از یک هفته پیش از "
            f"{event.name}. نسخه الکترونیک یا بسته (چاپی + الکترونیک) را بگیرید تا همین امروز "
            "مطالعه را شروع کنید."
        ),
    }


def exam_slug_from_request(request) -> str | None:
    """``?exam=`` wins, else the storefront's «آزمون من» ``exam`` cookie (same-origin API)."""
    raw = request.query_params.get("exam") if hasattr(request, "query_params") else None
    raw = raw or request.COOKIES.get("exam") or ""
    slug = unquote(raw).strip()
    return slug[:80] or None


def exam_event_for(slug: str | None, *, today: dt.date | None = None):
    """The next upcoming active ``ExamEvent`` of the exam type ``slug`` (``None`` if unknown)."""
    if not slug:
        return None
    from apps.catalog.services.courses import upcoming_events

    return upcoming_events(today or timezone.localdate()).filter(exam_type__slug=slug).first()


def method_payload(method: ShippingMethod, estimate: DeliveryEstimate | None, event) -> dict:
    return {
        "id": method.pk,
        "code": method.code,
        "name": method.name,
        "tehran_only": method.tehran_only,
        "estimate": estimate.as_dict() if estimate else None,
        "exam_clash": clash_info(estimate, event),
    }


def delivery_summary(
    *, province: str | None = None, exam_slug: str | None = None, now: dt.datetime | None = None
) -> dict:
    """Estimates for every offered method, the headline one and the exam check.

    Without a province (product page, added-to-cart sheet) the methods that ship nationwide are
    used, so a visitor outside Tehran is never promised the courier's speed. The headline
    (``estimate``) spans the earliest ``min_date`` to the latest ``max_date`` of those methods.
    """
    from .shipping import methods_for

    local = local_now(now)
    holidays = holidays_from(local.date())
    event = exam_event_for(exam_slug, today=local.date())
    methods = list(methods_for(province))
    rows = []
    estimates = []
    for method in methods:
        est = estimate_for(method, now=local, holidays=holidays)
        rows.append(method_payload(method, est, event))
        if est is not None:
            estimates.append(est)
    headline = None
    if estimates:
        headline = DeliveryEstimate(
            dispatch_date=min(e.dispatch_date for e in estimates),
            min_date=min(e.min_date for e in estimates),
            max_date=max(e.max_date for e in estimates),
        )
    days_left = (event.date - local.date()).days if event else None
    return {
        "estimate": headline.as_dict() if headline else None,
        "methods": rows,
        "exam": (
            {
                "name": event.name,
                "slug": event.exam_type.slug,
                "date": event.date.isoformat(),
                "days_left": days_left,
                "safe_until": safe_until(event.date).isoformat(),
            }
            if event
            else None
        ),
        "exam_clash": clash_info(headline, event),
    }


def order_estimate(order) -> DeliveryEstimate | None:
    """The promise for a placed order (from its payment time); ``None`` once delivered."""
    if not order.needs_shipping or order.shipping_method is None or order.delivered_at:
        return None
    if order.status in ("CANCELLED", "FAILED"):
        return None
    return estimate_for(order.shipping_method, now=order.paid_at or order.created_at)
