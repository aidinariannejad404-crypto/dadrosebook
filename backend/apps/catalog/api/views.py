from django.conf import settings
from django.core.cache import cache
from django.db.models import Prefetch
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import generics
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Book, BookSamplePage, Category, ExamEvent, ExamType, RelatedCourse
from ..services.books import active_category_tree, book_card_queryset
from ..services.courses import course_links_queryset, exposed_courses
from ..services.exam_calendar import EXAM, KINDS, NoRegistrationWindow, build_ics
from ..services.facets import book_facets
from ..services.home import get_home_data, subjects_with_book_count, upcoming_exam_events
from ..services.related import related_books
from ..services.search import search_books_relaxed, should_relax
from ..services.search_zero_state import search_zero_state
from ..services.study_kits import kit_placements, study_kits
from ..services.suggest import (
    DISCOVERY_CACHE_SECONDS,
    normalize_query,
    search_suggestions,
    suggest_cache_key,
)
from . import serializers as s
from .filters import BookFilter, _multi


def get_or_404(queryset, message: str, **lookup):
    obj = queryset.filter(**lookup).first()
    if obj is None:
        raise NotFound(message)
    return obj


BOOK_NOT_FOUND = "کتاب پیدا نشد."
CATEGORY_NOT_FOUND = "دسته‌بندی پیدا نشد."


def selected_exam_type(request) -> str | None:
    """The one ``?exam_type=`` slug that selects ``kit_role``; None when absent or several."""
    slugs = _multi(request.query_params, "exam_type")
    return slugs[0] if len(slugs) == 1 else None


# cache_page keys on the full URL, so every ``?exam_type=`` value is cached separately.
@method_decorator(cache_page(settings.HOME_CACHE_SECONDS), name="get")
class HomeView(APIView):
    def get(self, request):
        data = get_home_data(exam_type=selected_exam_type(request))
        context = {"request": request, "current_exam_year": data["current_exam_year"]}
        return Response(s.HomeSerializer(data, context=context).data)


class BookListView(generics.ListAPIView):
    """Book cards; a multi-token ``q`` with no hits falls back to any-token matching.

    The fallback is flagged with the ``X-Search-Relaxed: 1`` response header.
    """

    serializer_class = s.BookCardSerializer
    filterset_class = BookFilter

    def get_queryset(self):
        return book_card_queryset(exam_type=selected_exam_type(self.request))

    def filter_queryset(self, queryset):
        filtered = super().filter_queryset(queryset)
        self.search_relaxed = False
        q = self.request.query_params.get("q")
        if should_relax(q) and not filtered.exists():
            params = self.request.query_params.copy()
            params.pop("q")
            base = BookFilter(data=params, queryset=queryset, request=self.request).qs
            filtered = search_books_relaxed(base, q)
            self.search_relaxed = True
        return filtered

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if getattr(self, "search_relaxed", False):
            response["X-Search-Relaxed"] = "1"
        return response


@method_decorator(cache_page(DISCOVERY_CACHE_SECONDS), name="get")
class BookFacetsView(APIView):
    """Facet counts for the list's filters (cached per full URL)."""

    def get(self, request):
        return Response(book_facets(request.query_params))


class SearchSuggestView(APIView):
    """Header autocomplete, cached per normalised query."""

    def get(self, request):
        q = normalize_query(request.query_params.get("q"))
        key = suggest_cache_key(q)
        data = cache.get(key)
        if data is None:
            data = s.serialize_suggestions(search_suggestions(q), context={"request": request})
            cache.set(key, data, DISCOVERY_CACHE_SECONDS)
        return Response(data)


