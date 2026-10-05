"""Add-to-calendar for exam dates (ج۵): an RFC 5545 ``.ics`` and a Google Calendar link.

Two kinds of entry per ``ExamEvent``: the exam day itself and, when the admin set it, the
registration window. Both are all-day events (the exact hour is announced late and changes);
titles and descriptions are Persian and carry the Jalali date so the reminder reads naturally.
"""

from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlencode

from django.conf import settings

from apps.core.jalali import to_jalali
from apps.core.money import to_persian_digits

from ..models import ExamEvent

EXAM = "exam"
REGISTRATION = "registration"
KINDS = (EXAM, REGISTRATION)
PRODID = "-//Dadrose Book//Exam calendar//FA"


MONTHS = (
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
# date.weekday(): Monday = 0
WEEKDAYS = ("دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه")


def format_jalali_date(value: date) -> str:
    """``date(2026, 11, 5)`` → ``"پنجشنبه ۱۴ آبان ۱۴۰۵"``."""
    j = to_jalali(value)
    return f"{WEEKDAYS[value.weekday()]} {to_persian_digits(str(j.day))} {MONTHS[j.month - 1]} " + (
        to_persian_digits(str(j.year))
    )


class NoRegistrationWindow(ValueError):
    """The event has no registration dates."""


def _site_url() -> str:
    return (getattr(settings, "SITE_URL", "") or "").rstrip("/")


def entry(event: ExamEvent, kind: str = EXAM) -> dict:
    """Title, description and the all-day ``[start, end)`` range for one calendar entry."""
    kit = f"{_site_url()}/kit?exam={event.exam_type.slug}" if _site_url() else ""
    if kind == REGISTRATION:
        start, last = event.registration_start, event.registration_end
        if start is None or last is None:
            raise NoRegistrationWindow(event.pk)
        title = f"ثبت‌نام {event.name}"
        lines = [
            f"مهلت ثبت‌نام {event.name}: {format_jalali_date(start)} تا {format_jalali_date(last)}.",
            f"تاریخ آزمون: {format_jalali_date(event.date)}.",
            "زمان دقیق را از سایت رسمی برگزارکننده بررسی کنید.",
        ]
        alarm_days = 1
    else:
        start, last = event.date, event.date
        title = event.name
        lines = [
            f"{event.name}، {format_jalali_date(event.date)}.",
            "ساعت و محل برگزاری را از کارت ورود به جلسه بررسی کنید.",
        ]
        alarm_days = 7
    if kit:
        lines.append(f"منابع آزمون در دادرُز: {kit}")
    return {
        "uid": f"exam-{event.pk}-{kind}@dadrosebook",
        "title": title,
        "description": "\n".join(lines),
        "start": start,
        "end": last + timedelta(days=1),  # DTEND of an all-day event is exclusive
        "alarm_days": alarm_days,
        "url": kit,
    }


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    """Fold to 75 octets per line (RFC 5545 §3.1) without splitting a UTF-8 character."""
    out, current = [], b""
    for ch in line:
        b = ch.encode()
        if len(current) + len(b) > (75 if not out else 74):
            out.append(current.decode())
            current = b""
        current += b
    out.append(current.decode())
    return "\r\n ".join(out)


def _d(value: date) -> str:
    return value.strftime("%Y%m%d")


def build_ics(event: ExamEvent, kind: str = EXAM, now: datetime | None = None) -> str:
    e = entry(event, kind)
    stamp = (now or datetime.now(UTC)).astimezone(UTC)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{e['uid']}",
        f"DTSTAMP:{stamp.strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART;VALUE=DATE:{_d(e['start'])}",
        f"DTEND;VALUE=DATE:{_d(e['end'])}",
        f"SUMMARY:{_escape(e['title'])}",
        f"DESCRIPTION:{_escape(e['description'])}",
        "TRANSP:TRANSPARENT",
    ]
    if e["url"]:
        lines.append(f"URL:{e['url']}")
    lines += [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"DESCRIPTION:{_escape(e['title'])}",
        f"TRIGGER:-P{e['alarm_days']}D",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def google_calendar_url(event: ExamEvent, kind: str = EXAM) -> str:
    e = entry(event, kind)
    params = {
        "action": "TEMPLATE",
        "text": e["title"],
        "dates": f"{_d(e['start'])}/{_d(e['end'])}",
        "details": e["description"],
    }
    return "https://calendar.google.com/calendar/render?" + urlencode(params)


def calendar_links(event: ExamEvent) -> dict:
    """``{"exam": {"google"}, "registration": {"google"} | None}`` for the API.

    The ``.ics`` URL is not included: the storefront builds it from the event id against its own
    (same-origin) API base, so server-side renders never leak the internal API host.
    """
    has_reg = event.registration_start is not None and event.registration_end is not None
    return {
        EXAM: {"google": google_calendar_url(event, EXAM)},
        REGISTRATION: {"google": google_calendar_url(event, REGISTRATION)} if has_reg else None,
    }
