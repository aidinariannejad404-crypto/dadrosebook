"""Aggregate everything the homepage needs in one call."""

from django.db.models import Count, Exists, F, OuterRef, Q
from django.utils import timezone

from apps.content.models import Banner, GuideVideo
from apps.core.jalali import jalali_year
from apps.core.services.store_settings import get_store_settings

from ..models import Book, BookVariant, ExamEvent, ExamType, StudyKitRecommendation, Subject
from .books import active_category_tree, book_card_queryset, sorted_variants
from .courses import exposed_courses
from .editions import current_exam_year
from .pricing import book_card_variant, card_discount

RAIL_SIZE = 12
# The «پیشنهاد ویژه» rail repeats books from other rails; kept short so the home HTML stays light.
DISCOUNTED_RAIL_SIZE = 6
GUIDE_VIDEO_LIMIT = 6
TESTIMONIAL_LIMIT = 6
TESTIMONIAL_MIN_RATING = 4
TESTIMONIAL_MAX_CHARS = 220


def upcoming_exam_events():
    today = timezone.localdate()
    return (
        ExamEvent.objects.filter(is_active=True, date__gte=today, exam_type__is_active=True)
        .select_related("exam_type")
        .order_by("date", "id")
    )


def subjects_with_book_count():
    return (
        Subject.objects.filter(is_active=True)
        .annotate(book_count=Count("books", filter=Q(books__is_active=True), distinct=True))
        .order_by("order", "id")
    )


def subjects_with_weight(exam_type: ExamType | None) -> list[Subject]:
    """Active subjects with ``book_count`` and ``weight`` (ضریب) for ``exam_type``.

    With an exam type, subjects are ordered by weight (highest first, unweighted last, then
    ``Subject.order``); without one every ``weight`` is ``None`` and the order is unchanged.
    """
    subjects = list(subjects_with_book_count())
    weights: dict[int, int] = {}
    if exam_type is not None:
        weights = dict(
            StudyKitRecommendation.objects.filter(
                exam_type=exam_type, is_active=True, weight__isnull=False
            ).values_list("subject_id", "weight")
        )
    for subject in subjects:
        subject.weight = weights.get(subject.id)
    if exam_type is not None:
        subjects.sort(key=lambda s: (s.weight is None, -(s.weight or 0)))  # stable
    return subjects


def resolve_exam_type(slug: str | None) -> ExamType | None:
    if not slug:
        return None
    return ExamType.objects.filter(slug=slug, is_active=True).first()


def discounted_books(books, exam_type: str | None = None, limit: int = DISCOUNTED_RAIL_SIZE) -> list[Book]:
    """In-stock books whose card price is discounted (the «پیشنهاد ویژه» rail), biggest first.

    The DB narrows to books with any discounted, sellable variant; the card variant (print first)
    decides, because that is the price the card crosses out.
    """
    on_sale = BookVariant.objects.filter(
        book=OuterRef("pk"),
        is_active=True,
        price_is_placeholder=False,
        sale_price__isnull=False,
        sale_price__lt=F("price"),
    )
    candidates = (
        book_card_queryset(books.filter(Exists(on_sale)), exam_type=exam_type)
        .filter(has_stock=True)
        .order_by(F("sales_count").desc(), "id")[: limit * 2]
    )
    picked = []
    for book in candidates:
        percent = card_discount(book_card_variant(sorted_variants(book.active_variants)))[
            "discount_percent"
        ]
        if percent:
            picked.append((percent, book))
    picked.sort(key=lambda row: -row[0])  # stable: best sellers first within the same percent
    return [book for _, book in picked[:limit]]


def testimonials(exam_type: ExamType | None = None, limit: int = TESTIMONIAL_LIMIT) -> list:
    """Real, approved 4–5★ reviews with text, newest first (the homepage social-proof strip).

    Never padded: an empty list hides the strip. With an exam type selected, reviews written for
    that exam come first. Bodies are cut to ``TESTIMONIAL_MAX_CHARS`` at a word boundary.
    """
    from apps.reviews.models import Review

    qs = (
        Review.objects.filter(
            status=Review.Status.APPROVED,
            rating__gte=TESTIMONIAL_MIN_RATING,
            book__is_active=True,
        )
        .exclude(body="")
        .select_related("user", "book", "exam_type")
    )
    order = ["-is_verified_purchase", "-created_at", "-id"]
    if exam_type is not None:
        qs = qs.annotate(for_exam=Q(exam_type=exam_type))
        order = [F("for_exam").desc(nulls_last=True), *order]
    reviews = list(qs.order_by(*order)[:limit])
    for review in reviews:
        review.excerpt = excerpt(review.body)
    return reviews


def excerpt(text: str, limit: int = TESTIMONIAL_MAX_CHARS) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0] or text[:limit]
    return f"{cut}…"


def get_home_data(exam_type: str | None = None) -> dict:
    """Homepage data; ``exam_type`` (slug) narrows rails and the countdown to that exam.

    Unknown or inactive slugs are ignored (``selected_exam_type`` is ``None``).
    """
    selected = resolve_exam_type(exam_type)
    slug = selected.slug if selected else None
    books = Book.objects.all()
    if selected is not None:
        books = books.filter(exam_types=selected)

    next_exam = None
    if selected is not None:
        next_exam = upcoming_exam_events().filter(exam_type=selected).first()
        exam_year = current_exam_year()
    if next_exam is None:
        next_exam = upcoming_exam_events().first()
    if selected is None:
        # The unfiltered next exam is what ``current_exam_year`` would look up anyway.
        exam_year = jalali_year(next_exam.date if next_exam else timezone.localdate())

    banners = list(Banner.objects.filter(is_active=True).order_by("order", "id"))
    return {
        "selected_exam_type": selected,
        "next_exam": next_exam,
        "exam_types": list(ExamType.objects.filter(is_active=True).order_by("order", "id")),
        "subjects": subjects_with_weight(selected),
        "categories": active_category_tree(),
        "hero_banners": [b for b in banners if b.placement == Banner.Placement.HERO],
        "course_banners": [b for b in banners if b.placement == Banner.Placement.COURSE],
        # Out-of-stock books live in their own rail (with "notify me"), not among bestsellers.
        "bestsellers": list(
            book_card_queryset(books, exam_type=slug)
            .filter(has_stock=True)
            .order_by(F("sales_count").desc(), "id")[:RAIL_SIZE]
        ),
        # In-stock quick reviews first; sold-out ones keep their notify-me button at the end.
        "quick_review": list(
            book_card_queryset(books.filter(is_quick_review=True), exam_type=slug).order_by(
                F("has_stock").desc(), "-sales_count", "id"
            )[:RAIL_SIZE]
        ),
        "discounted": discounted_books(books, exam_type=slug),
        "testimonials": testimonials(selected),
        "featured_course": exposed_courses().order_by("order", "id").first(),
        "guide_videos": list(
            GuideVideo.objects.filter(is_active=True)
            .select_related("subject", "exam_type")
            .order_by("order", "id")[:GUIDE_VIDEO_LIMIT]
        ),
        "store": get_store_settings(),
        # Not serialised: passed to the serializer context for ``edition_badge``.
        "current_exam_year": exam_year,
    }
