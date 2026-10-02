"""Unicode Persian slugs: ``persian_slugify("سریع‌خوان متون فقه")`` → ``"سریع-خوان-متون-فقه"``."""

import re

from .normalize import normalize_persian

# Persian/Arabic letters block (after normalisation digits are ASCII), ASCII letters and digits.
_ALLOWED_RE = re.compile(r"[^a-z0-9؀-ۿ\-]+")
_DASHES_RE = re.compile(r"-{2,}")
# Arabic punctuation inside the Arabic block that must not survive in a slug.
_ARABIC_PUNCT = str.maketrans(dict.fromkeys("،؛؟٪٫٬«»۔", " "))


def persian_slugify(text: str | None, *, max_length: int = 200) -> str:
    text = normalize_persian(text, zwnj="space").translate(_ARABIC_PUNCT)
    text = text.replace(" ", "-")
    text = _ALLOWED_RE.sub("-", text)
    text = _DASHES_RE.sub("-", text).strip("-")
    return text[:max_length].strip("-")


def unique_slug(instance, text: str, *, field: str = "slug") -> str:
    """Slugify ``text`` and add ``-2``, ``-3``… until no other row of the model uses it."""
    model = type(instance)
    max_length = model._meta.get_field(field).max_length or 200
    base = persian_slugify(text, max_length=max_length - 6) or "item"
    candidate = base
    n = 2
    qs = model._default_manager.all()
    if instance.pk:
        qs = qs.exclude(pk=instance.pk)
    while qs.filter(**{field: candidate}).exists():
        candidate = f"{base}-{n}"
        n += 1
    return candidate
