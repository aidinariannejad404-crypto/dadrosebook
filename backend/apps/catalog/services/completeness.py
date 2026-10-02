"""Admin data-quality score: how complete a book's product page is."""

from django.db.models import Exists, OuterRef, Q, QuerySet

from ..models import Book, BookVariant
from .books import has_sample_pages_expression, has_sample_q

# (code, Persian label) in display order.
CHECKS = [
    ("cover", "جلد"),
    ("sample", "نمونه"),
    ("isbn", "شابک"),
    ("table_of_contents", "فهرست مطالب"),
    ("study_plan_note", "جایگاه در برنامه مطالعه"),
    ("publisher", "ناشر"),
    ("price", "قیمت قطعی"),
    ("description", "معرفی"),
]


def has_real_price_expression():
    return Exists(
        BookVariant.objects.filter(book=OuterRef("pk"), is_active=True, price_is_placeholder=False)
    )


def annotate_completeness(qs: QuerySet) -> QuerySet:
    return qs.annotate(
        has_sample_pages=has_sample_pages_expression(), has_real_price=has_real_price_expression()
    )


def complete_q() -> Q:
    """Books passing every check (needs ``annotate_completeness``)."""
    return (
        ~Q(cover="")
        & has_sample_q()
        & ~Q(isbn="")
        & ~Q(table_of_contents="")
        & ~Q(study_plan_note="")
        & Q(publisher__isnull=False)
        & Q(has_real_price=True)
        & ~Q(description="")
    )


def completeness_checks(book: Book) -> dict[str, bool]:
    pages = getattr(book, "has_sample_pages", None)
    if pages is None:
        pages = book.sample_pages.exists()
    real_price = getattr(book, "has_real_price", None)
    if real_price is None:
        real_price = book.variants.filter(is_active=True, price_is_placeholder=False).exists()
    return {
        "cover": bool(book.cover),
        "sample": bool(book.sample_pdf) or bool(pages),
        "isbn": bool(book.isbn.strip()),
        "table_of_contents": bool(book.table_of_contents.strip()),
        "study_plan_note": bool(book.study_plan_note.strip()),
        "publisher": book.publisher_id is not None,
        "price": bool(real_price),
        "description": bool(book.description.strip()),
    }


def completeness_percent(book: Book) -> int:
    checks = completeness_checks(book)
    return sum(checks.values()) * 100 // len(checks)  # floor: 100 only when complete


def missing_labels(book: Book) -> list[str]:
    checks = completeness_checks(book)
    return [label for code, label in CHECKS if not checks[code]]