class BookDetailView(generics.RetrieveAPIView):
    serializer_class = s.BookDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return book_card_queryset(
            Book.objects.select_related("publisher"), exam_type=selected_exam_type(self.request)
        ).prefetch_related(
            "translators",
            "categories",
            Prefetch("sample_pages", queryset=BookSamplePage.objects.order_by("order", "id")),
            Prefetch(
                "course_links", queryset=course_links_queryset(), to_attr="exposed_course_links"
            ),
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["exam_type"] = selected_exam_type(self.request)
        if getattr(self, "_book", None) is not None:
            context["kit_placements"] = kit_placements(self._book)
        return context

    def get_object(self):
        return get_or_404(self.get_queryset(), BOOK_NOT_FOUND, slug=self.kwargs["slug"])

    def retrieve(self, request, *args, **kwargs):
        self._book = self.get_object()
        return Response(self.get_serializer(self._book).data)


class RelatedBooksView(APIView):
    def get(self, request, slug):
        book = get_or_404(Book.objects.all(), BOOK_NOT_FOUND, slug=slug, is_active=True)
        # ``?in_stock=true`` is still accepted (P1-8 clients); related books are always in stock.
        books = related_books(book, exam_type=selected_exam_type(request))
        return Response(s.BookCardSerializer(books, many=True, context={"request": request}).data)


class SubjectListView(generics.ListAPIView):
    serializer_class = s.SubjectWithCountSerializer
    pagination_class = None

    def get_queryset(self):
        return subjects_with_book_count()


class ExamTypeListView(generics.ListAPIView):
    serializer_class = s.ExamTypeMiniSerializer
    pagination_class = None

    def get_queryset(self):
        return ExamType.objects.filter(is_active=True).order_by("order", "id")


class CategoryTreeView(APIView):
    def get(self, request):
        return Response(s.CategoryNodeSerializer(active_category_tree(), many=True).data)


class CategoryDetailView(APIView):
    def get(self, request, slug):
        category = get_or_404(
            Category.objects.select_related("parent"), CATEGORY_NOT_FOUND, slug=slug, is_active=True
        )
        all_active = list(Category.objects.filter(is_active=True).order_by("order", "id"))
        node = _subtree(category, all_active)
        return Response(s.CategoryDetailSerializer().to_representation(node))


def _subtree(root: Category, categories: list[Category]) -> dict:
    by_parent: dict[int, list[Category]] = {}
    for c in categories:
        if c.parent_id:
            by_parent.setdefault(c.parent_id, []).append(c)

    def build(cat: Category) -> dict:
        return {"category": cat, "children": [build(ch) for ch in by_parent.get(cat.id, [])]}

    return build(root)


class ExamEventListView(generics.ListAPIView):
    serializer_class = s.ExamEventSerializer
    pagination_class = None

    def get_queryset(self):
        return upcoming_exam_events()


# --- ux stream: ج۵ add-to-calendar, ج۳ search zero state ---------------------------------------
class ExamEventCalendarView(APIView):
    """``GET exam-events/<id>/calendar.ics?kind=exam|registration`` → an all-day ``.ics``."""

    def get(self, request, pk: int):
        event = get_or_404(
            ExamEvent.objects.select_related("exam_type").filter(
                is_active=True, exam_type__is_active=True
            ),
            "تاریخ آزمون پیدا نشد.",
            pk=pk,
        )
        kind = request.query_params.get("kind") or EXAM
        if kind not in KINDS:
            kind = EXAM
        try:
            body = build_ics(event, kind)
        except NoRegistrationWindow as exc:
            raise NotFound("برای این آزمون مهلت ثبت‌نام ثبت نشده است.") from exc
        response = HttpResponse(body, content_type="text/calendar; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="dadrose-{kind}-{event.pk}.ics"'
        response["Cache-Control"] = "public, max-age=3600"
        return response


class SearchZeroStateView(APIView):
    """``GET search/zero-state/?exam=<slug>`` — popular books and subject shortcuts for the empty
    search box (recent searches stay in the browser)."""

    def get(self, request):
        exam = (request.query_params.get("exam") or "").strip()[:80] or None
        key = f"catalog:search-zero:{exam or '-'}"
        data = cache.get(key)
        if data is None:
            data = s.SearchZeroStateSerializer(search_zero_state(exam)).data
            cache.set(key, data, DISCOVERY_CACHE_SECONDS)
        return Response(data)


# --- end ux stream --------------------------------------------------------------------------------


class StudyKitListView(APIView):
    def get(self, request):
        kits = study_kits(
            exam_type=request.query_params.get("exam_type") or None,
            subjects=_multi(request.query_params, "subject"),
        )
        return Response(s.StudyKitSerializer(kits, many=True, context={"request": request}).data)


class CourseListView(APIView):
    """Exposed academy courses; ``subject``/``exam_type`` (slugs) and ``course_type`` filters."""

    def get(self, request):
        params = request.query_params
        qs = exposed_courses()
        subjects = _multi(params, "subject")
        if subjects:
            qs = qs.filter(subject__slug__in=subjects)
        exam_types = _multi(params, "exam_type")
        if exam_types:
            qs = qs.filter(exam_types__slug__in=exam_types)
        valid_types = set(RelatedCourse.CourseType.values)
        types = [t.upper() for t in _multi(params, "course_type") if t.upper() in valid_types]
        if types:
            qs = qs.filter(course_type__in=types)
        courses = qs.distinct().order_by("order", "id")
        return Response(s.CourseSerializer(courses, many=True, context={"request": request}).data)
