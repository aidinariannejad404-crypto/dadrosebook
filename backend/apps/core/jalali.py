"""Jalali (Solar Hijri) date helpers. Dates are stored Gregorian and shown Jalali."""

import datetime as dt
import re

import jdatetime

from .money import to_persian_digits
from .normalize import normalize_persian

_JALALI_RE = re.compile(r"^\s*(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*$")


def to_jalali(value: dt.date | dt.datetime) -> jdatetime.date:
    if isinstance(value, dt.datetime):
        value = value.date()
    return jdatetime.date.fromgregorian(date=value)


def to_jalali_str(value: dt.date | dt.datetime | None, *, persian_digits: bool = False) -> str:
    """``date(2026, 11, 5)`` → ``"1405/08/14"`` (or ``"۱۴۰۵/۰۸/۱۴"``)."""
    if value is None:
        return ""
    text = to_jalali(value).strftime("%Y/%m/%d")
    return to_persian_digits(text) if persian_digits else text


def parse_jalali_date(text: str | None) -> dt.date:
    """Parse ``"1405/08/14"``, ``"۱۴۰۵/۰۸/۱۴"`` or ``"1405-8-14"`` into a Gregorian date.

    Raises ``ValueError`` for malformed or impossible dates.
    """
    normalised = normalize_persian(text or "")
    match = _JALALI_RE.match(normalised)
    if not match:
        raise ValueError(f"invalid Jalali date: {text!r}")
    year, month, day = (int(g) for g in match.groups())
    try:
        return jdatetime.date(year, month, day).togregorian()
    except ValueError as exc:
        raise ValueError(f"invalid Jalali date: {text!r}") from exc


def jalali_year(value: dt.date) -> int:
    return to_jalali(value).year
