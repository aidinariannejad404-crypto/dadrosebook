"""Server-side card badges: one ordered list, at most two on a card.

Priority (highest first): edition, essential in the selected exam's kit, subject bestseller rank,
quick review, print + ebook bundle, free sample, Dadrose course book.
"""

from apps.core.money import to_persian_digits

MAX_BADGES = 2


def _badge(code: str, label: str, tone: str) -> dict:
    return {"code": code, "label": label, "tone": tone}


def book_badges(
    *,
    edition_badge: str | None = None,
    kit_role: str | None = None,
    subject_rank: int | None = None,
    subject_name: str | None = None,
    is_quick_review: bool = False,
    has_bundle: bool = False,
    has_sample: bool = False,
    course_title: str | None = None,
    limit: int = MAX_BADGES,
) -> list[dict]:
    candidates = [
        edition_badge and _badge("edition", edition_badge, "primary"),
        kit_role == "essential" and _badge("kit_essential", "ضروری کیت", "success"),
        subject_rank
        and subject_name
        and _badge(
            "bestseller",
            f"پرفروش‌ترین #{to_persian_digits(subject_rank)} {subject_name}",
            "accent",
        ),
        is_quick_review and _badge("quick_review", "سریع‌خوان", "warning"),
        has_bundle and _badge("bundle", "چاپی + الکترونیک", "info"),
        has_sample and _badge("sample", "نمونه رایگان", "neutral"),
        course_title and _badge("course", "منبع دوره دادرُز", "info"),
    ]
    return [b for b in candidates if b][:limit]
