"""Aggregate everything the homepage needs in one call."""

from django.db.models import Count, F, Q
from django.utils import timezone

from apps.content.models import Banner, GuideVideo
from apps.core.jalali import jalali_year
from apps.core.services.store_settings import get_store_settings

from ..models import Book, ExamEvent, ExamType, StudyKitRecommendation, Subject
from .books import active_category_tree, book_card_queryset
from .courses import exposed_courses
from .editions import current_exam_year

RAIL_SIZE = 12
GUIDE_VIDEO_LIMIT = 6


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
        "quick_review": list(
            book_card_queryset(books.filter(is_quick_review=True), exam_type=slug).order_by(
                "-sales_count", "id"
            )[:RAIL_SIZE]
        ),
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
