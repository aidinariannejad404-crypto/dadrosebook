"""Aggregate everything the homepage needs in one call."""

from django.db.models import Count, Q
from django.utils import timezone

from apps.content.models import Banner, GuideVideo

from ..models import Book, ExamEvent, ExamType, RelatedCourse, Subject
from .books import active_category_tree, book_card_queryset

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


def get_home_data() -> dict:
    banners = list(Banner.objects.filter(is_active=True).order_by("order", "id"))
    return {
        "next_exam": upcoming_exam_events().first(),
        "exam_types": list(ExamType.objects.filter(is_active=True).order_by("order", "id")),
        "subjects": list(subjects_with_book_count()),
        "categories": active_category_tree(),
        "hero_banners": [b for b in banners if b.placement == Banner.Placement.HERO],
        "course_banners": [b for b in banners if b.placement == Banner.Placement.COURSE],
        # Out-of-stock books live in their own rail (with "notify me"), not among bestsellers.
        "bestsellers": list(
            book_card_queryset().filter(has_stock=True).order_by("-sales_count", "id")[:RAIL_SIZE]
        ),
        "quick_review": list(
            book_card_queryset(Book.objects.filter(is_quick_review=True)).order_by(
                "-sales_count", "id"
            )[:RAIL_SIZE]
        ),
        "featured_course": RelatedCourse.objects.filter(is_active=True)
        .order_by("order", "id")
        .first(),
        "guide_videos": list(
            GuideVideo.objects.filter(is_active=True)
            .select_related("subject", "exam_type")
            .order_by("order", "id")[:GUIDE_VIDEO_LIMIT]
        ),
    }
