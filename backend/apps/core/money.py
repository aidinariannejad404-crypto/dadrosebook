"""Money helpers. Amounts are integer toman everywhere; rial only at the payment gateway."""

_PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
THOUSANDS_SEPARATOR = "٬"  # U+066C Arabic thousands separator


def to_persian_digits(value) -> str:
    return str(value).translate(_PERSIAN_DIGITS)


def format_number(value: int) -> str:
    """``2200000`` → ``"۲٬۲۰۰٬۰۰۰"``."""
    formatted = f"{int(value):,}".replace(",", THOUSANDS_SEPARATOR)
    return to_persian_digits(formatted)


def format_toman(value: int | None) -> str:
    """``2200000`` → ``"۲٬۲۰۰٬۰۰۰ تومان"``. ``None`` → ``""``."""
    if value is None:
        return ""
    return f"{format_number(value)} تومان"


def to_rial(toman: int) -> int:
    """Convert toman to rial (×10). Only the payment gateway adapter should need this."""
    return int(toman) * 10
