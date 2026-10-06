"""Derived ``BookCard`` values (computed from card-queryset annotations and prefetches)."""

from ..models import Book, BookVariant, RelatedCourse
from .badges import book_badges
from .editions import edition_badge
from .social_proof import book_social_proof


def kit_role(book: Book) -> str | None:
    """``"essential"``/``"optional"`` in the selected exam's kits, ``None`` otherwise."""
    if getattr(book, "kit_essential", False):
        return "essential"
    if getattr(book, "kit_listed", False):
        return "optional"
    return None


def has_sample(book: Book) -> bool:
    if book.sample_pdf:
        return True
    pages = getattr(book, "has_sample_pages", None)
    return bool(pages) if pages is not None else book.sample_pages.exists()


def course_badge(book: Book) -> str | None:
    if hasattr(book, "first_course_title"):
        return book.first_course_title or None
    from .books import COURSE_SOURCE_RELEVANCE

    link = (
        book.course_links.filter(
            relevance__in=COURSE_SOURCE_RELEVANCE,
            course__in=RelatedCourse.objects.exposed(),
        )
        .select_related("course")
        .order_by("order", "id")
        .first()
    )
    return link.course.title if link else None


def has_sellable_bundle(variants) -> bool:
    return any(v.type == BookVariant.Type.BUNDLE and not v.price_is_placeholder for v in variants)


def card_extras(book: Book, variants: list[BookVariant], *, exam_year: int) -> dict:
    """Every derived card field; ``variants`` are the book's active variants."""
    edition = edition_badge(book.publish_year, exam_year)
    role = kit_role(book)
    proof = book_social_proof(book)
    sample = has_sample(book)
    course = course_badge(book)
    subjects = list(book.subjects.all())
    return {
        "edition_badge": edition,
        "kit_role": role,
        "has_sample": sample,
        "course_badge": course,
        "social_proof": proof,
        "badges": book_badges(
            edition_badge=edition,
            kit_role=role,
            subject_rank=proof["subject_rank"],
            subject_name=subjects[0].name if subjects else None,
            is_quick_review=book.is_quick_review,
            has_bundle=has_sellable_bundle(variants),
            has_sample=sample,
            course_title=course,
            is_free_ebook=book.is_free_ebook,  # ه۶
        ),
    }
