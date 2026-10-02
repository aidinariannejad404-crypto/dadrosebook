"""Iranian mobile numbers, normalised to ``09xxxxxxxxx``."""

import re

from django.core.exceptions import ValidationError

from apps.core.normalize import normalize_persian

PHONE_RE = re.compile(r"^09\d{9}$")


def normalize_phone(value: str | None) -> str:
    """Normalise to ``09xxxxxxxxx``.

    ``"۰۹۱۲ ۰۰۰ ۰۰۰۰"``, ``"+989120000000"``, ``"00989120000000"``, ``"9120000000"`` all become
    ``"09120000000"``.

    Returns the cleaned digits even when they are not a valid mobile number; validate separately.
    """
    digits = re.sub(r"\D", "", normalize_persian(value or ""))
    if digits.startswith("0098"):
        digits = "0" + digits[4:]
    elif digits.startswith("98") and len(digits) == 12:
        digits = "0" + digits[2:]
    elif digits.startswith("9") and len(digits) == 10:
        digits = "0" + digits
    return digits


def validate_phone(value: str) -> None:
    if not PHONE_RE.match(value or ""):
        raise ValidationError("شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.", code="invalid_phone")
