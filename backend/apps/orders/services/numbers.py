"""Human-friendly order numbers: ``DR`` + Jalali yymmdd + 4 random digits, e.g. ``DR0507114821``."""

import secrets

import jdatetime
from django.utils import timezone


def new_order_number() -> str:
    from ..models import Order

    today = jdatetime.date.fromgregorian(date=timezone.localdate())
    prefix = f"DR{today.year % 100:02d}{today.month:02d}{today.day:02d}"
    for _ in range(20):
        number = f"{prefix}{secrets.randbelow(10_000):04d}"
        if not Order.objects.filter(number=number).exists():
            return number
    return f"{prefix}{secrets.randbelow(10**8):08d}"
